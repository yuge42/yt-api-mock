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

For detailed Docker instructions, see [DOCKER.md](DOCKER.md).

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

See [DOCKER.md](DOCKER.md) for complete Docker instructions.

Quick command:
```bash
docker compose up --build --abort-on-container-exit
```

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

## Test Structure

- `specs/` - Contains Gauge specification files (`.spec`)
  - `stream_list.spec` - Tests for the StreamList gRPC streaming endpoint
- `tests/` - Contains step implementation files
  - `step_implementation.js` - JavaScript implementation of test steps
- `proto-gen/` - Generated gRPC client code (auto-generated, gitignored)

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
