# YouTube API TLS Support Test
Tags: tls, rest, grpc

This specification tests TLS-enabled endpoints for both REST and gRPC.

**Prerequisites**: The mock server must be running with TLS enabled (TLS_CERT_PATH and TLS_KEY_PATH environment variables set).

* gRPC server address from environment variable "GRPC_SERVER_ADDRESS" or default "localhost:50051"
* REST server address from environment variable "REST_SERVER_ADDRESS" or default "https://localhost:8080"

## Test REST API with TLS

* Request video via REST with TLS with id "test-video-1" and parts "liveStreamingDetails"
* Verify response has kind "youtube#videoListResponse"
* Verify response has "1" video items
* Verify video has liveStreamingDetails
* Close the connection

## Test gRPC API with TLS

* Connect to the server with TLS
* Send StreamList request with live chat id "test-chat-id" and parts "snippet,authorDetails"
* Receive stream of messages
* Verify received "5" messages
* Verify each message has kind "youtube#liveChatMessageListResponse"
* Close the connection
