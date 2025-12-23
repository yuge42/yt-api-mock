# TLS Reverse Proxy Configuration

This directory contains nginx configuration for TLS termination in front of the YouTube API mock server.

## Contents

- `nginx.conf` - Nginx configuration for reverse proxying both REST and gRPC endpoints with TLS
- `generate-certs.sh` - Script to generate self-signed certificates for development
- `certs/` - Directory for storing TLS certificates and keys

## Usage

### 1. Generate Certificates

For development/testing, generate self-signed certificates:

```bash
./generate-certs.sh
```

**Important:** These certificates are self-signed and unencrypted, suitable only for development. For production, use proper CA-signed certificates.

### 2. Start with Docker Compose

From the repository root:

```bash
docker compose -f docker-compose.tls.yml up --build
```

This will start:
- The YouTube API mock server (internal, no TLS)
- Nginx reverse proxy with TLS termination

### 3. Access the Services

- **REST API:** `https://localhost:8443/youtube/v3/videos?part=liveStreamingDetails&id=test-video-1`
- **gRPC:** `grpcurl -insecure localhost:50051 list`

The `-insecure` flag is needed because we're using self-signed certificates.

## Production Deployment

For production:

1. Obtain proper CA-signed certificates
2. Place them in the `certs/` directory:
   - `server.crt` - Certificate file
   - `server.key` - Private key file (should be encrypted and properly secured)
3. Update `nginx.conf` if needed for your domain
4. Ensure proper file permissions on the certificate and key files
5. Consider using secrets management instead of plain files

## Configuration Details

The nginx configuration provides:

- **TLS 1.2 and 1.3** support
- Modern cipher suites
- HTTP/2 for REST API
- TLS stream proxy for gRPC
- HTTP to HTTPS redirect (optional)

Both the REST API (port 443/8443) and gRPC (port 50051) endpoints are secured with TLS.
