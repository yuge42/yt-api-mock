# Multi-stage build for minimal Dev Container image size

# Stage 1: Base image with dependencies
FROM rust:1.85-slim AS base

# Install essential build tools and protoc
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    protobuf-compiler \
    git \
    && rm -rf /var/lib/apt/lists/*

# Stage 2: Development environment (final stage)
FROM base AS devcontainer

WORKDIR /workspace

# Copy the source code
COPY . .

# Verify tools are available
RUN protoc --version && rustc --version && cargo --version

# Default command
CMD ["/bin/bash"]
