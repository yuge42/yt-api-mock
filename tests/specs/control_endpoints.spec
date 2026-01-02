# Control Endpoints Test
Tags: core, rest, control

This specification tests the control endpoints for creating videos and chat messages.

**Prerequisites**: The mock server must be running before executing this test.

* REST server address from environment variable "REST_SERVER_ADDRESS" or default "http://localhost:8080"

## Test creating a new video via control endpoint

* Create video via control endpoint with id "control-test-video-1" and liveChatId "control-chat-1"
* Verify control response success is "true"
* Verify control response message contains "created successfully"
* Request video via REST with id "control-test-video-1" and parts "liveStreamingDetails,snippet"
* Verify response has "1" video items
* Verify video has activeLiveChatId "control-chat-1"
* Close the connection

## Test creating a new chat message via control endpoint

* gRPC server address from environment variable "GRPC_SERVER_ADDRESS" or default "localhost:50051"
* Create video via control endpoint with id "control-test-video-2" and liveChatId "control-chat-2"
* Create chat message via control endpoint with id "control-msg-1" and liveChatId "control-chat-2"
* Verify control response success is "true"
* Verify control response message contains "created successfully"
* Connect to the server
* Send StreamList request with live chat id "control-chat-2" and parts "snippet,authorDetails"
* Receive stream of messages
* Verify received "1" messages
* Verify message with id "control-msg-1" exists in stream
* Close the connection

## Test chat messages are isolated by LiveChatId

* gRPC server address from environment variable "GRPC_SERVER_ADDRESS" or default "localhost:50051"
* Create video via control endpoint with id "control-test-video-3" and liveChatId "control-chat-3"
* Create chat message via control endpoint with id "control-msg-isolated" and liveChatId "control-chat-3"
* Connect to the server
* Send StreamList request with live chat id "control-chat-2" and parts "snippet,authorDetails"
* Receive stream of messages
* Verify message with id "control-msg-isolated" does not exist in stream
* Close the connection

## Test creating video without publishedAt uses default current datetime

* Create video via control endpoint without publishedAt with id "control-test-video-default-dt" and liveChatId "control-chat-default-dt"
* Verify control response success is "true"
* Verify control response message contains "created successfully"
* Request video via REST with id "control-test-video-default-dt" and parts "snippet,liveStreamingDetails"
* Verify response has "1" video items
* Verify video has valid publishedAt datetime
* Verify video publishedAt is within "5" minutes
* Close the connection

## Test creating chat message without publishedAt uses default current datetime

* gRPC server address from environment variable "GRPC_SERVER_ADDRESS" or default "localhost:50051"
* Create video via control endpoint with id "control-test-video-msg-default-dt" and liveChatId "control-chat-msg-default-dt"
* Create chat message via control endpoint without publishedAt with id "control-msg-default-dt" and liveChatId "control-chat-msg-default-dt"
* Verify control response success is "true"
* Verify control response message contains "created successfully"
* Connect to the server
* Send StreamList request with live chat id "control-chat-msg-default-dt" and parts "snippet,authorDetails"
* Receive stream of messages
* Verify received "1" messages
* Verify message with id "control-msg-default-dt" exists in stream
* Verify chat message has valid publishedAt datetime
* Verify chat message publishedAt is within "5" minutes
* Close the connection

## Test generating chat message with minimal fields

* gRPC server address from environment variable "GRPC_SERVER_ADDRESS" or default "localhost:50051"
* Create video via control endpoint with id "control-test-video-generate-1" and liveChatId "control-chat-generate-1"
* Generate chat message with liveChatId "control-chat-generate-1"
* Verify control response success is "true"
* Verify control response message contains "generated successfully"
* Store generated message id from response
* Connect to the server
* Send StreamList request with live chat id "control-chat-generate-1" and parts "snippet,authorDetails"
* Receive stream of messages
* Verify received "1" messages
* Verify generated message exists in stream
* Verify chat message has valid publishedAt datetime
* Verify chat message publishedAt is within "5" minutes
* Close the connection

## Test generating chat message with custom fields

* gRPC server address from environment variable "GRPC_SERVER_ADDRESS" or default "localhost:50051"
* Create video via control endpoint with id "control-test-video-generate-2" and liveChatId "control-chat-generate-2"
* Generate chat message with liveChatId "control-chat-generate-2", messageText "Custom generated message", and authorDisplayName "Custom Author"
* Verify control response success is "true"
* Verify control response message contains "generated successfully"
* Store generated message id from response
* Connect to the server
* Send StreamList request with live chat id "control-chat-generate-2" and parts "snippet,authorDetails"
* Receive stream of messages
* Verify received "1" messages
* Verify generated message exists in stream
* Verify chat message text is "Custom generated message"
* Verify chat message author display name is "Custom Author"
* Close the connection

## Test generating multiple chat messages

* gRPC server address from environment variable "GRPC_SERVER_ADDRESS" or default "localhost:50051"
* Create video via control endpoint with id "control-test-video-generate-multi" and liveChatId "control-chat-generate-multi"
* Generate "3" chat messages with liveChatId "control-chat-generate-multi"
* Connect to the server
* Send StreamList request with live chat id "control-chat-generate-multi" and parts "snippet,authorDetails"
* Receive stream of messages
* Verify received "3" messages
* Verify all messages have non-empty text
* Verify all messages have non-empty author display names
* Close the connection
