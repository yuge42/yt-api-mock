# OAuth Token Generation Test
Tags: core, rest, oauth

This specification tests the OAuth token generation and refresh endpoints.

**Prerequisites**: The mock server must be running before executing this test.

* REST server address from environment variable "REST_SERVER_ADDRESS" or default "http://localhost:8080"

## Test token generation with authorization code

* Generate OAuth token with authorization code "test_code_123"
* Verify OAuth response has access token
* Verify OAuth response has refresh token
* Verify OAuth response token type is "Bearer"
* Verify OAuth response expires in is "3600"
* Verify OAuth response has scope
* Close the connection

## Test token refresh

* Generate OAuth token with authorization code "test_code_456"
* Store refresh token from OAuth response
* Refresh OAuth token using stored refresh token
* Verify OAuth response has access token
* Verify OAuth response does not have refresh token
* Verify OAuth response token type is "Bearer"
* Verify OAuth response expires in is "3600"
* Close the connection

## Test token generation with custom expiry

* Generate OAuth token with authorization code "test_code_789" and expires in "7200"
* Verify OAuth response has access token
* Verify OAuth response expires in is "7200"
* Close the connection

## Test token generation with expired token (negative expiry)

* Generate OAuth token with authorization code "test_code_expired" and expires in "-3600"
* Verify OAuth response has access token
* Verify OAuth response expires in is "-3600"
* Close the connection

## Test error handling for unsupported grant type

* Generate OAuth token with grant type "invalid_grant"
* Verify OAuth error response error is "unsupported_grant_type"
* Verify OAuth error response has description
* Close the connection

## Test error handling for missing authorization code

* Generate OAuth token with grant type "authorization_code" and no code
* Verify OAuth error response error is "invalid_request"
* Verify OAuth error response description contains "code"
* Close the connection

## Test error handling for missing refresh token

* Generate OAuth token with grant type "refresh_token" and no refresh token
* Verify OAuth error response error is "invalid_request"
* Verify OAuth error response description contains "refresh_token"
* Close the connection

## Test token format and default scope

* Generate OAuth token with authorization code "test_format"
* Verify access token starts with "ya29.mock_"
* Verify refresh token starts with "1//mock_"
* Verify OAuth response has scope "mock.scope.read mock.scope.write"
* Close the connection

## Test custom scope via request parameter

* Generate OAuth token with authorization code "test_custom_scope" and scope "custom.test.scope"
* Verify OAuth response has access token
* Verify OAuth response has scope "custom.test.scope"
* Close the connection
