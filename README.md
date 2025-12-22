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

Start the server using cargo:

```bash
cargo run -p server
```

The server runs two services:
- **gRPC server** (live chat) listens on `[::1]:50051` by default
- **REST server** (videos API) listens on `[::1]:8080` by default

#### Configuration

You can configure the bind addresses and authentication using environment variables:

```bash
GRPC_BIND_ADDRESS="0.0.0.0:50051" REST_BIND_ADDRESS="0.0.0.0:8080" cargo run -p server
```

**Optional Authentication:**

By default, the server does not require authentication. You can enable authentication checks using the `REQUIRE_AUTH` environment variable:

```bash
REQUIRE_AUTH=true cargo run -p server
```

When authentication is enabled:
- **REST API** requires either:
  - `key` query parameter (API key), or
  - `Authorization` header (OAuth 2.0)
- **gRPC API** requires either:
  - `x-goog-api-key` metadata (API key), or
  - `authorization` metadata (OAuth 2.0)

Note: The server only checks for the presence of these credentials, not their validity.

**Chat Stream Timeout:**

By default, the chat stream connection is kept alive indefinitely and will push new messages to clients as they are added. You can configure a timeout using the `CHAT_STREAM_TIMEOUT` environment variable (in seconds):

```bash
CHAT_STREAM_TIMEOUT=30 cargo run -p server
```

- If not set or set to `0`, the connection will be kept alive indefinitely and new messages will be pushed to the client as they arrive
- If set to a positive number, the connection will be closed after the specified number of seconds

### Verification

You can verify the server using `curl` for REST endpoints and `grpcurl` for gRPC endpoints.

**Get video with Live Chat ID (REST):**

```bash
curl "http://localhost:8080/youtube/v3/videos?part=liveStreamingDetails&id=test-video-1"
```

**With API key (when authentication is enabled):**

```bash
curl "http://localhost:8080/youtube/v3/videos?part=liveStreamingDetails&id=test-video-1&key=YOUR_API_KEY"
```

**With OAuth 2.0 token (when authentication is enabled):**

```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" "http://localhost:8080/youtube/v3/videos?part=liveStreamingDetails&id=test-video-1"
```

**Stream chat messages (gRPC):**

```bash
grpcurl -plaintext -d '{"live_chat_id": "live-chat-id-1", "part": ["snippet", "authorDetails"]}' localhost:50051 youtube.api.v3.V3DataLiveChatMessageService/StreamList
```

**With API key metadata (when authentication is enabled):**

```bash
grpcurl -plaintext -H "x-goog-api-key: YOUR_API_KEY" -d '{"live_chat_id": "live-chat-id-1", "part": ["snippet", "authorDetails"]}' localhost:50051 youtube.api.v3.V3DataLiveChatMessageService/StreamList
```

**With OAuth 2.0 token metadata (when authentication is enabled):**

```bash
grpcurl -plaintext -H "authorization: Bearer YOUR_ACCESS_TOKEN" -d '{"live_chat_id": "live-chat-id-1", "part": ["snippet", "authorDetails"]}' localhost:50051 youtube.api.v3.V3DataLiveChatMessageService/StreamList
```

**List gRPC services:**

```bash
grpcurl -plaintext localhost:50051 list
```

## Features

### Videos API (REST)

The server provides a mock implementation of the YouTube Data API `videos.list` endpoint via REST:
- Retrieve video information including live streaming details
- Get the `activeLiveChatId` for live videos
- Compatible with the real YouTube API REST request/response format
- Access via HTTP GET at `/youtube/v3/videos`

### Live Chat Streaming (gRPC)

Stream live chat messages using the Live Chat ID obtained from the videos.list endpoint:
- Real-time message streaming via gRPC
- Includes message snippets and author details
- Follows YouTube's live chat message format
- Compatible with gRPC clients

### Control Endpoints (REST)

The server provides control endpoints for dynamically creating videos and chat messages during testing:

**Create a new video:**
```bash
curl -X POST http://localhost:8080/control/videos \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-video-id",
    "channelId": "my-channel-id",
    "title": "My Video Title",
    "description": "My video description",
    "channelTitle": "My Channel",
    "publishedAt": "2024-01-01T00:00:00Z",
    "liveChatId": "my-chat-id",
    "actualStartTime": "2024-01-01T00:00:00Z",
    "concurrentViewers": 100
  }'
```

**Create a new chat message:**
```bash
curl -X POST http://localhost:8080/control/chat_messages \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-message-id",
    "liveChatId": "my-chat-id",
    "authorChannelId": "author-channel-id",
    "authorDisplayName": "Author Name",
    "messageText": "Hello world!",
    "publishedAt": "2024-01-01T00:00:00Z",
    "isVerified": true
  }'
```

These endpoints are useful for:
- Setting up test scenarios with custom data
- Creating videos and messages on-demand during integration tests
- Simulating different chat configurations without modifying server code

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
