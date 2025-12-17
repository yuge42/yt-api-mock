# YouTube Videos List Test

This specification tests the YouTube Videos List service using gRPC.

**Prerequisites**: The mock server must be running before executing this test.

* Server address from environment variable "SERVER_ADDRESS" or default "localhost:50051"

## Test videos.list endpoint to retrieve Live Chat ID

* Connect to the video service
* Request video with id "test-video-1" and parts "liveStreamingDetails,snippet"
* Verify response has kind "youtube#videoListResponse"
* Verify response has "1" video items
* Verify video has liveStreamingDetails
* Verify video has activeLiveChatId "live-chat-id-1"
* Verify activeLiveChatId can be used with live chat service
* Close the connection
