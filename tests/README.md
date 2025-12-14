# YouTube API Mock - Scenario Tests

This directory contains scenario tests for the YouTube API mock server using [Gauge](https://gauge.org/) with JavaScript.

## Overview

The tests verify the YouTube Live Chat streaming service using a gRPC client generated from the protocol buffer definitions. This is similar to the [stream_list_demo.py](https://developers.google.com/youtube/v3/live/streaming-live-chat) example provided in Google's official documentation, but implemented as automated scenario tests.

## Prerequisites

- Node.js (v14 or later)
- Gauge test framework
- Protobuf compiler (protoc) - installed automatically via grpc-tools

The JavaScript plugin for Gauge should be installed. If not, run:
```bash
gauge install js
```

## Setup

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

To run all scenario tests:
```bash
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
1. Starting the mock server
2. Connecting to the gRPC server
3. Sending a StreamList request with parameters
4. Receiving a stream of live chat messages
5. Verifying the structure and content of responses
6. Checking that each message has author details
7. Proper cleanup and server shutdown

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
