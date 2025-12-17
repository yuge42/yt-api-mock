# YouTube API Mock

Development mock for the YouTube Data API.

## Usage

### Cloning the repository

To clone the repository including the `proto` submodule:

```bash
git clone --recursive https://github.com/yuge42/yt-api-mock.git
```

If you have already cloned the repository, you can initialize and update the submodule with:

```bash
git submodule update --init --recursive
```

### Running the Server

Start the gRPC server using cargo:

```bash
cargo run -p server
```

The server listens on `[::1]:50051` by default.

#### Configuration

You can configure the bind address using the `BIND_ADDRESS` environment variable:

```bash
BIND_ADDRESS="0.0.0.0:50051" cargo run -p server
```

### Verification

You can verify the server using `grpcurl`.

**List services:**

```bash
grpcurl -plaintext localhost:50051 list
```

**Stream chat messages:**

```bash
grpcurl -plaintext localhost:50051 youtube.api.v3.V3DataLiveChatMessageService/StreamList
```

### Testing

Scenario tests are available in the `tests/` directory using Gauge with JavaScript.

See the [tests/README.md](tests/README.md) for details on running the tests.

Quick start:
```bash
cd tests
npm install
npm test
```

## License

Licensed under either of

* Apache License, Version 2.0, ([LICENSE-APACHE](LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
* MIT license ([LICENSE-MIT](LICENSE-MIT) or http://opensource.org/licenses/MIT)

at your option.

### Proto Submodule License

The `proto` submodule ([yt-api-proto](https://github.com/yuge42/yt-api-proto)) is licensed under the Apache License, Version 2.0 only. This submodule contains protocol buffer definitions based on Google's YouTube Live Chat API documentation.

**Important:** Binaries distributed from this project will include work derived from the proto definitions in the submodule, which are subject to the Apache License 2.0.

### External Dependencies

Some external dependencies may carry additional copyright notices and license terms.
When building and distributing binaries, those external library licenses may be included.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in the work by you, as defined in the Apache-2.0 license, shall be
dual licensed as above, without any additional terms or conditions.
