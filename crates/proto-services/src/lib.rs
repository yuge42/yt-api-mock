use tonic::{Request, Response, Status};

pub mod proto {
    tonic::include_proto!("helloworld.v1");
}

#[derive(Debug, Default)]
pub struct GreeterService;

pub const FILE_DESCRIPTOR_SET: &[u8] =
    include_bytes!(concat!(env!("OUT_DIR"), "/helloworld_descriptor.bin"));

#[tonic::async_trait]
impl proto::greeter_server::Greeter for GreeterService {
    async fn say_hello(
        &self,
        request: Request<proto::HelloRequest>,
    ) -> Result<Response<proto::HelloReply>, Status> {
        let name = request.into_inner().name;
        let reply = proto::HelloReply {
            message: format!("Hello, {name}!"),
        };

        Ok(Response::new(reply))
    }
}

/// Helper to construct the Greeter gRPC service with the default implementation.
pub fn greeter_server() -> proto::greeter_server::GreeterServer<GreeterService> {
    proto::greeter_server::GreeterServer::new(GreeterService::default())
}

/// Reflection service for grpcurl / tooling.
pub fn reflection_service() -> Result<
    tonic_reflection::server::ServerReflectionServer<impl tonic_reflection::server::ServerReflection>,
    tonic_reflection::server::Error,
> {
    tonic_reflection::server::Builder::configure()
        .register_encoded_file_descriptor_set(FILE_DESCRIPTOR_SET)
        .build_v1()
}
