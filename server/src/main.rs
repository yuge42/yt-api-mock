use live_chat_service::{create_service, proto::FILE_DESCRIPTOR_SET};
use tonic::transport::Server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let addr = "[::1]:50051".parse()?;
    let service = create_service();
    let reflection_service = tonic_reflection::server::Builder::configure()
        .register_encoded_file_descriptor_set(FILE_DESCRIPTOR_SET)
        .build_v1()?;

    println!("Server listening on {}", addr);

    Server::builder()
        .add_service(service)
        .add_service(reflection_service)
        .serve(addr)
        .await?;

    Ok(())
}
