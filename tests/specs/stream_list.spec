# YouTube Live Chat Streaming Test

This specification tests the YouTube Live Chat streaming service using gRPC.

## Test streaming live chat messages

* Start the mock server on port "50051"
* Connect to the server at "localhost:50051"
* Send StreamList request with live chat id "test-chat-id" and parts "snippet,authorDetails"
* Receive stream of messages
* Verify received "5" messages
* Verify each message has kind "youtube#liveChatMessageListResponse"
* Verify each message has author details
* Close the connection
* Stop the mock server
