use live_chat_service::{create_service, proto::FILE_DESCRIPTOR_SET};
use std::time::SystemTime;
use tonic::transport::Server;
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
    let addr = "[::1]:50051".parse()?;
    let service = create_service();
    let reflection_service = tonic_reflection::server::Builder::configure()
        .register_encoded_file_descriptor_set(FILE_DESCRIPTOR_SET)
        .build_v1()?;

    println!("Server listening on {}", addr);

    Server::builder()
        .layer(ServiceBuilder::new().layer(LogLayer))
        .add_service(service)
        .add_service(reflection_service)
        .serve(addr)
        .await?;

    Ok(())
}
