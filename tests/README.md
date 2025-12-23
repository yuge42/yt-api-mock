# YouTube API Mock - Scenario Tests

This directory contains scenario tests for the YouTube API mock server using [Gauge](https://gauge.org/) with JavaScript.

## Overview

The tests verify the YouTube Live Chat streaming service using a gRPC client generated from the protocol buffer definitions. This is similar to the [stream_list_demo.py](https://developers.google.com/youtube/v3/live/streaming-live-chat) example provided in Google's official documentation, but implemented as automated scenario tests.

## Quick Start with Docker (Recommended)

The easiest way to run tests without installing dependencies locally:

```bash
cd tests
docker compose up --build --abort-on-container-exit
```

Or using the Makefile:

```bash
cd tests
make docker-test
```

## Prerequisites (for local setup)

- Node.js (v14 or later)
- Gauge test framework
- Protobuf compiler (protoc) - installed automatically via grpc-tools
- **The mock server must be running** before executing tests

The JavaScript plugin for Gauge should be installed. If not, run:
```bash
gauge install js
```

## Setup (for local development)

1. Install dependencies:
```bash
cd tests
npm install
```

2. Generate the gRPC client code from proto files (if needed):
```bash
npm run proto:generate
```

Note: The generated proto files are gitignored and will be regenerated automatically when needed.

## Running Tests

### Docker Approach (Recommended)

Run core tests using Docker Compose:

```bash
cd tests
docker compose up --build --abort-on-container-exit --exit-code-from tests
```

Or using the Makefile for convenience:

```bash
cd tests
make docker-test
```

This will:
- Build the mock server Docker image
- Build the test environment Docker image with Gauge and Node.js
- Start the mock server with health checks
- Wait for the server to be healthy
- Run the Gauge core scenario tests (tagged with "core")
- Stop all containers when tests complete
- Exit with the test container's exit code

### Manual Approach

1. **Start the mock server** in a separate terminal:
```bash
# From the project root
cargo run -p server
```

2. Run the tests in another terminal:
```bash
cd tests
npm test
```

Or run using gauge directly:
```bash
gauge run specs/
```

### Running Tests with Tags

Tests are organized with tags for selective execution:
- `core` - Core functionality tests (run without REQUIRE_AUTH)
- `auth` - Authorization tests (require REQUIRE_AUTH=true)
- `tls` - TLS encryption tests (require TLS_CERT_PATH and TLS_KEY_PATH)
- `rest` - REST API tests
- `grpc` - gRPC API tests

Run specific tags:
```bash
# Run only core tests
gauge run --tags "core" specs/

# Run only auth tests (requires REQUIRE_AUTH=true)
gauge run --tags "auth" specs/

# Run all REST tests
gauge run --tags "rest" specs/

# Run TLS tests (requires TLS enabled)
gauge run --tags "tls" specs/
```

### Running Authorization Tests

Authorization tests require the server to run with `REQUIRE_AUTH=true`. 

**Using Docker Compose (Recommended):**
```bash
cd tests
docker compose -f docker-compose.yml -f docker-compose.auth.yml up --build --abort-on-container-exit
```

**Manual approach:**
```bash
# Terminal 1: Start server with auth enabled
REQUIRE_AUTH=true cargo run -p server

# Terminal 2: Run auth tests
cd tests
gauge run --tags "auth" specs/
```

### Running TLS Tests

TLS tests verify the server's TLS encryption support for both REST and gRPC endpoints.

**Using Docker Compose (Recommended):**

1. Generate test certificates:
   ```bash
   cd tests
   ./generate-tls-certs.sh
   ```

2. Run TLS tests:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.tls.yml up --build --abort-on-container-exit
   ```

**Manual approach:**

1. Generate test certificates (from project root):
   ```bash
   openssl req -x509 -newkey rsa:4096 -nodes \
     -keyout server.key \
     -out server.crt \
     -days 365 \
     -subj "/C=US/ST=State/L=City/O=Development/CN=localhost" \
     -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1"
   ```

2. Start server with TLS:
   ```bash
   TLS_CERT_PATH=./server.crt TLS_KEY_PATH=./server.key cargo run -p server
   ```

3. Run TLS tests:
   ```bash
   cd tests
   GRPC_SERVER_ADDRESS=localhost:50051 REST_SERVER_ADDRESS=https://localhost:8080 gauge run --tags "tls" specs/
   ```

## Test Structure

- `specs/` - Contains Gauge specification files (`.spec`)
  - `stream_list.spec` - Tests for the StreamList gRPC streaming endpoint (Tags: core, grpc)
  - `videos_list.spec` - Tests for the Videos List REST endpoint (Tags: core, rest)
  - `auth_rest.spec` - Authorization tests for REST API (Tags: auth, rest)
  - `auth_grpc.spec` - Authorization tests for gRPC API (Tags: auth, grpc)
  - `tls.spec` - TLS encryption tests for both REST and gRPC (Tags: tls, rest, grpc)
- `tests/` - Contains step implementation files
  - `step_implementation.js` - JavaScript implementation of test steps
- `proto-gen/` - Generated gRPC client code (auto-generated, gitignored)
- `docker-compose.yml` - Base docker-compose configuration
- `docker-compose.auth.yml` - Override for authorization tests (sets REQUIRE_AUTH=true)

## What the Tests Cover

The scenario tests verify:
1. Connecting to the gRPC server
2. Sending a StreamList request with parameters
3. Receiving a stream of live chat messages
4. Verifying the structure and content of responses
5. Checking that each message has author details
6. Proper cleanup of client connections

**Note**: Server lifecycle management (startup/shutdown) is handled externally and is not part of the test steps.

## Test Reports

After running tests, HTML reports are generated in:
```
reports/html-report/index.html
```

## Dependencies

- `@grpc/grpc-js` - gRPC client library
- `@grpc/proto-loader` - Proto file loader
- `grpc-tools` - Tools for code generation from proto files
- `google-protobuf` - Protocol Buffers runtime library

## Reference

This implementation is based on the streaming demo from Google's YouTube API documentation:
https://developers.google.com/youtube/v3/live/streaming-live-chat
