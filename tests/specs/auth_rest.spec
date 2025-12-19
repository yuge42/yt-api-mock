# YouTube API REST Authorization Test
Tags: auth, rest

This specification tests the authorization checks for the YouTube Videos List REST API endpoint.

**Prerequisites**: 
- When running via docker-compose, the REQUIRE_AUTH environment variable is controlled by docker-compose configuration
- For manual testing, set REQUIRE_AUTH=true when starting the mock server
- REST server address from environment variable "REST_SERVER_ADDRESS" or default "http://localhost:8080"

* REST server address from environment variable "REST_SERVER_ADDRESS" or default "http://localhost:8080"

## Test REST API requires authentication when enabled

This test verifies that the REST API requires authentication when REQUIRE_AUTH is enabled.

* Request video via REST without authentication
* Verify response status code is "401"
* Verify error response has error code "401"
* Verify error message contains "authentication credential"

## Test REST API accepts request with API key parameter

This test verifies that the REST API accepts requests with a 'key' query parameter.

* Request video via REST with API key parameter
* Verify response status code is "200"
* Verify response has kind "youtube#videoListResponse"

## Test REST API accepts request with Authorization header

This test verifies that the REST API accepts requests with an Authorization header.

* Request video via REST with authorization header
* Verify response status code is "200"
* Verify response has kind "youtube#videoListResponse"
