# YouTube Live Chat Empty Stream Test
Tags: core, grpc

This specification tests the YouTube Live Chat streaming service with an empty chat (no messages).

**Prerequisites**: The mock server must be running before executing this test.

* gRPC server address from environment variable "GRPC_SERVER_ADDRESS" or default "localhost:50051"

## Test streaming live chat with no messages

This test verifies that the server sends an initial empty response when there are no messages in the chat.

* Connect to the server
* Send StreamList request with live chat id "empty-chat-test-id" and parts "snippet,authorDetails"
* Receive stream of messages with timeout "3000" ms
* Verify received "1" messages
* Verify each message has kind "youtube#liveChatMessageListResponse"
* Verify all responses have empty items
* Verify each message has next_page_token
* Close the connection
