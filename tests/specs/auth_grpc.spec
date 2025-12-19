# YouTube API gRPC Authorization Test
Tags: auth, grpc

This specification tests the authorization checks for the YouTube Live Chat gRPC service.

**Prerequisites**: 
- When running via docker-compose, the REQUIRE_AUTH environment variable is controlled by docker-compose configuration
- For manual testing, set REQUIRE_AUTH=true when starting the mock server
- gRPC server address from environment variable "GRPC_SERVER_ADDRESS" or default "localhost:50051"

* gRPC server address from environment variable "GRPC_SERVER_ADDRESS" or default "localhost:50051"

## Test gRPC API requires authentication when enabled

This test verifies that the gRPC API requires authentication when REQUIRE_AUTH is enabled.

* Connect to the server
* Send StreamList request without authentication
* Verify authentication error received
* Close the connection

## Test gRPC API accepts request with API key metadata

This test verifies that the gRPC API accepts requests with 'x-goog-api-key' metadata.

* Connect to the server
* Send StreamList request with API key metadata
* Verify stream starts successfully
* Close the connection

## Test gRPC API accepts request with authorization metadata

This test verifies that the gRPC API accepts requests with 'authorization' metadata.

* Connect to the server
* Send StreamList request with authorization metadata
* Verify stream starts successfully
* Close the connection
