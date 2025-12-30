pub mod proto {
    tonic::include_proto!("youtube.api.v3");
    pub const FILE_DESCRIPTOR_SET: &[u8] =
        tonic::include_file_descriptor_set!("live_chat_service_descriptor");
}

use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use proto::v3_data_live_chat_message_service_server::{
    V3DataLiveChatMessageService, V3DataLiveChatMessageServiceServer,
};
use proto::{LiveChatMessageListRequest, LiveChatMessageListResponse};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tonic::{Request, Response, Status};

// Polling interval for checking new messages
const POLLING_INTERVAL_SECS: u64 = 1;

pub struct LiveChatService {
    repo: Arc<dyn datastore::Repository>,
    stream_timeout: Option<Duration>,
}

impl LiveChatService {
    pub fn new(repo: Arc<dyn datastore::Repository>, stream_timeout: Option<Duration>) -> Self {
        Self {
            repo,
            stream_timeout,
        }
    }
}

#[tonic::async_trait]
impl V3DataLiveChatMessageService for LiveChatService {
    type StreamListStream = ReceiverStream<Result<LiveChatMessageListResponse, Status>>;

    async fn stream_list(
        &self,
        request: Request<LiveChatMessageListRequest>,
    ) -> Result<Response<Self::StreamListStream>, Status> {
        // Check if auth check is enabled via environment variable
        let require_auth = std::env::var("REQUIRE_AUTH")
            .unwrap_or_else(|_| "false".to_string())
            .parse::<bool>()
            .unwrap_or(false);

        if require_auth {
            // Check for authentication in metadata
            // Look for either:
            // 1. 'x-goog-api-key' metadata (API key)
            // 2. 'authorization' metadata (OAuth 2.0)
            let metadata = request.metadata();
            let has_api_key = metadata.get("x-goog-api-key").is_some();
            let has_auth = metadata.get("authorization").is_some();

            if !has_api_key && !has_auth {
                return Err(Status::unauthenticated(
                    "Request is missing required authentication credential. Expected OAuth 2 access token or API key.",
                ));
            }
        }

        let (tx, rx) = mpsc::channel(4);

        // Extract request parameters
        let request_inner = request.into_inner();
        let live_chat_id = request_inner
            .live_chat_id
            .ok_or_else(|| Status::invalid_argument("live_chat_id is required"))?;

        // Parse page_token to determine starting index
        let start_index = match request_inner.page_token {
            Some(token) if !token.is_empty() => {
                // Decode the page token (simple base64 encoding of the index)
                match BASE64.decode(&token) {
                    Ok(decoded) => {
                        let decoded_str = String::from_utf8(decoded)
                            .map_err(|_| Status::invalid_argument("Invalid page_token"))?;

                        // Parse directly to usize
                        decoded_str
                            .parse::<usize>()
                            .map_err(|_| Status::invalid_argument("Invalid page_token"))?
                    }
                    Err(_) => return Err(Status::invalid_argument("Invalid page_token")),
                }
            }
            _ => 0, // Start from the beginning if no page_token
        };

        // Clone necessary data for the spawned task
        let repo = Arc::clone(&self.repo);
        let stream_timeout = self.stream_timeout;

        tokio::spawn(async move {
            let mut current_index = start_index;
            let stream_start = tokio::time::Instant::now();
            let mut sent_any_response = false;

            loop {
                // Get chat messages from the datastore filtered by live_chat_id
                let messages = repo.get_chat_messages(&live_chat_id);

                // Track if we sent any messages in this iteration
                let mut sent_in_iteration = false;

                // Send messages starting from current_index
                for (i, msg) in messages.iter().enumerate().skip(current_index) {
                    let snippet = proto::LiveChatMessageSnippet {
                        r#type: Some(
                            proto::live_chat_message_snippet::type_wrapper::Type::TextMessageEvent
                                as i32,
                        ),
                        live_chat_id: Some(msg.live_chat_id.clone()),
                        author_channel_id: Some(msg.author_channel_id.clone()),
                        published_at: Some(msg.published_at.to_rfc3339()),
                        display_message: Some(msg.message_text.clone()),
                        displayed_content: Some(
                            proto::live_chat_message_snippet::DisplayedContent::TextMessageDetails(
                                proto::LiveChatTextMessageDetails {
                                    message_text: Some(msg.message_text.clone()),
                                },
                            ),
                        ),
                        ..Default::default()
                    };

                    let author_details = proto::LiveChatMessageAuthorDetails {
                        display_name: Some(msg.author_display_name.clone()),
                        channel_id: Some(msg.author_channel_id.clone()),
                        is_verified: Some(msg.is_verified),
                        ..Default::default()
                    };

                    let item = proto::LiveChatMessage {
                        kind: Some("youtube#liveChatMessage".to_string()),
                        etag: Some(format!("etag-{}", i)),
                        id: Some(msg.id.clone()),
                        snippet: Some(snippet),
                        author_details: Some(author_details),
                    };

                    // Always generate next_page_token to allow resuming the stream later
                    // even if no more messages exist currently (they may be added later)
                    let next_index = (i + 1).to_string();
                    let next_page_token = Some(BASE64.encode(next_index.as_bytes()));

                    let response = LiveChatMessageListResponse {
                        kind: Some("youtube#liveChatMessageListResponse".to_string()),
                        etag: Some(format!("etag-{}", i)),
                        items: vec![item],
                        next_page_token,
                        ..Default::default()
                    };

                    if (tx.send(Ok(response)).await).is_err() {
                        return; // Client disconnected
                    }

                    current_index = i + 1;
                    sent_in_iteration = true;
                    sent_any_response = true;
                    // Yield to the scheduler to allow other tasks to run
                    tokio::task::yield_now().await;
                }

                // If no messages were sent in this iteration and we haven't sent any response yet,
                // send an empty response to indicate the stream is active but has no items
                if !sent_in_iteration && !sent_any_response {
                    let next_page_token = Some(BASE64.encode(current_index.to_string().as_bytes()));

                    let response = LiveChatMessageListResponse {
                        kind: Some("youtube#liveChatMessageListResponse".to_string()),
                        etag: Some(format!("etag-{}", current_index)),
                        items: vec![],
                        next_page_token,
                        ..Default::default()
                    };

                    if (tx.send(Ok(response)).await).is_err() {
                        return; // Client disconnected
                    }
                    sent_any_response = true;
                }

                // Check if timeout has been reached
                if let Some(timeout) = stream_timeout
                    && stream_start.elapsed() >= timeout
                {
                    break; // Timeout reached, close the stream
                }

                // If no timeout is configured or timeout not reached yet, keep polling for new messages
                // Wait before polling again to avoid busy loop
                tokio::time::sleep(tokio::time::Duration::from_secs(POLLING_INTERVAL_SECS)).await;
            }
        });

        Ok(Response::new(ReceiverStream::new(rx)))
    }
}

// Public function to create the server
pub fn create_service(
    repo: Arc<dyn datastore::Repository>,
    stream_timeout: Option<Duration>,
) -> V3DataLiveChatMessageServiceServer<LiveChatService> {
    V3DataLiveChatMessageServiceServer::new(LiveChatService::new(repo, stream_timeout))
}
