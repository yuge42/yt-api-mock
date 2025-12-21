# YouTube Live Chat Pagination Test
Tags: core, grpc, pagination

This specification tests the pagination functionality in the YouTube Live Chat streaming service using gRPC.

**Prerequisites**: The mock server must be running before executing this test.

* gRPC server address from environment variable "GRPC_SERVER_ADDRESS" or default "localhost:50051"

## Test streaming with pagination support

* Connect to the server
* Send StreamList request with live chat id "test-chat-id" and parts "snippet,authorDetails"
* Receive stream of messages
* Verify received "5" messages
* Verify each message has next_page_token
* Close the connection

## Test pagination with page_token

* Connect to the server
* Send StreamList request with live chat id "test-chat-id" and parts "snippet,authorDetails"
* Receive first message and extract page_token
* Close the connection
* Connect to the server
* Send StreamList request with extracted page_token
* Receive remaining messages
* Verify messages start from second message
* Close the connection
