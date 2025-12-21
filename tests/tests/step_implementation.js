/* globals gauge, step, beforeScenario */
'use strict';

const grpc = require('@grpc/grpc-js');
const messages = require('../proto-gen/stream_list_pb');
const services = require('../proto-gen/stream_list_grpc_pb');
const assert = require('assert');
const http = require('http');
const https = require('https');
const { URL } = require('url');

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

// Helper function to make HTTP requests to the REST API
function makeRestRequest(restServerAddress, path, queryParams = {}, headers = {}) {
  return new Promise((resolve, reject) => {
    if (!restServerAddress) {
      reject(new Error('REST server address not set. Please set REST_SERVER_ADDRESS environment variable or use default.'));
      return;
    }

    const url = new URL(path, restServerAddress);
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const protocol = url.protocol === 'https:' ? https : http;
    const options = Object.keys(headers).length > 0 ? { headers } : {};
    
    console.log(`Making request to: ${url.toString()}`);

    const requestFn = Object.keys(headers).length > 0 
      ? (cb) => protocol.get(url.toString(), options, cb)
      : (cb) => protocol.get(url.toString(), cb);

    requestFn((res) => {
      let data = '';
      const statusCode = res.statusCode;
      gauge.dataStore.scenarioStore.put('lastHttpStatusCode', statusCode);

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          gauge.dataStore.scenarioStore.put('videoResponse', response);
          console.log(`Received response with status ${statusCode}`);
          resolve({ statusCode, data: response });
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`HTTP request failed: ${error.message}`));
    });
  });
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
  return new Promise((resolve, reject) => {
    if (!restServerAddress) {
      reject(new Error('REST server address not set. Please set REST_SERVER_ADDRESS environment variable or use default.'));
      return;
    }

    const url = new URL('/youtube/v3/videos', restServerAddress);
    url.searchParams.append('id', videoId);
    url.searchParams.append('part', parts);

    const protocol = url.protocol === 'https:' ? https : http;
    
    console.log(`Requesting video from: ${url.toString()}`);

    protocol.get(url.toString(), (res) => {
      let data = '';
      const statusCode = res.statusCode;
      gauge.dataStore.scenarioStore.put('lastHttpStatusCode', statusCode);

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const videoResponse = JSON.parse(data);
          gauge.dataStore.scenarioStore.put('videoResponse', videoResponse);
          console.log(`Received video response with status ${statusCode}`);
          if (videoResponse.items) {
            console.log(`Response has ${videoResponse.items.length} items`);
          }
          resolve();
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`HTTP request failed: ${error.message}`));
    });
  });
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
  return new Promise((resolve, reject) => {
    if (!restServerAddress) {
      reject(new Error('REST server address not set. Please set REST_SERVER_ADDRESS environment variable or use default.'));
      return;
    }

    const url = new URL('/youtube/v3/videos', restServerAddress);
    url.searchParams.append('part', 'liveStreamingDetails');

    const protocol = url.protocol === 'https:' ? https : http;
    
    console.log(`Requesting video from: ${url.toString()}`);

    protocol.get(url.toString(), (res) => {
      let data = '';
      const statusCode = res.statusCode;
      gauge.dataStore.scenarioStore.put('lastHttpStatusCode', statusCode);

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const videoResponse = JSON.parse(data);
          gauge.dataStore.scenarioStore.put('videoResponse', videoResponse);
          console.log(`Received error response with status ${statusCode}`);
          resolve();
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`HTTP request failed: ${error.message}`));
    });
  });
});

// Request video via REST API without part parameter
step('Request video via REST without part parameter', async function () {
  const restServerAddress = gauge.dataStore.specStore.get('restServerAddress');
  return new Promise((resolve, reject) => {
    if (!restServerAddress) {
      reject(new Error('REST server address not set. Please set REST_SERVER_ADDRESS environment variable or use default.'));
      return;
    }

    const url = new URL('/youtube/v3/videos', restServerAddress);
    url.searchParams.append('id', 'test-video-1');

    const protocol = url.protocol === 'https:' ? https : http;
    
    console.log(`Requesting video from: ${url.toString()}`);

    protocol.get(url.toString(), (res) => {
      let data = '';
      const statusCode = res.statusCode;
      gauge.dataStore.scenarioStore.put('lastHttpStatusCode', statusCode);

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const videoResponse = JSON.parse(data);
          gauge.dataStore.scenarioStore.put('videoResponse', videoResponse);
          console.log(`Received error response with status ${statusCode}`);
          resolve();
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`HTTP request failed: ${error.message}`));
    });
  });
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
function makeControlRequest(restServerAddress, path, body) {
  return new Promise((resolve, reject) => {
    if (!restServerAddress) {
      reject(new Error('REST server address not set. Please set REST_SERVER_ADDRESS environment variable or use default.'));
      return;
    }

    const url = new URL(path, restServerAddress);
    const protocol = url.protocol === 'https:' ? https : http;
    const postData = JSON.stringify(body);
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      }
    };

    console.log(`Making POST request to: ${url.toString()}`);
    console.log(`Request body: ${postData}`);

    const req = protocol.request(url.toString(), options, (res) => {
      let data = '';
      const statusCode = res.statusCode;
      gauge.dataStore.scenarioStore.put('lastHttpStatusCode', statusCode);

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          gauge.dataStore.scenarioStore.put('controlResponse', response);
          console.log(`Received response with status ${statusCode}`);
          console.log(`Response: ${data}`);
          resolve({ statusCode, data: response });
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`HTTP request failed: ${error.message}`));
    });

    req.write(postData);
    req.end();
  });
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
