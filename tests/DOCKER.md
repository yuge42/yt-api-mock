# Running Tests with Docker

This guide explains how to run the Gauge scenario tests using Docker and Docker Compose, eliminating the need for local installation of Gauge, Node.js, or other dependencies.

## Prerequisites

- Docker (version 20.10 or later)
- Docker Compose (version 2.0 or later)

## Quick Start

### Using Make (Recommended)

From the `tests` directory:

```bash
cd tests
make docker-test
```

### Using Docker Compose Directly

```bash
cd tests
docker compose up --build --abort-on-container-exit
```

This will:
1. Build the mock server Docker image
2. Build the test environment Docker image with Gauge and Node.js
3. Start the mock server
4. Wait for the server to be healthy
5. Run the Gauge scenario tests
6. Stop all containers when tests complete

## Understanding the Setup

### Docker Compose Services

The `docker compose.yml` defines two services:

1. **server**: The YouTube API mock server
   - Built from the root `Dockerfile`
   - Exposes port 50051
   - Includes health check to ensure it's ready before tests run

2. **tests**: The Gauge test environment
   - Built from `tests/Dockerfile`
   - Includes Node.js, Gauge, and all dependencies
   - Automatically connects to the server via Docker networking
   - Waits for server health check before starting

### Test Dockerfile

The `tests/Dockerfile`:
- Uses Node.js 20 slim image
- Installs Gauge test framework
- Installs Gauge JavaScript plugin
- Installs npm dependencies
- Generates gRPC proto client code
- Runs tests by default

## Running Tests

### Full Test Suite

Run all tests and clean up:

```bash
docker compose up --build --abort-on-container-exit
docker compose down
```

### View Test Reports

Test reports are saved to the `reports` directory, which is mounted as a volume. After running tests, you can view the HTML report:

```bash
# On Linux/Mac
open reports/html-report/index.html

# On Windows
start reports/html-report/index.html
```

### Rebuild Images

If you make changes to dependencies or Dockerfile:

```bash
docker compose build --no-cache
```

### Run Tests Only (Server Already Running)

If the server is already running externally:

```bash
docker build -t yt-api-tests .
docker run --rm \
  --network host \
  -e SERVER_ADDRESS=localhost:50051 \
  -v $(pwd)/reports:/tests/reports \
  yt-api-tests
```

## Environment Variables

- `SERVER_ADDRESS`: Override the default server address (default: `server:50051` in Docker Compose, `localhost:50051` otherwise)

## Troubleshooting

### Server Not Ready

If tests fail because the server isn't ready, increase the health check timeout in `docker compose.yml`:

```yaml
healthcheck:
  retries: 20  # Increase this value
  start_period: 10s  # Or increase this
```

### Permission Issues with Reports

If you encounter permission issues with the reports directory:

```bash
sudo chown -R $USER:$USER reports
```

### View Container Logs

```bash
# View server logs
docker compose logs server

# View test logs
docker compose logs tests

# Follow logs in real-time
docker compose logs -f
```

## Development Workflow

1. Make changes to test code
2. Rebuild and run:
   ```bash
   docker compose up --build --abort-on-container-exit
   ```
3. View reports in `reports/html-report/index.html`
4. Clean up:
   ```bash
   docker compose down
   ```

## CI/CD Integration

This Docker setup is ideal for CI/CD pipelines. Example GitHub Actions workflow:

```yaml
- name: Run scenario tests
  run: |
    cd tests
    docker compose up --build --abort-on-container-exit --exit-code-from tests
    
- name: Upload test reports
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: test-reports
    path: tests/reports/
```

## Advantages of Docker Approach

- **No Local Dependencies**: No need to install Gauge, Node.js, or npm locally
- **Consistent Environment**: Same environment for all developers and CI/CD
- **Isolation**: Tests run in isolated containers
- **Easy Setup**: Simple `docker compose up` command
- **Reproducible**: Guaranteed to work the same way everywhere
