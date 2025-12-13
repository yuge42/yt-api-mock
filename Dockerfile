# Multi-stage build for minimal server image size

# Stage 1: Builder
FROM rust:1.85-slim AS builder

# Install essential build tools and protoc
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    protobuf-compiler \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Copy the source code
COPY . .

# Build the server in release mode
RUN cargo build --release -p server

# Stage 2: Runtime
FROM debian:bookworm-slim

WORKDIR /app

# Copy the built binary from builder stage
COPY --from=builder /workspace/target/release/server /app/server

# Expose the server port
EXPOSE 50051

# Run the server
CMD ["/app/server"]
