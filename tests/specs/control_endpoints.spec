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

* Create chat message via control endpoint with id "control-msg-1" and liveChatId "control-chat-1"
* Verify control response success is "true"
* Verify control response message contains "created successfully"
* Close the connection
