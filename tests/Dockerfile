FROM node:20-slim

# Install required packages including Gauge
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    unzip \
    && curl -SsL https://downloads.gauge.org/stable | sh \
    && rm -rf /var/lib/apt/lists/*

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
