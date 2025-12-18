# YouTube API gRPC Authorization Test

This specification tests the authorization checks for the YouTube Live Chat gRPC service.

**Prerequisites**: 
- The mock server must be running with REQUIRE_AUTH=true before executing this test.
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
