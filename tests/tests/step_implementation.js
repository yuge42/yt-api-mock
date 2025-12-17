/* globals gauge, step, beforeScenario */
'use strict';

const grpc = require('@grpc/grpc-js');
const messages = require('../proto-gen/stream_list_pb');
const services = require('../proto-gen/stream_list_grpc_pb');
const videoMessages = require('../proto-gen/videos_list_pb');
const videoServices = require('../proto-gen/videos_list_grpc_pb');
const assert = require('assert');

let client = null;
let streamCall = null;
let receivedMessages = [];
let serverAddress = null;

// Video service variables
let videoClient = null;
let videoResponse = null;
let chatIdFromVideo = null;

// Store server address from environment or default
step('Server address from environment variable <envVar> or default <defaultAddress>', async function (envVar, defaultAddress) {
  serverAddress = process.env[envVar] || defaultAddress;
  console.log(`Server address set to: ${serverAddress}`);
});

// Connect to the server
step('Connect to the server', async function () {
  if (!serverAddress) {
    throw new Error('Server address not set. Please set SERVER_ADDRESS environment variable or use default.');
  }
  client = new services.V3DataLiveChatMessageServiceClient(
    serverAddress,
    grpc.credentials.createInsecure()
  );
  console.log(`Connected to server at ${serverAddress}`);
});

// Send StreamList request
step('Send StreamList request with live chat id <liveChatId> and parts <parts>', async function (liveChatId, parts) {
  const request = new messages.LiveChatMessageListRequest();
  request.setLiveChatId(liveChatId);
  
  const partsList = parts.split(',').map(p => p.trim());
  request.setPartList(partsList);

  streamCall = client.streamList(request);
  console.log(`Sent StreamList request for chat ID: ${liveChatId} with parts: ${partsList.join(', ')}`);
});

// Receive stream of messages
step('Receive stream of messages', async function () {
  return new Promise((resolve, reject) => {
    receivedMessages = [];
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
        resolve();
      }
    });

    streamCall.on('error', (error) => {
      console.log(`Stream error: ${error.message}`);
      errorOccurred = true;
      // If we've received messages, don't treat this as a failure
      // The cancel operation will trigger an error, which is expected
      if (receivedMessages.length > 0 || error.code === grpc.status.CANCELLED) {
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
          resolve();
        }
      }, 100);
    }, 10000);
  });
});

// Verify number of messages received
step('Verify received <count> messages', async function (count) {
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
  if (streamCall) {
    streamCall.cancel();
    streamCall = null;
  }
  if (client) {
    client.close();
    client = null;
  }
  if (videoClient) {
    videoClient.close();
    videoClient = null;
  }
  console.log('Connection closed');
});

// Video Service Steps

// Connect to the video service
step('Connect to the video service', async function () {
  if (!serverAddress) {
    throw new Error('Server address not set. Please set SERVER_ADDRESS environment variable or use default.');
  }
  videoClient = new videoServices.V3DataVideoServiceClient(
    serverAddress,
    grpc.credentials.createInsecure()
  );
  console.log(`Connected to video service at ${serverAddress}`);
});

// Request video with specific parts
step('Request video with id <videoId> and parts <parts>', async function (videoId, parts) {
  return new Promise((resolve, reject) => {
    const request = new videoMessages.VideosListRequest();
    request.setId(videoId);
    
    const partsList = parts.split(',').map(p => p.trim());
    request.setPartList(partsList);

    videoClient.list(request, (error, response) => {
      if (error) {
        console.error(`Error calling videos.list: ${error.message}`);
        reject(error);
      } else {
        videoResponse = response;
        console.log(`Received video response with ${response.getItemsList().length} items`);
        resolve();
      }
    });
  });
});

// Verify response kind
step('Verify response has kind <kind>', async function (kind) {
  assert.ok(videoResponse, 'No video response received');
  const responseKind = videoResponse.getKind();
  assert.strictEqual(
    responseKind,
    kind,
    `Response has kind '${responseKind}' but expected '${kind}'`
  );
  console.log(`Verified response has kind: ${kind}`);
});

// Verify number of video items
step('Verify response has <count> video items', async function (count) {
  assert.ok(videoResponse, 'No video response received');
  const items = videoResponse.getItemsList();
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
  assert.ok(videoResponse, 'No video response received');
  const items = videoResponse.getItemsList();
  assert.ok(items.length > 0, 'No video items in response');
  
  const video = items[0];
  const liveStreamingDetails = video.getLiveStreamingDetails();
  assert.ok(
    liveStreamingDetails,
    'Video does not have liveStreamingDetails'
  );
  console.log('Verified video has liveStreamingDetails');
});

// Verify video has activeLiveChatId
step('Verify video has activeLiveChatId <expectedChatId>', async function (expectedChatId) {
  assert.ok(videoResponse, 'No video response received');
  const items = videoResponse.getItemsList();
  assert.ok(items.length > 0, 'No video items in response');
  
  const video = items[0];
  const liveStreamingDetails = video.getLiveStreamingDetails();
  assert.ok(liveStreamingDetails, 'Video does not have liveStreamingDetails');
  
  chatIdFromVideo = liveStreamingDetails.getActiveLiveChatId();
  assert.strictEqual(
    chatIdFromVideo,
    expectedChatId,
    `activeLiveChatId is '${chatIdFromVideo}' but expected '${expectedChatId}'`
  );
  console.log(`Verified video has activeLiveChatId: ${expectedChatId}`);
});

// Verify chat ID can be used with live chat service
step('Verify activeLiveChatId can be used with live chat service', async function () {
  assert.ok(chatIdFromVideo, 'No chat ID obtained from video');
  
  return new Promise((resolve, reject) => {
    // Create a live chat client if not already created
    if (!client) {
      client = new services.V3DataLiveChatMessageServiceClient(
        serverAddress,
        grpc.credentials.createInsecure()
      );
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
