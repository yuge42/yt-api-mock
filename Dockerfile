# Multi-stage build for minimal server image size

# Stage 1: Builder
FROM rust:1.88-slim AS builder

# Install essential build tools and protoc
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    protobuf-compiler \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Copy the source code
COPY . .

# Build the server in release mode with cache mounts for faster rebuilds
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=/workspace/target,sharing=locked \
    cargo build --release -p server && \
    cp -v /workspace/target/release/server /tmp/server

# Stage 2: Runtime
FROM debian:bookworm-slim

# Install CA certificates, netcat, and curl for healthchecks
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    netcat-openbsd \
    curl \
    && rm -rf /var/lib/apt/lists/* && \
    adduser --disabled-password --gecos '' appuser

WORKDIR /app

# Copy the built binary from builder stage
COPY --from=builder /tmp/server /app/server

# Make binary executable and set ownership
RUN chmod +x /app/server && \
    chown appuser:appuser /app/server

# Run as non-root user
USER appuser

# Expose the gRPC, REST, and health check server ports
EXPOSE 50051 8080 8081

# Set default bind addresses (can be overridden via environment variables)
ENV GRPC_BIND_ADDRESS="[::]:50051"
ENV REST_BIND_ADDRESS="[::]:8080"
ENV HEALTH_BIND_ADDRESS="[::]:8081"

# Run the server
CMD ["/app/server"]
