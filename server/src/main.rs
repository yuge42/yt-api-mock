use axum::Router;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::SystemTime;
use tonic::transport::Server as GrpcServer;
use tower::ServiceBuilder;

// Middleware to log access requests
#[derive(Clone)]
struct LogLayer;

impl<S> tower::Layer<S> for LogLayer {
    type Service = LogService<S>;

    fn layer(&self, service: S) -> Self::Service {
        LogService { inner: service }
    }
}

#[derive(Clone)]
struct LogService<S> {
    inner: S,
}

impl<S, B> tower::Service<http::Request<B>> for LogService<S>
where
    S: tower::Service<http::Request<B>> + Clone + Send + 'static,
    S::Future: Send + 'static,
    B: Send + 'static,
{
    type Response = S::Response;
    type Error = S::Error;
    type Future = std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<Self::Response, Self::Error>> + Send>,
    >;

    fn poll_ready(
        &mut self,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: http::Request<B>) -> Self::Future {
        let method = req.method().clone();
        let uri = req.uri().clone();
        let remote_addr = req.extensions().get::<std::net::SocketAddr>().copied();

        let timestamp = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        if let Some(addr) = remote_addr {
            println!("[{}] {} {} from {}", timestamp, method, uri, addr);
        } else {
            println!("[{}] {} {} from <unknown>", timestamp, method, uri);
        }

        Box::pin(self.inner.call(req))
    }
}

// Load TLS configuration from certificate and key files
fn load_tls_config(
    cert_path: PathBuf,
    key_path: PathBuf,
) -> Result<tonic::transport::ServerTlsConfig, Box<dyn std::error::Error>> {
    let cert = std::fs::read_to_string(&cert_path)
        .map_err(|e| format!("Failed to read certificate file {:?}: {}", cert_path, e))?;
    let key = std::fs::read_to_string(&key_path)
        .map_err(|e| format!("Failed to read key file {:?}: {}", key_path, e))?;

    let identity = tonic::transport::Identity::from_pem(cert, key);
    Ok(tonic::transport::ServerTlsConfig::new().identity(identity))
}

// Load rustls configuration for axum
async fn load_rustls_config(
    cert_path: PathBuf,
    key_path: PathBuf,
) -> Result<axum_server::tls_rustls::RustlsConfig, Box<dyn std::error::Error>> {
    Ok(axum_server::tls_rustls::RustlsConfig::from_pem_file(cert_path, key_path).await?)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Install the default crypto provider for rustls (required for TLS)
    // This is safe to call even if a provider is already installed
    let _ = rustls::crypto::ring::default_provider().install_default();

    let grpc_bind_address =
        std::env::var("GRPC_BIND_ADDRESS").unwrap_or_else(|_| "[::1]:50051".to_string());
    let rest_bind_address =
        std::env::var("REST_BIND_ADDRESS").unwrap_or_else(|_| "[::1]:8080".to_string());
    let health_bind_address =
        std::env::var("HEALTH_BIND_ADDRESS").unwrap_or_else(|_| "[::1]:8081".to_string());

    // TLS configuration (optional)
    let tls_cert_path = std::env::var("TLS_CERT_PATH").ok().map(PathBuf::from);
    let tls_key_path = std::env::var("TLS_KEY_PATH").ok().map(PathBuf::from);

    let use_tls = tls_cert_path.is_some() && tls_key_path.is_some();

    // Parse CHAT_STREAM_TIMEOUT environment variable
    // If not set or set to 0, the connection will be kept alive indefinitely
    // Otherwise, it should be a number of seconds
    let stream_timeout = std::env::var("CHAT_STREAM_TIMEOUT")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .filter(|&timeout| timeout > 0)
        .map(std::time::Duration::from_secs);

    let grpc_addr: std::net::SocketAddr = grpc_bind_address.parse().map_err(|e| {
        format!(
            "Failed to parse GRPC_BIND_ADDRESS '{}': {}",
            grpc_bind_address, e
        )
    })?;
    let rest_addr: std::net::SocketAddr = rest_bind_address.parse().map_err(|e| {
        format!(
            "Failed to parse REST_BIND_ADDRESS '{}': {}",
            rest_bind_address, e
        )
    })?;
    let health_addr: std::net::SocketAddr = health_bind_address.parse().map_err(|e| {
        format!(
            "Failed to parse HEALTH_BIND_ADDRESS '{}': {}",
            health_bind_address, e
        )
    })?;

    // Create the centralized datastore
    let repo: Arc<dyn datastore::Repository> = Arc::new(datastore::InMemoryRepository::new());

    // Create gRPC service for live chat with shared datastore
    let grpc_service = live_chat_service::create_service(Arc::clone(&repo), stream_timeout);
    let reflection_service = tonic_reflection::server::Builder::configure()
        .register_encoded_file_descriptor_set(live_chat_service::proto::FILE_DESCRIPTOR_SET)
        .build_v1()?;

    // Create REST service for videos API with shared datastore
    let video_router = video_service::create_router(Arc::clone(&repo));

    // Create control service for managing videos and chat messages
    let control_router = control_service::create_router(Arc::clone(&repo));

    // Nest routers under their respective paths to avoid conflicts
    let rest_app = Router::new()
        .nest("/youtube/v3", video_router)
        .nest("/control", control_router);

    // Create a simple health check endpoint (always runs without TLS)
    let health_app = Router::new().route("/healthz", axum::routing::get(|| async { "OK" }));

    if use_tls {
        println!("TLS enabled");
        println!(
            "gRPC server (live chat) listening on {} with TLS",
            grpc_addr
        );
        println!(
            "REST server (videos API) listening on {} with TLS",
            rest_addr
        );
        println!(
            "Health check endpoint listening on {} (no TLS)",
            health_addr
        );
    } else {
        println!("TLS disabled");
        println!("gRPC server (live chat) listening on {}", grpc_addr);
        println!("REST server (videos API) listening on {}", rest_addr);
        println!("Health check endpoint listening on {}", health_addr);
    }

    // Run both servers concurrently
    if use_tls {
        let cert_path =
            tls_cert_path.expect("TLS cert path should be present when use_tls is true");
        let key_path = tls_key_path.expect("TLS key path should be present when use_tls is true");

        // Load TLS config for gRPC
        let grpc_tls_config = load_tls_config(cert_path.clone(), key_path.clone())?;

        // Load TLS config for REST
        let rest_tls_config = load_rustls_config(cert_path, key_path).await?;

        tokio::select! {
            result = GrpcServer::builder()
                .tls_config(grpc_tls_config)?
                .layer(ServiceBuilder::new().layer(LogLayer))
                .add_service(grpc_service)
                .add_service(reflection_service)
                .serve(grpc_addr) => {
                result?;
            }
            result = axum_server::bind_rustls(rest_addr, rest_tls_config)
                .serve(rest_app.into_make_service()) => {
                result?;
            }
            result = axum::serve(
                tokio::net::TcpListener::bind(health_addr).await?,
                health_app
            ) => {
                result?;
            }
        }
    } else {
        tokio::select! {
            result = GrpcServer::builder()
                .layer(ServiceBuilder::new().layer(LogLayer))
                .add_service(grpc_service)
                .add_service(reflection_service)
                .serve(grpc_addr) => {
                result?;
            }
            result = axum::serve(
                tokio::net::TcpListener::bind(rest_addr).await?,
                rest_app
            ) => {
                result?;
            }
            result = axum::serve(
                tokio::net::TcpListener::bind(health_addr).await?,
                health_app
            ) => {
                result?;
            }
        }
    }

    Ok(())
}
