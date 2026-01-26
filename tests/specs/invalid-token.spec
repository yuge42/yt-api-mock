# Invalid Token Test
Tags: auth, rest, grpc

This specification tests that authentication tokens and API keys starting with "invalid" are rejected.

**Prerequisites**: 
- When running via docker-compose, the REQUIRE_AUTH environment variable is controlled by docker-compose configuration
- For manual testing, set REQUIRE_AUTH=true when starting the mock server

* REST server address from environment variable "REST_SERVER_ADDRESS" or default "http://localhost:8080"
* gRPC server address from environment variable "GRPC_SERVER_ADDRESS" or default "localhost:50051"

## Test REST API rejects invalid API key
Tags: rest

This test verifies that the REST API rejects requests with an API key starting with "invalid".

* Request video via REST with invalid API key parameter
* Verify response status code is "401"
* Verify error response has error code "401"
* Verify error message contains "Invalid API key"

## Test REST API rejects invalid Bearer token
Tags: rest

This test verifies that the REST API rejects requests with a Bearer token starting with "invalid".

* Request video via REST with invalid authorization header
* Verify response status code is "401"
* Verify error response has error code "401"
* Verify error message contains "Invalid"

## Test gRPC API rejects invalid API key metadata
Tags: grpc

This test verifies that the gRPC API rejects requests with 'x-goog-api-key' metadata starting with "invalid".

* Connect to the server
* Send StreamList request with invalid API key metadata
* Verify authentication error received
* Close the connection

## Test gRPC API rejects invalid authorization token
Tags: grpc

This test verifies that the gRPC API rejects requests with 'authorization' metadata starting with "invalid".

* Connect to the server
* Send StreamList request with invalid authorization metadata
* Verify authentication error received
* Close the connection
