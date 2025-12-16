# YouTube Live Chat Streaming Test

This specification tests the YouTube Live Chat streaming service using gRPC.

**Prerequisites**: The mock server must be running before executing this test.

* Server address from environment variable "SERVER_ADDRESS" or default "localhost:50051"

## Test streaming live chat messages

* Connect to the server
* Send StreamList request with live chat id "test-chat-id" and parts "snippet,authorDetails"
* Receive stream of messages
* Verify received "5" messages
* Verify each message has kind "youtube#liveChatMessageListResponse"
* Verify each message has author details
* Close the connection
