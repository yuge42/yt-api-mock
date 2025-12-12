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

The server listens on `[::1]:50051`.

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
