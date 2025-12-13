use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let proto_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../proto");
    let root = proto_path.canonicalize().map_err(|e| {
        format!(
            "Failed to find proto directory at {:?}. \
             Make sure to initialize git submodules with: \
             git submodule update --init --recursive\nError: {}",
            proto_path, e
        )
    })?;
    let proto_file = root.join("stream_list.proto");

    let descriptor_path =
        PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("live_chat_service_descriptor.bin");

    tonic_prost_build::configure()
        .build_server(true)
        .build_client(false)
        .file_descriptor_set_path(&descriptor_path)
        .compile_protos(&[proto_file], &[root])?;
    Ok(())
}
