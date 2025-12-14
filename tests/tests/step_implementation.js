/* globals gauge, step */
'use strict';

const grpc = require('@grpc/grpc-js');
const messages = require('../proto-gen/stream_list_pb');
const services = require('../proto-gen/stream_list_grpc_pb');
const { spawn } = require('child_process');
const assert = require('assert');

let serverProcess = null;
let client = null;
let streamCall = null;
let receivedMessages = [];

// Start the mock server before tests
step('Start the mock server on port <port>', async function (port) {
  return new Promise((resolve, reject) => {
    const newEnv = Object.assign({}, process.env);
    newEnv.BIND_ADDRESS = `127.0.0.1:${port}`;
    
    // Start the server using cargo run
    serverProcess = spawn('cargo', ['run', '-p', 'server'], {
      cwd: '/home/runner/work/yt-api-mock/yt-api-mock',
      env: newEnv
    });

    let serverStarted = false;

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`Server output: ${output}`);
      if (output.includes('Server listening on')) {
        serverStarted = true;
        // Give the server a moment to fully initialize
        setTimeout(resolve, 1000);
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`Server error: ${data}`);
    });

    serverProcess.on('error', (error) => {
      reject(new Error(`Failed to start server: ${error.message}`));
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!serverStarted) {
        reject(new Error('Server did not start within 30 seconds'));
      }
    }, 30000);
  });
});

// Connect to the server
step('Connect to the server at <address>', async function (address) {
  client = new services.V3DataLiveChatMessageServiceClient(
    address,
    grpc.credentials.createInsecure()
  );
  console.log(`Connected to server at ${address}`);
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
      if (receivedMessages.length > 0 || error.code === 1) {
        // Code 1 is CANCELLED
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
  console.log('Connection closed');
});

// Stop the mock server
step('Stop the mock server', async function () {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    
    return new Promise((resolve) => {
      serverProcess.on('close', (code) => {
        console.log(`Server process exited with code ${code}`);
        serverProcess = null;
        resolve();
      });

      // Force kill after 5 seconds if not closed gracefully
      setTimeout(() => {
        if (serverProcess) {
          serverProcess.kill('SIGKILL');
          serverProcess = null;
        }
        resolve();
      }, 5000);
    });
  }
});
