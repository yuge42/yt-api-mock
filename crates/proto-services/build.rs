use std::{env, path::PathBuf};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR")?);
    let proto_dir = manifest_dir.join("../../proto");
    let proto_files = [proto_dir.join("helloworld.proto")];
    let out_dir = PathBuf::from(env::var("OUT_DIR")?);
    let descriptor_path = out_dir.join("helloworld_descriptor.bin");

    tonic_build::configure()
        .build_server(true)
        .file_descriptor_set_path(&descriptor_path)
        .compile_protos(&proto_files, &[proto_dir.clone()])?;

    println!("cargo:rerun-if-changed={}", proto_dir.display());
    for proto in proto_files {
        println!("cargo:rerun-if-changed={}", proto.display());
    }
    Ok(())
}
