#!/bin/bash
set -e

# Generate self-signed certificates for development/testing
# DO NOT use these certificates in production!

CERT_DIR="$(dirname "$0")/certs"
mkdir -p "$CERT_DIR"

echo "Generating self-signed certificate for development..."

openssl req -x509 -newkey rsa:4096 -nodes \
    -keyout "$CERT_DIR/server.key" \
    -out "$CERT_DIR/server.crt" \
    -days 365 \
    -subj "/C=US/ST=State/L=City/O=Development/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,DNS:server,IP:127.0.0.1,IP:::1"

echo "Certificates generated in $CERT_DIR"
echo "  Certificate: $CERT_DIR/server.crt"
echo "  Private key: $CERT_DIR/server.key"
echo ""
echo "WARNING: These are self-signed certificates for development only!"
echo "Do not use in production environments."
