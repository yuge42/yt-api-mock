use std::net::SocketAddr;

use proto_services::{greeter_server, reflection_service};
use tonic::transport::Server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let addr: SocketAddr = "0.0.0.0:50051".parse()?;
    println!("gRPC server listening on {addr}");

    let reflection = reflection_service()?;

    Server::builder()
        .add_service(greeter_server())
        .add_service(reflection)
        .serve(addr)
        .await?;

    Ok(())
}
