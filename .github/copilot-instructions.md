# Copilot Instructions for yt-api-mock

This document provides essential information for GitHub Copilot coding agents working on the YouTube API Mock server.

## Project Overview

**yt-api-mock** is a development mock server for the YouTube Data API, providing both gRPC (Live Chat) and REST (Videos API) endpoints. It's written in Rust using a workspace structure with multiple crates.

### Key Features
- gRPC server for YouTube Live Chat streaming (port 50051)
- REST server for YouTube Videos API (port 8080)
- Health check endpoint (port 8081)
- Optional TLS support for both gRPC and REST
- Optional authentication checking
- Control endpoints for dynamically creating test data
- Docker support with multi-stage builds

## Repository Structure

```
├── server/                    # Main server binary (combines all services)
├── crates/
│   ├── live_chat_service/    # gRPC live chat streaming service
│   ├── video_service/        # REST videos API service
│   ├── control_service/      # REST control endpoints for testing
│   ├── datastore/            # In-memory data storage
│   ├── domain/               # Domain models
│   └── example/              # Example code
├── proto/                     # Git submodule with Protocol Buffer definitions
├── tests/                     # Gauge scenario tests (JavaScript/Node.js)
└── .github/workflows/        # CI/CD workflows
```

## Prerequisites and Setup

### Git Submodules
**CRITICAL**: This repository uses a git submodule for Protocol Buffer definitions:
```bash
git submodule update --init --recursive
```
Always initialize submodules after cloning. The `proto` directory must be populated for the project to build.

### Required Tools
- **Rust**: Version 1.85 (specified in Cargo.toml)
- **protoc**: Protocol Buffer compiler (required for building)
- **Docker**: For running tests and building container images (optional but recommended)
- **Node.js**: For running Gauge tests locally (v14+)

### Installing Tools
```bash
# Install protoc (example for Ubuntu/Debian)
sudo apt-get install protobuf-compiler

# Or using Arduino setup-protoc action in CI
# See .github/workflows/ci.yml
```

## Building and Testing

### Build Commands
```bash
# Build all workspace members
cargo build

# Build release version
cargo build --release

# Build specific package
cargo build -p server
```

### Running the Server
```bash
# Basic run
cargo run -p server

# With environment variables
GRPC_BIND_ADDRESS="[::1]:50051" REST_BIND_ADDRESS="[::1]:8080" cargo run -p server

# With authentication enabled
REQUIRE_AUTH=true cargo run -p server

# With TLS
TLS_CERT_PATH=./server.crt TLS_KEY_PATH=./server.key cargo run -p server
```

### Testing

#### Rust Tests
```bash
# Run all Rust unit/integration tests
cargo test --verbose

# Run specific crate tests
cargo test -p datastore
```

#### Gauge Scenario Tests
The project uses Gauge for end-to-end scenario testing with three test suites:

```bash
cd tests

# Core functionality tests (recommended first)
docker compose up --build --abort-on-container-exit --exit-code-from tests

# Authorization tests
docker compose -f docker-compose.yml -f docker-compose.auth.yml up --build --abort-on-container-exit

# TLS tests (requires cert generation first)
./generate-tls-certs.sh
docker compose -f docker-compose.yml -f docker-compose.tls.yml up --build --abort-on-container-exit
```

**Test Tags**: Tests are tagged with `core`, `auth`, `tls`, `rest`, and `grpc` for selective execution.

### Linting and Formatting
```bash
# Check formatting (MUST pass in CI)
cargo fmt --all -- --check

# Run clippy (MUST pass in CI with -D warnings)
cargo clippy --all-targets --all-features -- -D warnings

# Auto-format code
cargo fmt --all
```

## Code Style and Conventions

### Rust Edition
- Uses Rust 2024 edition
- Minimum supported Rust version: 1.85

### Code Formatting
- **Always run `cargo fmt --all`** before committing
- CI enforces formatting with `cargo fmt --all -- --check`

### Linting
- CI runs clippy with `-D warnings` (warnings treated as errors)
- Fix all clippy warnings before merging

### Dependencies
Key workspace dependencies defined in root `Cargo.toml`:
- **tonic** 0.14.2 (gRPC framework)
- **axum** 0.8.7 (REST framework)
- **tokio** (async runtime)
- **serde/serde_json** (serialization)
- **prost** 0.14 (Protocol Buffers)

### Workspace Configuration
All crates use workspace-level settings for:
- `edition`, `rust-version`, `license`, `repository`, `readme`, `authors`, `description`, `version`

Reference with: `edition.workspace = true`

## Architecture Patterns

### Service Structure
Each service crate follows a similar pattern:
1. **lib.rs** - Public interface and service implementation
2. **build.rs** (if needed) - Build-time code generation (e.g., protobuf)
3. **Cargo.toml** - Dependencies and metadata

### Error Handling
- Use `Result<T, Box<dyn std::error::Error>>` for general errors
- Use `tonic::Status` for gRPC errors
- Use `axum::http::StatusCode` for REST errors

### Authentication Pattern
Services check `REQUIRE_AUTH` environment variable:
```rust
let require_auth = std::env::var("REQUIRE_AUTH")
    .unwrap_or_else(|_| "false".to_string())
    .parse::<bool>()
    .unwrap_or(false);
```

When enabled, check for:
- **REST**: `key` query parameter or `Authorization` header
- **gRPC**: `x-goog-api-key` or `authorization` metadata

### Data Storage
- In-memory storage using `Arc<dyn datastore::Repository>`
- Thread-safe with tokio's `RwLock`
- Domain models in `domain` crate with serde support

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `GRPC_BIND_ADDRESS` | `[::1]:50051` | gRPC server bind address |
| `REST_BIND_ADDRESS` | `[::1]:8080` | REST server bind address |
| `HEALTH_BIND_ADDRESS` | `[::1]:8081` | Health check endpoint address |
| `REQUIRE_AUTH` | `false` | Enable authentication checks |
| `CHAT_STREAM_TIMEOUT` | (none) | Chat stream timeout in seconds (0 or unset = infinite) |
| `TLS_CERT_PATH` | (none) | Path to TLS certificate file |
| `TLS_KEY_PATH` | (none) | Path to TLS private key file |

**Note**: Both `TLS_CERT_PATH` and `TLS_KEY_PATH` must be set together for TLS to be enabled.

## Common Tasks

### Adding a New Endpoint

1. **For REST endpoints**: Modify or extend `video_service` or `control_service`
   - Add route in the service's Router
   - Implement handler function
   - Add request/response structs with serde derives

2. **For gRPC endpoints**: Modify `live_chat_service`
   - Update proto definitions in the `proto` submodule
   - Regenerate code (happens automatically on build)
   - Implement service method

3. **Add tests**:
   - Rust unit tests in the same file or module
   - Gauge scenario tests in `tests/specs/`

### Updating Dependencies

```bash
# Update all dependencies
cargo update

# Update specific dependency
cargo update -p tokio
```

### Working with Protocol Buffers

Proto files are in a **git submodule** (`proto/`):
1. Make changes in the `yt-api-proto` repository
2. Update submodule reference in this repo
3. Rebuild to regenerate Rust code

The `live_chat_service/build.rs` handles code generation automatically.

## CI/CD

### GitHub Actions Workflows

**ci.yml** - Main CI workflow with 4 jobs:
1. **test**: Rust format, clippy, build, and unit tests
2. **gauge-tests**: Core Gauge scenario tests
3. **gauge-auth-tests**: Authorization scenario tests
4. **gauge-tls-tests**: TLS scenario tests

All jobs must pass for PR approval.

### Required Checks
- Code formatting (`cargo fmt --all -- --check`)
- Clippy lints (`cargo clippy -- -D warnings`)
- All Rust tests
- All Gauge scenario tests

## Docker

### Building Docker Image
```bash
docker build -t yt-api-mock .
```

### Running in Docker
```bash
docker run -p 50051:50051 -p 8080:8080 -p 8081:8081 \
  -e GRPC_BIND_ADDRESS="[::]:50051" \
  -e REST_BIND_ADDRESS="[::]:8080" \
  -e HEALTH_BIND_ADDRESS="[::]:8081" \
  yt-api-mock
```

### Multi-stage Build
The Dockerfile uses a two-stage build:
1. **Builder**: Rust 1.85-slim with protoc for compilation
2. **Runtime**: Debian bookworm-slim with only the binary

This keeps the final image small.

## Troubleshooting

### Build Fails with "proto not found"
**Cause**: Git submodule not initialized
**Solution**: 
```bash
git submodule update --init --recursive
```

### "protoc not found" Error
**Cause**: Protocol Buffer compiler not installed
**Solution**:
```bash
# Ubuntu/Debian
sudo apt-get install protobuf-compiler

# macOS
brew install protobuf
```

### Tests Fail to Connect to Server
**Cause**: Server not running or wrong address
**Solution**:
- Ensure server is running: `cargo run -p server`
- Check bind addresses match test expectations
- For Docker tests, ensure containers are healthy

### TLS Certificate Errors
**Cause**: Invalid certificates or CA not trusted
**Solution**:
- Regenerate certificates using instructions in README.md
- Use `--cacert` flag with curl/grpcurl
- Ensure both cert and key paths are provided

### Gauge Tests Fail with "Module not found"
**Cause**: npm dependencies not installed or proto not generated
**Solution**:
```bash
cd tests
npm install
npm run proto:generate
```

## Security Considerations

### Authentication
- The mock server only **checks for presence** of auth credentials, not validity
- This is intentional for testing purposes
- Do not use in production environments

### TLS Certificates
- Development certificates in README are for **testing only**
- Production deployments should use certificates from trusted CAs
- Never commit private keys to the repository

### Secrets in Tests
- Test certificates are gitignored (`.crt`, `.key`, `.pem`)
- No real API keys should be used in tests

## License

Dual-licensed under MIT OR Apache-2.0.

**Important**: The `proto` submodule is Apache-2.0 only. Binaries include work derived from these protos and are subject to Apache-2.0 license terms.

## Getting Help

- **README.md**: Primary documentation for usage and features
- **tests/README.md**: Detailed testing documentation
- **Cargo.toml**: Workspace configuration and dependencies
- **GitHub Issues**: For bugs and feature requests

## Quick Reference Commands

```bash
# Initialize repository
git clone --recursive https://github.com/yuge42/yt-api-mock.git
cd yt-api-mock

# Build and test locally
cargo build
cargo test
cargo fmt --all
cargo clippy --all-targets --all-features

# Run server
cargo run -p server

# Run Gauge tests
cd tests
docker compose up --build --abort-on-container-exit

# Clean build artifacts
cargo clean
cd tests && docker compose down -v
```
