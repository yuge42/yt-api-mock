FROM node:24-slim

# Install required packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Gauge from zip archive (v1.6.22)
# Using zip installer for reliability and version control
RUN GAUGE_VERSION=1.6.22 && \
    GAUGE_ARCH=linux.x86_64 && \
    curl -L -o gauge.zip "https://github.com/getgauge/gauge/releases/download/v${GAUGE_VERSION}/gauge-${GAUGE_VERSION}-${GAUGE_ARCH}.zip" && \
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
