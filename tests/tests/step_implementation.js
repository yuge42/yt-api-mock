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
