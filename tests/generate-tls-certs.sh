#!/bin/bash
set -e

# Generate CA and server certificates for TLS testing
# DO NOT use these certificates in production!
#
# SECURITY NOTE: This script generates unencrypted private keys (-nodes flag)
# for ease of use in development. In production, keys should be encrypted
# and properly secured.

CERT_DIR="$(dirname "$0")/tls-certs"
mkdir -p "$CERT_DIR"

echo "Generating CA certificate for TLS testing..."

# Generate CA private key
openssl genrsa -out "$CERT_DIR/ca.key" 4096

# Generate CA certificate
openssl req -x509 -new -nodes \
    -key "$CERT_DIR/ca.key" \
    -sha256 -days 365 \
    -out "$CERT_DIR/ca.crt" \
    -subj "/C=US/ST=State/L=City/O=Development/CN=Development CA"

echo "Generating server certificate signed by CA..."

# Generate server private key
openssl genrsa -out "$CERT_DIR/server.key" 4096

# Generate server certificate signing request (CSR)
openssl req -new \
    -key "$CERT_DIR/server.key" \
    -out "$CERT_DIR/server.csr" \
    -subj "/C=US/ST=State/L=City/O=Development/CN=localhost"

# Create OpenSSL config for SAN
cat > "$CERT_DIR/server.ext" << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = server
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

# Sign server certificate with CA
openssl x509 -req \
    -in "$CERT_DIR/server.csr" \
    -CA "$CERT_DIR/ca.crt" \
    -CAkey "$CERT_DIR/ca.key" \
    -CAcreateserial \
    -out "$CERT_DIR/server.crt" \
    -days 365 \
    -sha256 \
    -extfile "$CERT_DIR/server.ext"

# Clean up temporary files
rm -f "$CERT_DIR/server.csr" "$CERT_DIR/server.ext" "$CERT_DIR/ca.srl"

# Set permissions to allow reading by Docker container users
# In development/testing, we prioritize convenience over strict security
chmod 644 "$CERT_DIR/ca.crt" "$CERT_DIR/ca.key"
chmod 644 "$CERT_DIR/server.crt" "$CERT_DIR/server.key"

echo "Certificates generated in $CERT_DIR"
echo "  CA Certificate: $CERT_DIR/ca.crt"
echo "  CA Private key: $CERT_DIR/ca.key (UNENCRYPTED)"
echo "  Server Certificate: $CERT_DIR/server.crt"
echo "  Server Private key: $CERT_DIR/server.key (UNENCRYPTED)"
echo ""
echo "WARNING: These are development certificates with unencrypted private keys!"
echo "Only use for development/testing. Do not use in production environments."
echo ""
echo "To use with curl/grpcurl, specify the CA certificate:"
echo "  curl --cacert $CERT_DIR/ca.crt https://localhost:8080/..."
echo "  grpcurl -cacert $CERT_DIR/ca.crt localhost:50051 list"

