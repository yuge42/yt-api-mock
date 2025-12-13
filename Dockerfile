# Multi-stage build for minimal Dev Container image size

# Stage 1: Build dependencies layer
FROM rust:1.85-slim AS deps

# Install essential build tools and protoc
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    protobuf-compiler \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Copy dependency manifests
COPY Cargo.toml Cargo.lock ./

# Stage 2: Final development environment
FROM deps AS devcontainer

# Copy the full source code
COPY . .

# Verify protoc is available and show Rust version
RUN protoc --version && rustc --version

# Default command
CMD ["/bin/bash"]
