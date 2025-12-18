pub mod proto {
    tonic::include_proto!("youtube.api.v3");
    pub const FILE_DESCRIPTOR_SET: &[u8] =
        tonic::include_file_descriptor_set!("live_chat_service_descriptor");
}

use proto::v3_data_live_chat_message_service_server::{
    V3DataLiveChatMessageService, V3DataLiveChatMessageServiceServer,
};
use proto::{LiveChatMessageListRequest, LiveChatMessageListResponse};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tonic::{Request, Response, Status};

pub struct LiveChatService {
    repo: Arc<dyn datastore::Repository>,
}

impl LiveChatService {
    pub fn new(repo: Arc<dyn datastore::Repository>) -> Self {
        Self { repo }
    }
}

#[tonic::async_trait]
impl V3DataLiveChatMessageService for LiveChatService {
    type StreamListStream = ReceiverStream<Result<LiveChatMessageListResponse, Status>>;

    async fn stream_list(
        &self,
        request: Request<LiveChatMessageListRequest>,
    ) -> Result<Response<Self::StreamListStream>, Status> {
        let (tx, rx) = mpsc::channel(4);

        // Extract the live_chat_id from the request
        let live_chat_id = request
            .into_inner()
            .live_chat_id
            .ok_or_else(|| Status::invalid_argument("live_chat_id is required"))?;

        // Get chat messages from the datastore filtered by live_chat_id
        let messages = self.repo.get_chat_messages(&live_chat_id);

        tokio::spawn(async move {
            for (i, msg) in messages.iter().enumerate() {
                let snippet = proto::LiveChatMessageSnippet {
                    r#type: Some(
                        proto::live_chat_message_snippet::type_wrapper::Type::TextMessageEvent
                            as i32,
                    ),
                    live_chat_id: Some(msg.live_chat_id.clone()),
                    author_channel_id: Some(msg.author_channel_id.clone()),
                    published_at: Some(msg.published_at.clone()),
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

                let response = LiveChatMessageListResponse {
                    kind: Some("youtube#liveChatMessageListResponse".to_string()),
                    etag: Some(format!("etag-{}", i)),
                    items: vec![item],
                    ..Default::default()
                };
                if (tx.send(Ok(response)).await).is_err() {
                    break;
                }
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            }
        });

        Ok(Response::new(ReceiverStream::new(rx)))
    }
}

// Public function to create the server
pub fn create_service(repo: Arc<dyn datastore::Repository>) -> V3DataLiveChatMessageServiceServer<LiveChatService> {
    V3DataLiveChatMessageServiceServer::new(LiveChatService::new(repo))
}
