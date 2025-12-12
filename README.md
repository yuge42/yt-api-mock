# rs-template

## Prerequisites

- `protoc` (Protocol Buffers compiler) is required for generating gRPC code. Install via your OS package manager (e.g. Debian/Ubuntu: `apt-get install protobuf-compiler`, macOS: `brew install protobuf`, Windows: download a release from https://github.com/protocolbuffers/protobuf/releases). If `protoc` is installed but not on `PATH`, set `PROTOC` to the binary path before building.
- (Optional) `grpcurl` for quick gRPC calls. Install via package manager (`brew install grpcurl`, `go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest`, or download a release from https://github.com/fullstorydev/grpcurl/releases).

### Quick gRPC call example

Start the server (`cargo run -p server`), then from another shell:

```sh
grpcurl -plaintext -d '{"name":"World"}' localhost:50051 helloworld.v1.Greeter/SayHello
```

Reflection is enabled on the server, so the above command works without local proto files.

## License

Licensed under either of

* Apache License, Version 2.0, ([LICENSE-APACHE](LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
* MIT license ([LICENSE-MIT](LICENSE-MIT) or http://opensource.org/licenses/MIT)

at your option.

Some external dependencies may carry additional copyright notices and license terms.
When building and distributing binaries, those external library licenses may be included.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in the work by you, as defined in the Apache-2.0 license, shall be
dual licensed as above, without any additional terms or conditions.
