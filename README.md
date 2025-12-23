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

The server runs three services:
- **gRPC server** (live chat) listens on `[::1]:50051` by default
- **REST server** (videos API) listens on `[::1]:8080` by default
- **Health check endpoint** listens on `[::1]:8081` by default (always accessible without TLS)

#### Configuration

You can configure the bind addresses and authentication using environment variables:

```bash
GRPC_BIND_ADDRESS="0.0.0.0:50051" REST_BIND_ADDRESS="0.0.0.0:8080" HEALTH_BIND_ADDRESS="0.0.0.0:8081" cargo run -p server
```

**Health Check Endpoint:**

The server provides a simple health check endpoint at `/healthz` that returns "OK" when the server is running. This endpoint always runs without TLS, even when TLS is enabled for the main endpoints, making it suitable for container health checks and load balancers.

```bash
curl http://localhost:8081/healthz
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

**TLS Support:**

The server supports TLS encryption for both gRPC and REST endpoints.

Configure TLS by providing certificate and key file paths via environment variables:

```bash
TLS_CERT_PATH=/path/to/cert.pem TLS_KEY_PATH=/path/to/key.pem cargo run -p server
```

Both environment variables must be set for TLS to be enabled. When TLS is enabled, the server will use HTTPS for REST endpoints and TLS for gRPC endpoints.

**Generating Certificates with CA for Development:**

For development and testing purposes, you can generate a CA certificate and server certificate using OpenSSL:

1. Generate CA private key and certificate:
   ```bash
   # Generate CA private key
   openssl genrsa -out ca.key 4096
   
   # Generate CA certificate
   openssl req -x509 -new -nodes -key ca.key -sha256 -days 365 -out ca.crt \
     -subj "/C=US/ST=State/L=City/O=Development/CN=Development CA"
   ```

2. Generate server private key and certificate signed by CA:
   ```bash
   # Generate server private key
   openssl genrsa -out server.key 4096
   
   # Generate server certificate signing request
   openssl req -new -key server.key -out server.csr \
     -subj "/C=US/ST=State/L=City/O=Development/CN=localhost"
   
   # Create OpenSSL config for Subject Alternative Names
   cat > server.ext << EOF
   authorityKeyIdentifier=keyid,issuer
   basicConstraints=CA:FALSE
   keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
   subjectAltName = @alt_names
   
   [alt_names]
   DNS.1 = localhost
   IP.1 = 127.0.0.1
   IP.2 = ::1
   EOF
   
   # Sign server certificate with CA
   openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
     -out server.crt -days 365 -sha256 -extfile server.ext
   
   # Clean up temporary files
   rm server.csr server.ext ca.srl
   ```

3. This creates four files:
   - `ca.crt` - CA certificate (use with `--cacert` or install at system level)
   - `ca.key` - CA private key (keep secure)
   - `server.crt` - Server certificate
   - `server.key` - Server private key (unencrypted for development convenience)

4. Run the server with TLS:
   ```bash
   TLS_CERT_PATH=./server.crt TLS_KEY_PATH=./server.key cargo run -p server
   ```

**Important:** These certificates are only for development/testing. For production, use certificates from a trusted Certificate Authority (CA).

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

**With TLS (when native TLS is enabled):**

For REST API with TLS:
```bash
curl --cacert ca.crt "https://localhost:8080/youtube/v3/videos?part=liveStreamingDetails&id=test-video-1"
```

For gRPC with TLS:
```bash
grpcurl -cacert ca.crt localhost:50051 list
```

Note: The `--cacert` flag specifies the CA certificate to verify the server's certificate. For development with a custom CA, use the generated `ca.crt` file. In production with proper CA-signed certificates, use the CA's root certificate.

**Installing Development CA at System Level (Optional):**

For development environments, you can install the CA certificate at the system level to avoid specifying `--cacert` in every command. This allows client applications to use TLS without modifying code to load custom certificates:

- **Ubuntu/Debian:**
  ```bash
  sudo cp ca.crt /usr/local/share/ca-certificates/dev-ca.crt
  sudo update-ca-certificates
  ```

- **macOS:**
  ```bash
  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ca.crt
  ```

- **Windows (Administrator PowerShell):**
  ```powershell
  Import-Certificate -FilePath ca.crt -CertStoreLocation Cert:\LocalMachine\Root
  ```

After installing the CA certificate, you can use curl/grpcurl without the `--cacert` flag, and client applications will automatically trust the server certificate.

**Warning:** Only install development CA certificates on development machines. Remove them when no longer needed.

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

**DateTime Handling:**

All datetime fields (`publishedAt`, `actualStartTime`, `actualEndTime`, `scheduledStartTime`, `scheduledEndTime`) must be in ISO8601 format (e.g., `2024-01-01T00:00:00Z`). 

- If `publishedAt` is omitted when creating a video or chat message, it defaults to the current datetime.
- Optional datetime fields (`actualStartTime`, `actualEndTime`, etc.) can be omitted or set to `null`.
- Invalid datetime formats will result in a deserialization error.

Example with default datetime:
```bash
curl -X POST http://localhost:8080/control/videos \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-video-id",
    "channelId": "my-channel-id",
    "title": "My Video Title",
    "description": "My video description",
    "channelTitle": "My Channel",
    "liveChatId": "my-chat-id"
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
