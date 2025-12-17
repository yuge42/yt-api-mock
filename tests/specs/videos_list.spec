# YouTube Videos List Test

This specification tests the YouTube Videos List REST API endpoint.

**Prerequisites**: The mock server must be running before executing this test.

* Server address from environment variable "SERVER_ADDRESS" or default "localhost:50051"
* REST server address from environment variable "REST_SERVER_ADDRESS" or default "http://localhost:8080"

## Test videos.list endpoint to retrieve Live Chat ID

* Request video via REST with id "test-video-1" and parts "liveStreamingDetails,snippet"
* Verify response has kind "youtube#videoListResponse"
* Verify response has "1" video items
* Verify video has liveStreamingDetails
* Verify video has activeLiveChatId "live-chat-id-1"
* Verify activeLiveChatId can be used with live chat service
* Close the connection

## Test videos.list endpoint validates required parameters

Note: The actual YouTube API behavior for missing required parameters is unconfirmed. This test verifies that the mock implementation enforces proper API usage by returning 400 Bad Request.

* Request video via REST without id parameter
* Verify response status code is "400"
* Verify error response has error code "400"
* Verify error message contains "Required parameter: id"
* Request video via REST without part parameter
* Verify response status code is "400"
* Verify error response has error code "400"
* Verify error message contains "Required parameter: part"
* Close the connection
