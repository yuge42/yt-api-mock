#!/bin/bash
set -e

# Generate self-signed certificates for TLS testing
# DO NOT use these certificates in production!
#
# SECURITY NOTE: This script generates an unencrypted private key (-nodes flag)
# for ease of use in development. In production, keys should be encrypted
# and properly secured.

CERT_DIR="$(dirname "$0")/tls-certs"
mkdir -p "$CERT_DIR"

echo "Generating self-signed certificate for TLS testing..."

openssl req -x509 -newkey rsa:4096 -nodes \
    -keyout "$CERT_DIR/server.key" \
    -out "$CERT_DIR/server.crt" \
    -days 365 \
    -subj "/C=US/ST=State/L=City/O=Development/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,DNS:server,IP:127.0.0.1,IP:::1"

echo "Certificates generated in $CERT_DIR"
echo "  Certificate: $CERT_DIR/server.crt"
echo "  Private key: $CERT_DIR/server.key (UNENCRYPTED)"
echo ""
echo "WARNING: These are self-signed certificates with an unencrypted private key!"
echo "Only use for development/testing. Do not use in production environments."
