/* globals gauge, step, beforeScenario */
'use strict';

const grpc = require('@grpc/grpc-js');
const messages = require('../proto-gen/stream_list_pb');
const services = require('../proto-gen/stream_list_grpc_pb');
const assert = require('assert');
const { URL } = require('url');
const fetch = require('node-fetch');

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

  const streamCall = client.streamList(request);
  gauge.dataStore.scenarioStore.put('streamCall', streamCall);
  console.log(`Sent StreamList request for chat ID: ${liveChatId} with parts: ${partsList.join(', ')}`);
});

// Receive stream of messages
step('Receive stream of messages', async function () {
  const streamCall = gauge.dataStore.scenarioStore.get('streamCall');
  return new Promise((resolve, reject) => {
    const receivedMessages = [];
    let streamEnded = false;
    let errorOccurred = false;

    streamCall.on('data', (response) => {
      console.log(`Received message: ${response.getEtag()}`);
      receivedMessages.push(response);
    });

    streamCall.on('end', () => {
      console.log('Stream ended normally');
      streamEnded = true;
      if (!errorOccurred) {
        gauge.dataStore.scenarioStore.put('receivedMessages', receivedMessages);
        resolve();
      }
    });

    streamCall.on('error', (error) => {
      console.log(`Stream error: ${error.message}`);
      errorOccurred = true;
      // If we've received messages, don't treat this as a failure
      // The cancel operation will trigger an error, which is expected
      if (receivedMessages.length > 0 || error.code === grpc.status.CANCELLED) {
        gauge.dataStore.scenarioStore.put('receivedMessages', receivedMessages);
        resolve();
      } else {
        reject(new Error(`Stream error: ${error.message}`));
      }
    });

    // Set a timeout to end the stream collection after a reasonable time
    setTimeout(() => {
      if (!streamEnded && !errorOccurred) {
        streamCall.cancel();
      }
      // Give a small delay for the cancel to propagate
      setTimeout(() => {
        if (!streamEnded && receivedMessages.length > 0) {
          gauge.dataStore.scenarioStore.put('receivedMessages', receivedMessages);
          resolve();
        }
      }, 100);
    }, 10000);
  });
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
  const streamCall = gauge.dataStore.scenarioStore.get('streamCall');
  const client = gauge.dataStore.scenarioStore.get('client');
  
  if (streamCall) {
    streamCall.cancel();
    gauge.dataStore.scenarioStore.put('streamCall', null);
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
  
  return new Promise((resolve, reject) => {
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

    const stream = client.streamList(request);
    let messageReceived = false;

    stream.on('data', (response) => {
      console.log(`Received live chat message with chat ID: ${chatIdFromVideo}`);
      messageReceived = true;
      stream.cancel();
    });

    stream.on('end', () => {
      if (messageReceived) {
        console.log('Successfully verified chat ID works with live chat service');
        resolve();
      } else {
        reject(new Error('No messages received from live chat service'));
      }
    });

    stream.on('error', (error) => {
      // CANCELLED is expected when we cancel the stream
      if (error.code === grpc.status.CANCELLED && messageReceived) {
        console.log('Successfully verified chat ID works with live chat service');
        resolve();
      } else if (!messageReceived) {
        reject(new Error(`Live chat stream error: ${error.message}`));
      }
    });

    // Timeout after 3 seconds
    setTimeout(() => {
      if (!messageReceived) {
        stream.cancel();
        reject(new Error('Timeout waiting for live chat message'));
      }
    }, 3000);
  });
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

  return new Promise((resolve, reject) => {
    const streamCall = client.streamList(request);
    let errorReceived = false;

    streamCall.on('error', (error) => {
      console.log(`Received expected error: ${error.message}, code: ${error.code}`);
      errorReceived = true;
      gauge.dataStore.scenarioStore.put('grpcError', error);
      resolve();
    });

    streamCall.on('data', (response) => {
      // Should not receive data if auth is required
      console.log('Unexpectedly received data when authentication should be required');
      streamCall.cancel();
      reject(new Error('Received data when authentication error was expected'));
    });

    streamCall.on('end', () => {
      if (!errorReceived) {
        reject(new Error('Stream ended without authentication error'));
      }
    });

    // Timeout after 3 seconds
    setTimeout(() => {
      if (!errorReceived) {
        streamCall.cancel();
        reject(new Error('Timeout waiting for authentication error'));
      }
    }, 3000);
  });
});

// Send StreamList request with API key metadata
step('Send StreamList request with API key metadata', async function () {
  const client = gauge.dataStore.scenarioStore.get('client');
  const request = new messages.LiveChatMessageListRequest();
  request.setLiveChatId('live-chat-id-1');
  request.setPartList(['snippet', 'authorDetails']);

  const metadata = new grpc.Metadata();
  metadata.add('x-goog-api-key', 'test-api-key-123');

  return new Promise((resolve, reject) => {
    const streamCall = client.streamList(request, metadata);
    let dataReceived = false;

    streamCall.on('data', (response) => {
      console.log('Successfully received data with API key authentication');
      dataReceived = true;
      streamCall.cancel();
      resolve();
    });

    streamCall.on('error', (error) => {
      // CANCELLED is expected when we cancel the stream
      if (error.code === grpc.status.CANCELLED && dataReceived) {
        resolve();
      } else if (!dataReceived) {
        reject(new Error(`Stream error: ${error.message}`));
      }
    });

    streamCall.on('end', () => {
      if (!dataReceived) {
        reject(new Error('Stream ended without receiving data'));
      }
    });

    // Timeout after 3 seconds
    setTimeout(() => {
      if (!dataReceived) {
        streamCall.cancel();
        reject(new Error('Timeout waiting for data with API key'));
      }
    }, 3000);
  });
});

// Send StreamList request with authorization metadata
step('Send StreamList request with authorization metadata', async function () {
  const client = gauge.dataStore.scenarioStore.get('client');
  const request = new messages.LiveChatMessageListRequest();
  request.setLiveChatId('live-chat-id-1');
  request.setPartList(['snippet', 'authorDetails']);

  const metadata = new grpc.Metadata();
  metadata.add('authorization', 'Bearer test-oauth-token');

  return new Promise((resolve, reject) => {
    const streamCall = client.streamList(request, metadata);
    let dataReceived = false;

    streamCall.on('data', (response) => {
      console.log('Successfully received data with authorization header');
      dataReceived = true;
      streamCall.cancel();
      resolve();
    });

    streamCall.on('error', (error) => {
      // CANCELLED is expected when we cancel the stream
      if (error.code === grpc.status.CANCELLED && dataReceived) {
        resolve();
      } else if (!dataReceived) {
        reject(new Error(`Stream error: ${error.message}`));
      }
    });

    streamCall.on('end', () => {
      if (!dataReceived) {
        reject(new Error('Stream ended without receiving data'));
      }
    });

    // Timeout after 3 seconds
    setTimeout(() => {
      if (!dataReceived) {
        streamCall.cancel();
        reject(new Error('Timeout waiting for data with authorization header'));
      }
    }, 3000);
  });
});

// Verify authentication error received
step('Verify authentication error received', async function () {
  const grpcError = gauge.dataStore.scenarioStore.get('grpcError');
  assert.ok(grpcError, 'No gRPC error was received');
  
  // Check that it's an UNAUTHENTICATED error
  assert.strictEqual(
    grpcError.code,
    grpc.status.UNAUTHENTICATED,
    `Error code is ${grpcError.code} but expected ${grpc.status.UNAUTHENTICATED} (UNAUTHENTICATED)`
  );
  
  assert.ok(
    grpcError.message.toLowerCase().includes('authentication'),
    `Error message '${grpcError.message}' should mention authentication`
  );
  
  console.log('Verified authentication error received');
});

// Verify stream starts successfully (for auth tests)
step('Verify stream starts successfully', async function () {
  // This step is just a marker - the actual verification happens in the previous step
  // If we reach here, it means the stream started successfully
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
  const streamCall = gauge.dataStore.scenarioStore.get('streamCall');
  return new Promise((resolve, reject) => {
    let firstMessage = null;
    let streamEnded = false;
    let errorOccurred = false;

    streamCall.on('data', (response) => {
      if (!firstMessage) {
        console.log(`Received first message: ${response.getEtag()}`);
        firstMessage = response;
        const nextPageToken = response.getNextPageToken();
        console.log(`Extracted next_page_token: ${nextPageToken}`);
        gauge.dataStore.scenarioStore.put('extractedPageToken', nextPageToken);
        // Cancel the stream after receiving the first message
        streamCall.cancel();
      }
    });

    streamCall.on('end', () => {
      console.log('Stream ended');
      streamEnded = true;
      if (!errorOccurred && firstMessage) {
        resolve();
      }
    });

    streamCall.on('error', (error) => {
      console.log(`Stream error: ${error.message}`);
      errorOccurred = true;
      // If we've received the first message and got a CANCELLED error, that's expected
      if (firstMessage && error.code === grpc.status.CANCELLED) {
        resolve();
      } else if (!firstMessage) {
        reject(new Error(`Stream error before receiving first message: ${error.message}`));
      }
    });

    // Set a timeout
    setTimeout(() => {
      if (!streamEnded && !firstMessage) {
        streamCall.cancel();
        reject(new Error('Timeout waiting for first message'));
      } else if (!streamEnded && firstMessage) {
        resolve();
      }
    }, 5000);
  });
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

  const streamCall = client.streamList(request);
  gauge.dataStore.scenarioStore.put('streamCall', streamCall);
  console.log(`Sent StreamList request with page_token: ${pageToken}`);
});

// Receive remaining messages
step('Receive remaining messages', async function () {
  const streamCall = gauge.dataStore.scenarioStore.get('streamCall');
  return new Promise((resolve, reject) => {
    const receivedMessages = [];
    let streamEnded = false;
    let errorOccurred = false;

    streamCall.on('data', (response) => {
      console.log(`Received message: ${response.getEtag()}`);
      receivedMessages.push(response);
    });

    streamCall.on('end', () => {
      console.log('Stream ended normally');
      streamEnded = true;
      if (!errorOccurred) {
        gauge.dataStore.scenarioStore.put('remainingMessages', receivedMessages);
        resolve();
      }
    });

    streamCall.on('error', (error) => {
      console.log(`Stream error: ${error.message}`);
      errorOccurred = true;
      // If we've received messages, don't treat this as a failure
      if (receivedMessages.length > 0 || error.code === grpc.status.CANCELLED) {
        gauge.dataStore.scenarioStore.put('remainingMessages', receivedMessages);
        resolve();
      } else {
        reject(new Error(`Stream error: ${error.message}`));
      }
    });

    // Set a timeout to end the stream collection
    setTimeout(() => {
      if (!streamEnded && !errorOccurred) {
        streamCall.cancel();
      }
      // Give a small delay for the cancel to propagate
      setTimeout(() => {
        if (!streamEnded && receivedMessages.length > 0) {
          gauge.dataStore.scenarioStore.put('remainingMessages', receivedMessages);
          resolve();
        } else if (!streamEnded && receivedMessages.length === 0) {
          reject(new Error('No messages received'));
        }
      }, 100);
    }, 10000);
  });
});

// Verify messages start from second message
step('Verify messages start from second message', async function () {
  const remainingMessages = gauge.dataStore.scenarioStore.get('remainingMessages') || [];
  assert.ok(remainingMessages.length > 0, 'No remaining messages received');
  
  // The first item in remainingMessages should be the second message from the original stream
  // Check that the message IDs are correct (should start from test-msg-id-1 instead of test-msg-id-0)
  const firstItem = remainingMessages[0].getItemsList()[0];
  const messageId = firstItem.getId();
  
  // Should not be the first message (test-msg-id-0)
  assert.notStrictEqual(
    messageId,
    'test-msg-id-0',
    'First message in paginated results should not be test-msg-id-0'
  );
  
  console.log(`Verified pagination: first message in continuation is ${messageId}`);
  console.log(`Received ${remainingMessages.length} message(s) in continuation`);
});

// Edge case tests for page_token

// Send StreamList request with negative page_token
step('Send StreamList request with negative page_token', async function () {
  const client = gauge.dataStore.scenarioStore.get('client');
  const request = new messages.LiveChatMessageListRequest();
  request.setLiveChatId('test-chat-id');
  request.setPartList(['snippet', 'authorDetails']);
  
  // Create a negative page token (base64 encode "-5")
  const negativeToken = Buffer.from('-5').toString('base64');
  request.setPageToken(negativeToken);

  return new Promise((resolve, reject) => {
    const streamCall = client.streamList(request);
    let errorReceived = false;

    streamCall.on('error', (error) => {
      console.log(`Received expected error: ${error.message}, code: ${error.code}`);
      errorReceived = true;
      gauge.dataStore.scenarioStore.put('grpcError', error);
      resolve();
    });

    streamCall.on('data', (response) => {
      // Should not receive data
      streamCall.cancel();
      reject(new Error('Received data when error was expected for negative index'));
    });

    streamCall.on('end', () => {
      if (!errorReceived) {
        reject(new Error('Stream ended without error for negative index'));
      }
    });

    setTimeout(() => {
      if (!errorReceived) {
        streamCall.cancel();
        reject(new Error('Timeout waiting for error on negative index'));
      }
    }, 3000);
  });
});

// Send StreamList request with non-numeric page_token
step('Send StreamList request with non-numeric page_token', async function () {
  const client = gauge.dataStore.scenarioStore.get('client');
  const request = new messages.LiveChatMessageListRequest();
  request.setLiveChatId('test-chat-id');
  request.setPartList(['snippet', 'authorDetails']);
  
  // Create a non-numeric page token (base64 encode "abc")
  const nonNumericToken = Buffer.from('abc').toString('base64');
  request.setPageToken(nonNumericToken);

  return new Promise((resolve, reject) => {
    const streamCall = client.streamList(request);
    let errorReceived = false;

    streamCall.on('error', (error) => {
      console.log(`Received expected error: ${error.message}, code: ${error.code}`);
      errorReceived = true;
      gauge.dataStore.scenarioStore.put('grpcError', error);
      resolve();
    });

    streamCall.on('data', (response) => {
      // Should not receive data
      streamCall.cancel();
      reject(new Error('Received data when error was expected for non-numeric token'));
    });

    streamCall.on('end', () => {
      if (!errorReceived) {
        reject(new Error('Stream ended without error for non-numeric token'));
      }
    });

    setTimeout(() => {
      if (!errorReceived) {
        streamCall.cancel();
        reject(new Error('Timeout waiting for error on non-numeric token'));
      }
    }, 3000);
  });
});

// Send StreamList request with page_token beyond message range
step('Send StreamList request with page_token beyond message range', async function () {
  const client = gauge.dataStore.scenarioStore.get('client');
  const request = new messages.LiveChatMessageListRequest();
  request.setLiveChatId('test-chat-id');
  request.setPartList(['snippet', 'authorDetails']);
  
  // Create a page token for index 100 (beyond range)
  const beyondRangeToken = Buffer.from('100').toString('base64');
  request.setPageToken(beyondRangeToken);

  const streamCall = client.streamList(request);
  gauge.dataStore.scenarioStore.put('streamCall', streamCall);
  console.log(`Sent StreamList request with page_token beyond range: ${beyondRangeToken}`);
});

// Verify empty stream response
step('Verify empty stream response', async function () {
  const streamCall = gauge.dataStore.scenarioStore.get('streamCall');
  return new Promise((resolve, reject) => {
    const receivedMessages = [];
    let streamEnded = false;

    streamCall.on('data', (response) => {
      console.log(`Unexpectedly received message: ${response.getEtag()}`);
      receivedMessages.push(response);
    });

    streamCall.on('end', () => {
      console.log('Stream ended');
      streamEnded = true;
      // Verify no messages were received
      assert.strictEqual(
        receivedMessages.length,
        0,
        `Expected empty stream but received ${receivedMessages.length} message(s)`
      );
      console.log('Verified empty stream for index beyond range');
      resolve();
    });

    streamCall.on('error', (error) => {
      // CANCELLED is expected if we cancel, but we shouldn't get other errors
      if (error.code === grpc.status.CANCELLED) {
        // Check if we got messages before cancel
        assert.strictEqual(
          receivedMessages.length,
          0,
          `Expected empty stream but received ${receivedMessages.length} message(s)`
        );
        resolve();
      } else {
        reject(new Error(`Unexpected error: ${error.message}`));
      }
    });

    setTimeout(() => {
      if (!streamEnded) {
        streamCall.cancel();
      }
      setTimeout(() => {
        if (receivedMessages.length === 0) {
          console.log('Verified empty stream for index beyond range');
          resolve();
        }
      }, 100);
    }, 3000);
  });
});

// Verify error with message containing specific text
step('Verify error with message containing <text>', async function (text) {
  const grpcError = gauge.dataStore.scenarioStore.get('grpcError');
  assert.ok(grpcError, 'No gRPC error was received');
  
  assert.strictEqual(
    grpcError.code,
    grpc.status.INVALID_ARGUMENT,
    `Error code is ${grpcError.code} but expected ${grpc.status.INVALID_ARGUMENT} (INVALID_ARGUMENT)`
  );
  
  assert.ok(
    grpcError.message.includes(text),
    `Error message '${grpcError.message}' should contain '${text}'`
  );
  
  console.log(`Verified error contains: ${text}`);
});
