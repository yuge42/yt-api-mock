/* globals gauge, step, beforeScenario */
'use strict';

const grpc = require('@grpc/grpc-js');
const messages = require('../proto-gen/stream_list_pb');
const services = require('../proto-gen/stream_list_grpc_pb');
const assert = require('assert');
const { URL } = require('url');
const fetch = require('node-fetch');
const { Buffer } = require('buffer');

// ============================================================================
// Constants
// ============================================================================

// ISO8601 datetime regex pattern
// Accepts both 'Z' suffix and timezone offset format (e.g., +00:00, -05:00)
const ISO8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

// ============================================================================
// Helper Functions for Common Stream Patterns
// ============================================================================

/**
 * Validate that a datetime string is in valid ISO8601 format
 * @param {string} datetimeValue - The datetime string to validate
 * @param {string} fieldName - Name of the field being validated (for error messages)
 */
function validateISO8601DateTime(datetimeValue, fieldName = 'publishedAt') {
  // Verify it's a valid ISO8601 datetime string (accepts both Z suffix and timezone offset)
  assert.ok(
    ISO8601_REGEX.test(datetimeValue),
    `${fieldName} '${datetimeValue}' is not a valid ISO8601 datetime`
  );
  
  return datetimeValue;
}

/**
 * Validate that a datetime is recent (within specified minutes)
 * @param {string} datetimeValue - The datetime string to validate
 * @param {number} maxDiffMinutes - Maximum allowed time difference in minutes
 * @param {string} fieldName - Name of the field being validated (for error messages)
 */
function validateRecentDateTime(datetimeValue, maxDiffMinutes, fieldName = 'publishedAt') {
  const parsedDate = new Date(datetimeValue);
  const now = new Date();
  const diffMs = Math.abs(now - parsedDate);
  const diffMinutes = diffMs / (1000 * 60);
  
  assert.ok(
    diffMinutes < maxDiffMinutes,
    `${fieldName} '${datetimeValue}' is not recent (diff: ${diffMinutes.toFixed(2)} minutes, max allowed: ${maxDiffMinutes} minutes)`
  );
  
  return datetimeValue;
}

/**
 * Set up a stream with all event listeners attached immediately
 * This function creates the stream and attaches data, end, and error listeners
 * Messages and errors are collected as they arrive
 * @param {function} streamCallFactory - Function that creates the stream (e.g., () => client.streamList(request))
 * @returns {object} Object with stream, receivedMessages array, and error storage
 */
function setupStreamWithListeners(streamCallFactory) {
  const stream = streamCallFactory();
  const receivedMessages = [];
  let streamError = null;
  let streamEnded = false;
  
  // Attach all event listeners immediately
  stream.on('data', (response) => {
    console.log(`Received message: ${response.getEtag()}`);
    receivedMessages.push(response);
  });
  
  stream.on('end', () => {
    console.log('Stream ended normally');
    streamEnded = true;
  });
  
  stream.on('error', (error) => {
    console.log(`Stream error: ${error.message}, code: ${error.code}`);
    streamError = error;
  });
  
  return {
    stream,
    receivedMessages,
    get error() { return streamError; },
    get ended() { return streamEnded; }
  };
}

/**
 * Await stream completion with timeout
 * This function only manages the timeout and retrieves already-collected data
 * @param {object} streamData - Object returned from setupStreamWithListeners
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<object>} Object with messages array and error (if any)
 */
function awaitStreamCompletion(streamData, timeout = 10000) {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (!streamData.ended) {
        streamData.stream.cancel();
      }
      // Give a brief delay for final events to process
      setTimeout(() => {
        resolve({
          messages: streamData.receivedMessages,
          error: streamData.error
        });
      }, 100);
    }, timeout);
  });
}

// ============================================================================
// Test Steps
// ============================================================================


// Store gRPC server address from environment or default
step('gRPC server address from environment variable <envVar> or default <defaultAddress>', async function (envVar, defaultAddress) {
  const address = process.env[envVar] || defaultAddress;
  gauge.dataStore.specStore.put('grpcServerAddress', address);
  console.log(`gRPC server address set to: ${address}`);
});

// Store REST server address from environment or default
step('REST server address from environment variable <envVar> or default <defaultAddress>', async function (envVar, defaultAddress) {
  const address = process.env[envVar] || defaultAddress;
  gauge.dataStore.specStore.put('restServerAddress', address);
  console.log(`REST server address set to: ${address}`);
});

// Helper function to make HTTP GET requests to the REST API
async function makeRestRequest(restServerAddress, path, queryParams = {}, headers = {}) {
  if (!restServerAddress) {
    throw new Error('REST server address not set. Please set REST_SERVER_ADDRESS environment variable or use default.');
  }

  const url = new URL(path, restServerAddress);
  Object.entries(queryParams).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  console.log(`Making request to: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers
  });

  const statusCode = response.status;
  gauge.dataStore.scenarioStore.put('lastHttpStatusCode', statusCode);

  const data = await response.json();
  gauge.dataStore.scenarioStore.put('videoResponse', data);
  console.log(`Received response with status ${statusCode}`);
  
  return { statusCode, data };
}

// Create a video via control API
step('Create video with ID <videoId> and live chat ID <liveChatId>', async function (videoId, liveChatId) {
  const restServerAddress = gauge.dataStore.specStore.get('restServerAddress');
  if (!restServerAddress) {
    throw new Error('REST server address not set');
  }

  const url = new URL('/control/videos', restServerAddress);
  const videoData = {
    id: videoId,
    channelId: 'test-channel-1',
    title: 'Test Live Stream for Pagination',
    description: 'Testing pagination functionality',
    channelTitle: 'Test Channel',
    publishedAt: '2023-01-01T00:00:00Z',
    liveChatId: liveChatId,
    actualStartTime: '2023-01-01T00:00:00Z',
    actualEndTime: null,
    scheduledStartTime: '2023-01-01T00:00:00Z',
    scheduledEndTime: null,
    concurrentViewers: 100
  };

  console.log(`Creating video: ${videoId} with live chat ID: ${liveChatId}`);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(videoData)
  });

  const result = await response.json();
  if (response.status !== 201) {
    throw new Error(`Failed to create video: ${result.error || result.message}`);
  }
  console.log(`Video created successfully: ${result.message}`);
});

// Create chat messages from table
step('Create chat messages from table', async function (table) {
  const restServerAddress = gauge.dataStore.specStore.get('restServerAddress');
  if (!restServerAddress) {
    throw new Error('REST server address not set');
  }

  const url = new URL('/control/chat_messages', restServerAddress);
  
  // Get the live chat ID from the scenario store (set by previous video creation)
  // For now, we'll use a consistent ID from the spec
  const liveChatId = gauge.dataStore.scenarioStore.get('liveChatId') || 'pagination-test-chat';
  
  console.log(`Creating ${table.getRowCount()} chat messages for chat ID: ${liveChatId}`);
  
  for (let i = 0; i < table.getRowCount(); i++) {
    const row = table.getTableRows()[i];
    const index = row.getCell('index');
    const messageId = row.getCell('messageId');
    
    const messageData = {
      id: messageId,
      liveChatId: liveChatId,
      authorChannelId: `test-author-${index}`,
      authorDisplayName: `Test User ${index}`,
      messageText: `Test message number ${index}`,
      publishedAt: '2023-01-01T00:00:00Z',
      isVerified: true
    };

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messageData)
    });

    const result = await response.json();
    if (response.status !== 201) {
      throw new Error(`Failed to create message ${messageId}: ${result.error || result.message}`);
    }
  }
  
  console.log(`Successfully created ${table.getRowCount()} chat messages`);
});

// Store live chat ID for use in subsequent steps
step('Use live chat ID <liveChatId>', async function (liveChatId) {
  gauge.dataStore.scenarioStore.put('liveChatId', liveChatId);
  console.log(`Stored live chat ID: ${liveChatId}`);
});

// Connect to the server
step('Connect to the server', async function () {
  const grpcServerAddress = gauge.dataStore.specStore.get('grpcServerAddress');
  if (!grpcServerAddress) {
    throw new Error('gRPC server address not set. Please set GRPC_SERVER_ADDRESS environment variable or use default.');
  }
  const client = new services.V3DataLiveChatMessageServiceClient(
    grpcServerAddress,
    grpc.credentials.createInsecure()
  );
  gauge.dataStore.scenarioStore.put('client', client);
  console.log(`Connected to gRPC server at ${grpcServerAddress}`);
});

// Send StreamList request
step('Send StreamList request with live chat id <liveChatId> and parts <parts>', async function (liveChatId, parts) {
  const client = gauge.dataStore.scenarioStore.get('client');
  const request = new messages.LiveChatMessageListRequest();
  request.setLiveChatId(liveChatId);
  
  const partsList = parts.split(',').map(p => p.trim());
  request.setPartList(partsList);

  const streamData = setupStreamWithListeners(() => client.streamList(request));
  gauge.dataStore.scenarioStore.put('streamData', streamData);
  console.log(`Sent StreamList request for chat ID: ${liveChatId} with parts: ${partsList.join(', ')}`);
});

// Send StreamList request with stored live chat ID
step('Send StreamList request with parts <parts>', async function (parts) {
  const client = gauge.dataStore.scenarioStore.get('client');
  const liveChatId = gauge.dataStore.scenarioStore.get('liveChatId');
  
  if (!liveChatId) {
    throw new Error('No live chat ID stored. Use "Use live chat ID" step first.');
  }
  
  const request = new messages.LiveChatMessageListRequest();
  request.setLiveChatId(liveChatId);
  
  const partsList = parts.split(',').map(p => p.trim());
  request.setPartList(partsList);

  // Set up stream with all listeners attached immediately
  const streamData = setupStreamWithListeners(() => client.streamList(request));
  
  gauge.dataStore.scenarioStore.put('streamData', streamData);
  console.log(`Sent StreamList request for stored chat ID: ${liveChatId} with parts: ${partsList.join(', ')}`);
});

// Receive stream of messages
step('Receive stream of messages', async function () {
  const streamData = gauge.dataStore.scenarioStore.get('streamData');
  const result = await awaitStreamCompletion(streamData);
  gauge.dataStore.scenarioStore.put('receivedMessages', result.messages);
  gauge.dataStore.scenarioStore.put('streamError', result.error);
});

// Receive stream of messages with timeout
step('Receive stream of messages with timeout <timeoutMs> ms', async function (timeoutMs) {
  const streamData = gauge.dataStore.scenarioStore.get('streamData');
  const timeout = parseInt(timeoutMs, 10);
  const result = await awaitStreamCompletion(streamData, timeout);
  gauge.dataStore.scenarioStore.put('receivedMessages', result.messages);
  gauge.dataStore.scenarioStore.put('streamError', result.error);
});

// Verify number of messages received
step('Verify received <count> messages', async function (count) {
  const receivedMessages = gauge.dataStore.scenarioStore.get('receivedMessages') || [];
  const expectedCount = parseInt(count, 10);
  assert.strictEqual(
    receivedMessages.length,
    expectedCount,
    `Expected ${expectedCount} messages but received ${receivedMessages.length}`
  );
  console.log(`Verified received ${expectedCount} messages`);
});

// Verify message kind
step('Verify each message has kind <kind>', async function (kind) {
  const receivedMessages = gauge.dataStore.scenarioStore.get('receivedMessages') || [];
  receivedMessages.forEach((message, index) => {
    const messageKind = message.getKind();
    assert.strictEqual(
      messageKind,
      kind,
      `Message ${index} has kind '${messageKind}' but expected '${kind}'`
    );
    
    // Also verify the items within the response have the correct kind
    const items = message.getItemsList();
    items.forEach((item, itemIndex) => {
      const itemKind = item.getKind();
      if (kind === 'youtube#liveChatMessageListResponse') {
        assert.strictEqual(
          itemKind,
          'youtube#liveChatMessage',
          `Item ${itemIndex} in message ${index} has kind '${itemKind}' but expected 'youtube#liveChatMessage'`
        );
      }
    });
  });
  console.log(`Verified all messages have kind: ${kind}`);
});

// Verify author details
step('Verify each message has author details', async function () {
  const receivedMessages = gauge.dataStore.scenarioStore.get('receivedMessages') || [];
  receivedMessages.forEach((message, index) => {
    const items = message.getItemsList();
    assert.ok(items.length > 0, `Message ${index} has no items`);
    
    items.forEach((item, itemIndex) => {
      const authorDetails = item.getAuthorDetails();
      assert.ok(
        authorDetails,
        `Item ${itemIndex} in message ${index} has no author details`
      );
      assert.ok(
        authorDetails.getDisplayName(),
        `Item ${itemIndex} in message ${index} has no display name`
      );
    });
  });
  console.log('Verified all messages have author details');
});

// Close the connection
step('Close the connection', async function () {
  const streamData = gauge.dataStore.scenarioStore.get('streamData');
  const client = gauge.dataStore.scenarioStore.get('client');
  
  if (streamData && streamData.stream) {
    streamData.stream.cancel();
    gauge.dataStore.scenarioStore.put('streamData', null);
  }
  if (client) {
    client.close();
    gauge.dataStore.scenarioStore.put('client', null);
  }
  console.log('Connection closed');
});

// Video Service Steps (REST API)

// Request video via REST API
step('Request video via REST with id <videoId> and parts <parts>', async function (videoId, parts) {
  const restServerAddress = gauge.dataStore.specStore.get('restServerAddress');
  if (!restServerAddress) {
    throw new Error('REST server address not set. Please set REST_SERVER_ADDRESS environment variable or use default.');
  }

  const url = new URL('/youtube/v3/videos', restServerAddress);
  url.searchParams.append('id', videoId);
  url.searchParams.append('part', parts);
  
  console.log(`Requesting video from: ${url.toString()}`);

  const response = await fetch(url.toString());
  const statusCode = response.status;
  gauge.dataStore.scenarioStore.put('lastHttpStatusCode', statusCode);

  const videoResponse = await response.json();
  gauge.dataStore.scenarioStore.put('videoResponse', videoResponse);
  console.log(`Received video response with status ${statusCode}`);
  if (videoResponse.items) {
    console.log(`Response has ${videoResponse.items.length} items`);
  }
});

// Verify response kind
step('Verify response has kind <kind>', async function (kind) {
  const videoResponse = gauge.dataStore.scenarioStore.get('videoResponse');
  assert.ok(videoResponse, 'No video response received');
  const responseKind = videoResponse.kind;
  assert.strictEqual(
    responseKind,
    kind,
    `Response has kind '${responseKind}' but expected '${kind}'`
  );
  console.log(`Verified response has kind: ${kind}`);
});

// Verify number of video items
step('Verify response has <count> video items', async function (count) {
  const videoResponse = gauge.dataStore.scenarioStore.get('videoResponse');
  assert.ok(videoResponse, 'No video response received');
  const items = videoResponse.items;
  const expectedCount = parseInt(count, 10);
  assert.strictEqual(
    items.length,
    expectedCount,
    `Response has ${items.length} items but expected ${expectedCount}`
  );
  console.log(`Verified response has ${expectedCount} video item(s)`);
});

// Verify video has liveStreamingDetails
step('Verify video has liveStreamingDetails', async function () {
  const videoResponse = gauge.dataStore.scenarioStore.get('videoResponse');
  assert.ok(videoResponse, 'No video response received');
  const items = videoResponse.items;
  assert.ok(items.length > 0, 'No video items in response');
  
  const video = items[0];
  const liveStreamingDetails = video.liveStreamingDetails;
  assert.ok(
    liveStreamingDetails,
    'Video does not have liveStreamingDetails'
  );
  console.log('Verified video has liveStreamingDetails');
});

// Verify video has activeLiveChatId
step('Verify video has activeLiveChatId <expectedChatId>', async function (expectedChatId) {
  const videoResponse = gauge.dataStore.scenarioStore.get('videoResponse');
  assert.ok(videoResponse, 'No video response received');
  const items = videoResponse.items;
  assert.ok(items.length > 0, 'No video items in response');
  
  const video = items[0];
  const liveStreamingDetails = video.liveStreamingDetails;
  assert.ok(liveStreamingDetails, 'Video does not have liveStreamingDetails');
  
  const chatIdFromVideo = liveStreamingDetails.activeLiveChatId;
  gauge.dataStore.scenarioStore.put('chatIdFromVideo', chatIdFromVideo);
  assert.strictEqual(
    chatIdFromVideo,
    expectedChatId,
    `activeLiveChatId is '${chatIdFromVideo}' but expected '${expectedChatId}'`
  );
  console.log(`Verified video has activeLiveChatId: ${expectedChatId}`);
});

// Verify chat ID can be used with live chat service
step('Verify activeLiveChatId can be used with live chat service', async function () {
  const chatIdFromVideo = gauge.dataStore.scenarioStore.get('chatIdFromVideo');
  const grpcServerAddress = gauge.dataStore.specStore.get('grpcServerAddress');
  
  assert.ok(chatIdFromVideo, 'No chat ID obtained from video');
  
  // Create a live chat client if not already created
  let client = gauge.dataStore.scenarioStore.get('client');
  if (!client) {
    client = new services.V3DataLiveChatMessageServiceClient(
      grpcServerAddress,
      grpc.credentials.createInsecure()
    );
    gauge.dataStore.scenarioStore.put('client', client);
  }

  const request = new messages.LiveChatMessageListRequest();
  request.setLiveChatId(chatIdFromVideo);
  request.setPartList(['snippet', 'authorDetails']);

  const streamData = setupStreamWithListeners(() => client.streamList(request));
  const result = await awaitStreamCompletion(streamData, 3000);
  
  // Verify we received at least one message
  assert.ok(
    result.messages.length > 0,
    'No messages received from live chat service'
  );
  console.log('Successfully verified chat ID works with live chat service');
});

// Request video via REST API without id parameter
step('Request video via REST without id parameter', async function () {
  const restServerAddress = gauge.dataStore.specStore.get('restServerAddress');
  if (!restServerAddress) {
    throw new Error('REST server address not set. Please set REST_SERVER_ADDRESS environment variable or use default.');
  }

  const url = new URL('/youtube/v3/videos', restServerAddress);
  url.searchParams.append('part', 'liveStreamingDetails');
  
  console.log(`Requesting video from: ${url.toString()}`);

  const response = await fetch(url.toString());
  const statusCode = response.status;
  gauge.dataStore.scenarioStore.put('lastHttpStatusCode', statusCode);

  const videoResponse = await response.json();
  gauge.dataStore.scenarioStore.put('videoResponse', videoResponse);
  console.log(`Received error response with status ${statusCode}`);
});

// Request video via REST API without part parameter
step('Request video via REST without part parameter', async function () {
  const restServerAddress = gauge.dataStore.specStore.get('restServerAddress');
  if (!restServerAddress) {
    throw new Error('REST server address not set. Please set REST_SERVER_ADDRESS environment variable or use default.');
  }

  const url = new URL('/youtube/v3/videos', restServerAddress);
  url.searchParams.append('id', 'test-video-1');
  
  console.log(`Requesting video from: ${url.toString()}`);

  const response = await fetch(url.toString());
  const statusCode = response.status;
  gauge.dataStore.scenarioStore.put('lastHttpStatusCode', statusCode);

  const videoResponse = await response.json();
  gauge.dataStore.scenarioStore.put('videoResponse', videoResponse);
  console.log(`Received error response with status ${statusCode}`);
});

// Verify response status code
step('Verify response status code is <statusCode>', async function (statusCode) {
  const lastHttpStatusCode = gauge.dataStore.scenarioStore.get('lastHttpStatusCode');
  const expectedStatusCode = parseInt(statusCode, 10);
  assert.strictEqual(
    lastHttpStatusCode,
    expectedStatusCode,
    `Response status code is ${lastHttpStatusCode} but expected ${expectedStatusCode}`
  );
  console.log(`Verified response status code: ${expectedStatusCode}`);
});

// Verify error response has error code
step('Verify error response has error code <errorCode>', async function (errorCode) {
  const videoResponse = gauge.dataStore.scenarioStore.get('videoResponse');
  assert.ok(videoResponse, 'No video response received');
  assert.ok(videoResponse.error, 'Response does not have error object');
  const expectedCode = parseInt(errorCode, 10);
  assert.strictEqual(
    videoResponse.error.code,
    expectedCode,
    `Error code is ${videoResponse.error.code} but expected ${expectedCode}`
  );
  console.log(`Verified error code: ${expectedCode}`);
});

// Verify error message contains text
step('Verify error message contains <text>', async function (text) {
  const videoResponse = gauge.dataStore.scenarioStore.get('videoResponse');
  assert.ok(videoResponse, 'No video response received');
  assert.ok(videoResponse.error, 'Response does not have error object');
  assert.ok(videoResponse.error.message, 'Error object does not have message');
  assert.ok(
    videoResponse.error.message.includes(text),
    `Error message '${videoResponse.error.message}' does not contain '${text}'`
  );
  console.log(`Verified error message contains: ${text}`);
});

// Authorization Tests for REST API

// Request video without authentication
step('Request video via REST without authentication', async function () {
  const restServerAddress = gauge.dataStore.specStore.get('restServerAddress');
  await makeRestRequest(
    restServerAddress,
    '/youtube/v3/videos',
    { id: 'test-video-1', part: 'liveStreamingDetails' }
  );
});

// Request video with API key parameter
step('Request video via REST with API key parameter', async function () {
  const restServerAddress = gauge.dataStore.specStore.get('restServerAddress');
  await makeRestRequest(
    restServerAddress,
    '/youtube/v3/videos',
    { id: 'test-video-1', part: 'liveStreamingDetails', key: 'test-api-key-123' }
  );
});

// Request video with Authorization header
step('Request video via REST with authorization header', async function () {
  const restServerAddress = gauge.dataStore.specStore.get('restServerAddress');
  await makeRestRequest(
    restServerAddress,
    '/youtube/v3/videos',
    { id: 'test-video-1', part: 'liveStreamingDetails' },
    { 'Authorization': 'Bearer test-oauth-token' }
  );
});

// Authorization Tests for gRPC API

// Send StreamList request without authentication
step('Send StreamList request without authentication', async function () {
  const client = gauge.dataStore.scenarioStore.get('client');
  const request = new messages.LiveChatMessageListRequest();
  request.setLiveChatId('live-chat-id-1');
  request.setPartList(['snippet', 'authorDetails']);

  const streamData = setupStreamWithListeners(() => client.streamList(request));
  const result = await awaitStreamCompletion(streamData, 3000);
  gauge.dataStore.scenarioStore.put('receivedMessages', result.messages);
  gauge.dataStore.scenarioStore.put('streamError', result.error);
});

// Send StreamList request with API key metadata
step('Send StreamList request with API key metadata', async function () {
  const client = gauge.dataStore.scenarioStore.get('client');
  const request = new messages.LiveChatMessageListRequest();
  request.setLiveChatId('live-chat-id-1');
  request.setPartList(['snippet', 'authorDetails']);

  const metadata = new grpc.Metadata();
  metadata.add('x-goog-api-key', 'test-api-key-123');

  const streamData = setupStreamWithListeners(() => client.streamList(request, metadata));
  const result = await awaitStreamCompletion(streamData, 3000);
  gauge.dataStore.scenarioStore.put('receivedMessages', result.messages);
  gauge.dataStore.scenarioStore.put('streamError', result.error);
});

// Send StreamList request with authorization metadata
step('Send StreamList request with authorization metadata', async function () {
  const client = gauge.dataStore.scenarioStore.get('client');
  const request = new messages.LiveChatMessageListRequest();
  request.setLiveChatId('live-chat-id-1');
  request.setPartList(['snippet', 'authorDetails']);

  const metadata = new grpc.Metadata();
  metadata.add('authorization', 'Bearer test-oauth-token');

  const streamData = setupStreamWithListeners(() => client.streamList(request, metadata));
  const result = await awaitStreamCompletion(streamData, 3000);
  gauge.dataStore.scenarioStore.put('receivedMessages', result.messages);
  gauge.dataStore.scenarioStore.put('streamError', result.error);
});

// Verify authentication error received
step('Verify authentication error received', async function () {
  const streamError = gauge.dataStore.scenarioStore.get('streamError');
  assert.ok(streamError, 'No stream error was received');
  
  // Check that it's an UNAUTHENTICATED error
  assert.strictEqual(
    streamError.code,
    grpc.status.UNAUTHENTICATED,
    `Error code is ${streamError.code} but expected ${grpc.status.UNAUTHENTICATED} (UNAUTHENTICATED)`
  );
  
  assert.ok(
    streamError.message.toLowerCase().includes('authentication'),
    `Error message '${streamError.message}' should mention authentication`
  );
  
  console.log('Verified authentication error received');
});

// Verify stream starts successfully (for auth tests)
step('Verify stream starts successfully', async function () {
  const receivedMessages = gauge.dataStore.scenarioStore.get('receivedMessages') || [];
  const streamError = gauge.dataStore.scenarioStore.get('streamError');
  
  // Verify no error occurred
  if (streamError && streamError.code !== grpc.status.CANCELLED) {
    throw new Error(`Stream error occurred: ${streamError.message}`);
  }
  
  // Verify we received at least one message
  assert.ok(
    receivedMessages.length > 0,
    'No messages received - stream should have started successfully'
  );
  
  console.log('Verified stream started successfully with authentication');
});

// Control Endpoints Steps

// Helper function to make HTTP POST requests to the control API
async function makeControlRequest(restServerAddress, path, body) {
  if (!restServerAddress) {
    throw new Error('REST server address not set. Please set REST_SERVER_ADDRESS environment variable or use default.');
  }

  const url = new URL(path, restServerAddress);
  
  console.log(`Making POST request to: ${url.toString()}`);
  console.log(`Request body: ${JSON.stringify(body)}`);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const statusCode = response.status;
  gauge.dataStore.scenarioStore.put('lastHttpStatusCode', statusCode);

  const data = await response.json();
  gauge.dataStore.scenarioStore.put('controlResponse', data);
  console.log(`Received response with status ${statusCode}`);
  console.log(`Response: ${JSON.stringify(data)}`);
  
  return { statusCode, data };
}

// Create video via control endpoint
step('Create video via control endpoint with id <videoId> and liveChatId <liveChatId>', async function (videoId, liveChatId) {
  const restServerAddress = gauge.dataStore.specStore.get('restServerAddress');
  const requestBody = {
    id: videoId,
    channelId: 'test-channel',
    title: 'Test Video',
    description: 'A test video created via control endpoint',
    channelTitle: 'Test Channel',
    publishedAt: '2024-01-01T00:00:00Z',
    liveChatId: liveChatId,
    actualStartTime: '2024-01-01T00:00:00Z',
    concurrentViewers: 100
  };

  await makeControlRequest(restServerAddress, '/control/videos', requestBody);
  console.log(`Created video with id: ${videoId}`);
});

// Create chat message via control endpoint
step('Create chat message via control endpoint with id <messageId> and liveChatId <liveChatId>', async function (messageId, liveChatId) {
  const restServerAddress = gauge.dataStore.specStore.get('restServerAddress');
  const requestBody = {
    id: messageId,
    liveChatId: liveChatId,
    authorChannelId: 'test-author',
    authorDisplayName: 'Test Author',
    messageText: 'Test message from control endpoint',
    publishedAt: '2024-01-01T00:00:00Z',
    isVerified: true
  };

  await makeControlRequest(restServerAddress, '/control/chat_messages', requestBody);
  console.log(`Created chat message with id: ${messageId}`);
});

// Create video via control endpoint without publishedAt (uses default current datetime)
step('Create video via control endpoint without publishedAt with id <videoId> and liveChatId <liveChatId>', async function (videoId, liveChatId) {
  const restServerAddress = gauge.dataStore.specStore.get('restServerAddress');
  const requestBody = {
    id: videoId,
    channelId: 'test-channel',
    title: 'Test Video with Default DateTime',
    description: 'A test video created via control endpoint without publishedAt',
    channelTitle: 'Test Channel',
    liveChatId: liveChatId,
    concurrentViewers: 100
  };

  await makeControlRequest(restServerAddress, '/control/videos', requestBody);
  console.log(`Created video with id: ${videoId} without publishedAt (using default datetime)`);
});

// Create chat message via control endpoint without publishedAt (uses default current datetime)
step('Create chat message via control endpoint without publishedAt with id <messageId> and liveChatId <liveChatId>', async function (messageId, liveChatId) {
  const restServerAddress = gauge.dataStore.specStore.get('restServerAddress');
  const requestBody = {
    id: messageId,
    liveChatId: liveChatId,
    authorChannelId: 'test-author',
    authorDisplayName: 'Test Author',
    messageText: 'Test message from control endpoint without publishedAt',
    isVerified: true
  };

  await makeControlRequest(restServerAddress, '/control/chat_messages', requestBody);
  console.log(`Created chat message with id: ${messageId} without publishedAt (using default datetime)`);
});

// Verify that publishedAt exists and is a valid ISO8601 datetime
step('Verify video has valid publishedAt datetime', async function () {
  const videoResponse = gauge.dataStore.scenarioStore.get('videoResponse');
  assert.ok(videoResponse, 'No video response received');
  const items = videoResponse.items;
  assert.ok(items.length > 0, 'No video items in response');
  
  const video = items[0];
  const snippet = video.snippet;
  assert.ok(snippet, 'Video does not have snippet');
  assert.ok(snippet.publishedAt, 'Video snippet does not have publishedAt');
  
  const publishedAt = snippet.publishedAt;
  validateISO8601DateTime(publishedAt, 'publishedAt');
  
  console.log(`Verified video has valid ISO8601 publishedAt: ${publishedAt}`);
  gauge.dataStore.scenarioStore.put('videoPublishedAt', publishedAt);
});

// Verify that video publishedAt is recent (within specified minutes)
step('Verify video publishedAt is within <maxMinutes> minutes', async function (maxMinutes) {
  const publishedAt = gauge.dataStore.scenarioStore.get('videoPublishedAt');
  assert.ok(publishedAt, 'No publishedAt stored. Run "Verify video has valid publishedAt datetime" step first.');
  
  const maxDiffMinutes = parseInt(maxMinutes, 10);
  validateRecentDateTime(publishedAt, maxDiffMinutes, 'publishedAt');
  
  console.log(`Verified video publishedAt is within ${maxMinutes} minutes`);
});

// Verify that published_at in chat message exists and is a valid ISO8601 datetime
step('Verify chat message has valid publishedAt datetime', async function () {
  const receivedMessages = gauge.dataStore.scenarioStore.get('receivedMessages') || [];
  assert.ok(receivedMessages.length > 0, 'No messages received');
  
  // Get the first message
  const firstMessage = receivedMessages[0];
  const items = firstMessage.getItemsList();
  assert.ok(items.length > 0, 'No items in message');
  
  const item = items[0];
  const snippet = item.getSnippet();
  assert.ok(snippet, 'Message does not have snippet');
  
  const publishedAt = snippet.getPublishedAt();
  assert.ok(publishedAt, 'Message snippet does not have publishedAt');
  
  validateISO8601DateTime(publishedAt, 'publishedAt');
  
  console.log(`Verified chat message has valid ISO8601 publishedAt: ${publishedAt}`);
  gauge.dataStore.scenarioStore.put('chatMessagePublishedAt', publishedAt);
});

// Verify that chat message publishedAt is recent (within specified minutes)
step('Verify chat message publishedAt is within <maxMinutes> minutes', async function (maxMinutes) {
  const publishedAt = gauge.dataStore.scenarioStore.get('chatMessagePublishedAt');
  assert.ok(publishedAt, 'No publishedAt stored. Run "Verify chat message has valid publishedAt datetime" step first.');
  
  const maxDiffMinutes = parseInt(maxMinutes, 10);
  validateRecentDateTime(publishedAt, maxDiffMinutes, 'publishedAt');
  
  console.log(`Verified chat message publishedAt is within ${maxMinutes} minutes`);
});

// Verify control response success
step('Verify control response success is <expectedSuccess>', async function (expectedSuccess) {
  const controlResponse = gauge.dataStore.scenarioStore.get('controlResponse');
  assert.ok(controlResponse, 'No control response received');
  
  const expectedBool = expectedSuccess === 'true';
  assert.strictEqual(
    controlResponse.success,
    expectedBool,
    `Control response success is '${controlResponse.success}' but expected '${expectedBool}'`
  );
  console.log(`Verified control response success: ${expectedBool}`);
});

// Verify control response message contains text
step('Verify control response message contains <text>', async function (text) {
  const controlResponse = gauge.dataStore.scenarioStore.get('controlResponse');
  assert.ok(controlResponse, 'No control response received');
  assert.ok(controlResponse.message, 'No message in control response');
  
  assert.ok(
    controlResponse.message.includes(text),
    `Control response message '${controlResponse.message}' does not contain '${text}'`
  );
  console.log(`Verified control response message contains: ${text}`);
});

// Verify message with specific id exists in stream
step('Verify message with id <messageId> exists in stream', async function (messageId) {
  const receivedMessages = gauge.dataStore.scenarioStore.get('receivedMessages') || [];
  
  let messageFound = false;
  for (const message of receivedMessages) {
    const items = message.getItemsList();
    for (const item of items) {
      if (item.getId() === messageId) {
        messageFound = true;
        console.log(`Found message with id: ${messageId}`);
        break;
      }
    }
    if (messageFound) break;
  }
  
  assert.ok(
    messageFound,
    `Message with id '${messageId}' not found in stream. Received ${receivedMessages.length} message(s).`
  );
  console.log(`Verified message with id '${messageId}' exists in stream`);
});

// Verify message with specific id does not exist in stream
step('Verify message with id <messageId> does not exist in stream', async function (messageId) {
  const receivedMessages = gauge.dataStore.scenarioStore.get('receivedMessages') || [];
  
  let messageFound = false;
  for (const message of receivedMessages) {
    const items = message.getItemsList();
    for (const item of items) {
      if (item.getId() === messageId) {
        messageFound = true;
        break;
      }
    }
    if (messageFound) break;
  }
  
  assert.ok(
    !messageFound,
    `Message with id '${messageId}' should not exist in stream but was found.`
  );
  console.log(`Verified message with id '${messageId}' does not exist in stream`);
});

// Pagination Tests

// Verify each message has next_page_token
step('Verify each message has next_page_token', async function () {
  const receivedMessages = gauge.dataStore.scenarioStore.get('receivedMessages') || [];
  assert.ok(receivedMessages.length > 0, 'No messages received');
  
  receivedMessages.forEach((message, index) => {
    const nextPageToken = message.getNextPageToken();
    
    // All messages should have a next_page_token (including the last one)
    // to allow resuming the stream later if new messages are added
    assert.ok(
      nextPageToken && nextPageToken !== '',
      `Message ${index} should have next_page_token but it's empty or missing`
    );
    console.log(`Message ${index} has next_page_token: ${nextPageToken}`);
  });
  console.log('Verified all messages have pagination tokens');
});

// Receive first message and extract page_token
step('Receive first message and extract page_token', async function () {
  const streamData = gauge.dataStore.scenarioStore.get('streamData');
  const result = await awaitStreamCompletion(streamData, 5000);
  
  assert.ok(result.messages.length > 0, 'No messages received');
  const firstMessage = result.messages[0];
  const nextPageToken = firstMessage.getNextPageToken();
  console.log(`Extracted next_page_token from first message: ${nextPageToken}`);
  gauge.dataStore.scenarioStore.put('extractedPageToken', nextPageToken);
});

// Send StreamList request with extracted page_token
step('Send StreamList request with extracted page_token', async function () {
  const client = gauge.dataStore.scenarioStore.get('client');
  const pageToken = gauge.dataStore.scenarioStore.get('extractedPageToken');
  
  assert.ok(pageToken, 'No page_token was extracted from previous request');
  console.log(`Using extracted page_token: ${pageToken}`);
  
  const request = new messages.LiveChatMessageListRequest();
  request.setLiveChatId('test-chat-id');
  request.setPartList(['snippet', 'authorDetails']);
  request.setPageToken(pageToken);

  const streamData = setupStreamWithListeners(() => client.streamList(request));
  gauge.dataStore.scenarioStore.put('streamData', streamData);
  console.log(`Sent StreamList request with page_token: ${pageToken}`);
});

// Receive remaining messages
step('Receive remaining messages', async function () {
  const streamData = gauge.dataStore.scenarioStore.get('streamData');
  const result = await awaitStreamCompletion(streamData);
  gauge.dataStore.scenarioStore.put('remainingMessages', result.messages);
  gauge.dataStore.scenarioStore.put('streamError', result.error);
});

// Verify first remaining message has specific ID
step('Verify first remaining message has ID <expectedId>', async function (expectedId) {
  const remainingMessages = gauge.dataStore.scenarioStore.get('remainingMessages') || [];
  assert.ok(remainingMessages.length > 0, 'No remaining messages received');
  
  // Get the first message from the remaining messages
  const firstItem = remainingMessages[0].getItemsList()[0];
  const actualMessageId = firstItem.getId();
  
  // Verify it matches the expected ID from the spec
  assert.strictEqual(
    actualMessageId,
    expectedId,
    `Expected first remaining message to have ID '${expectedId}' but got '${actualMessageId}'`
  );
  
  console.log(`Verified first remaining message has ID: ${actualMessageId}`);
  console.log(`Received ${remainingMessages.length} message(s) in continuation`);
});

// Edge case tests for page_token

// Send StreamList request with page_token for a specific value
step('Send StreamList request with page_token <tokenValue>', async function (tokenValue) {
  const client = gauge.dataStore.scenarioStore.get('client');
  const liveChatId = gauge.dataStore.scenarioStore.get('liveChatId') || 'test-chat-id';
  const request = new messages.LiveChatMessageListRequest();
  request.setLiveChatId(liveChatId);
  request.setPartList(['snippet', 'authorDetails']);
  
  // Create page token by base64 encoding the provided value
  const pageToken = Buffer.from(tokenValue).toString('base64');
  request.setPageToken(pageToken);
  console.log(`Created page_token from value '${tokenValue}': ${pageToken}`);

  // Set up stream with all listeners attached immediately
  const streamData = setupStreamWithListeners(() => client.streamList(request));
  
  gauge.dataStore.scenarioStore.put('streamData', streamData);
  console.log(`Sent StreamList request with page_token: ${pageToken}`);
});

// Verify stream returned error
step('Verify stream returned error', async function () {
  const streamError = gauge.dataStore.scenarioStore.get('streamError');
  assert.ok(streamError, 'Expected stream error but none was received');
  console.log(`Verified stream returned error: ${streamError.message}`);
});

// Verify stream has no messages
step('Verify stream has no messages', async function () {
  const receivedMessages = gauge.dataStore.scenarioStore.get('receivedMessages') || [];
  assert.strictEqual(
    receivedMessages.length,
    0,
    `Expected empty stream but received ${receivedMessages.length} message(s)`
  );
  console.log('Verified stream has no messages');
});

// Verify error with message containing specific text
step('Verify error with message containing <text>', async function (text) {
  const streamError = gauge.dataStore.scenarioStore.get('streamError');
  assert.ok(streamError, 'No stream error was received');
  
  assert.strictEqual(
    streamError.code,
    grpc.status.INVALID_ARGUMENT,
    `Error code is ${streamError.code} but expected ${grpc.status.INVALID_ARGUMENT} (INVALID_ARGUMENT)`
  );
  
  assert.ok(
    streamError.message.includes(text),
    `Error message '${streamError.message}' should contain '${text}'`
  );
  
  console.log(`Verified error contains: ${text}`);
});
