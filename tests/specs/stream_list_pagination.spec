# YouTube Live Chat Pagination Test
Tags: core, grpc, pagination

This specification tests the pagination functionality in the YouTube Live Chat streaming service using gRPC.

**Prerequisites**: The mock server must be running before executing this test.

* gRPC server address from environment variable "GRPC_SERVER_ADDRESS" or default "localhost:50051"
* REST server address from environment variable "REST_SERVER_ADDRESS" or default "http://localhost:8080"

## Test streaming with pagination support

* Connect to the server
* Send StreamList request with live chat id "test-chat-id" and parts "snippet,authorDetails"
* Receive stream of messages
* Verify received "5" messages
* Verify each message has next_page_token
* Close the connection

## Test pagination with page_token

* Use live chat ID "pagination-test-chat"
* Create video with ID "pagination-test-video" and live chat ID "pagination-test-chat"
* Create chat messages from table

    |index|messageId      |
    |-----|---------------|
    |0    |test-msg-id-0  |
    |1    |test-msg-id-1  |
    |2    |test-msg-id-2  |
    |3    |test-msg-id-3  |
    |4    |test-msg-id-4  |

* Connect to the server
* Send StreamList request with parts "snippet,authorDetails"
* Receive first message and extract page_token
* Close the connection
* Connect to the server
* Send StreamList request with extracted page_token
* Receive remaining messages
* Verify first remaining message has ID "test-msg-id-1"
* Close the connection

## Test edge cases for page_token

### Test negative index rejection
* Connect to the server
* Use live chat ID "edge-case-test-chat"
* Create video with ID "edge-case-test-video" and live chat ID "edge-case-test-chat"
* Send StreamList request with page_token "-5"
* Receive stream of messages with timeout "3000" ms
* Verify stream returned error
* Verify error with message containing "Invalid page_token"
* Close the connection

### Test non-numeric token rejection
* Connect to the server
* Use live chat ID "edge-case-test-chat"
* Send StreamList request with page_token "abc"
* Receive stream of messages with timeout "3000" ms
* Verify stream returned error
* Verify error with message containing "Invalid page_token"
* Close the connection

### Test index beyond range
* Connect to the server
* Use live chat ID "edge-case-test-chat"
* Send StreamList request with page_token "100"
* Receive stream of messages with timeout "3000" ms
* Verify received "1" messages
* Verify all responses have empty items
* Close the connection

## Test pagination with dynamically added messages

This scenario tests that messages added via the control endpoint after pagination
are correctly returned when resuming the stream with a pagination token.

* Use live chat ID "dynamic-pagination-chat"
* Create video with ID "dynamic-pagination-video" and live chat ID "dynamic-pagination-chat"
* Create chat messages from table

    |index|messageId         |
    |-----|------------------|
    |0    |dynamic-msg-id-0  |
    |1    |dynamic-msg-id-1  |
    |2    |dynamic-msg-id-2  |

* Connect to the server
* Send StreamList request with parts "snippet,authorDetails"
* Receive stream of messages
* Verify received "3" messages
* Extract page_token from last message
* Close the connection
* Create chat messages from table

    |index|messageId         |
    |-----|------------------|
    |3    |dynamic-msg-id-3  |
    |4    |dynamic-msg-id-4  |
    |5    |dynamic-msg-id-5  |

* Connect to the server
* Send StreamList request with extracted page_token
* Receive stream of messages with timeout "3000" ms
* Verify received "3" messages
* Verify message with id "dynamic-msg-id-3" exists in stream
* Verify message with id "dynamic-msg-id-4" exists in stream
* Verify message with id "dynamic-msg-id-5" exists in stream
* Close the connection
