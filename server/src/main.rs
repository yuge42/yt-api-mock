use live_chat_service::{create_service, proto::FILE_DESCRIPTOR_SET};
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

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let grpc_bind_address =
        std::env::var("GRPC_BIND_ADDRESS").unwrap_or_else(|_| "[::1]:50051".to_string());
    let rest_bind_address =
        std::env::var("REST_BIND_ADDRESS").unwrap_or_else(|_| "[::1]:8080".to_string());

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

    // Create the centralized datastore
    let repo: Arc<dyn datastore::Repository> = Arc::new(datastore::InMemoryRepository::new());

    // Create gRPC service for live chat with shared datastore
    let grpc_service = create_service(Arc::clone(&repo));
    let reflection_service = tonic_reflection::server::Builder::configure()
        .register_encoded_file_descriptor_set(FILE_DESCRIPTOR_SET)
        .build_v1()?;

    // Create REST service for videos API with shared datastore
    let rest_app = video_service::create_router(Arc::clone(&repo));

    println!("gRPC server (live chat) listening on {}", grpc_addr);
    println!("REST server (videos API) listening on {}", rest_addr);

    // Run both servers concurrently
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
    }

    Ok(())
}
