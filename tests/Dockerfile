FROM node:24-slim

# Install required packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Gauge version and checksum
# Note: Architecture is hardcoded to linux.x86_64 for consistency with CI environment
# For ARM64 support, change GAUGE_ARCH to linux.arm64 and update the checksum
ARG GAUGE_VERSION=1.6.22
ARG GAUGE_ARCH=linux.x86_64
ARG GAUGE_SHA256=4488b8241e7760af70a0b098a71b47f4922130bcad94f20c85b3c86c2048b8fb

# Install Gauge from zip archive with checksum verification
RUN curl -L -o gauge.zip "https://github.com/getgauge/gauge/releases/download/v${GAUGE_VERSION}/gauge-${GAUGE_VERSION}-${GAUGE_ARCH}.zip" && \
    echo "${GAUGE_SHA256}  gauge.zip" | sha256sum -c - && \
    unzip gauge.zip && \
    chmod +x gauge && \
    mv gauge /usr/local/bin/ && \
    rm -f gauge.zip

# Install Gauge JavaScript plugin
RUN gauge install js

# Set working directory
WORKDIR /tests

# Copy package files first for better caching
COPY package*.json ./

# Install npm dependencies
RUN npm install

# Copy the rest of the test files
COPY . .

# Create entrypoint script to generate proto and run tests
RUN echo '#!/bin/sh\n\
if [ ! -d "proto-gen" ]; then\n\
  echo "Generating proto client code..."\n\
  npm run proto:generate\n\
fi\n\
exec "$@"' > /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

# Default command to run tests
CMD ["npm", "test"]
