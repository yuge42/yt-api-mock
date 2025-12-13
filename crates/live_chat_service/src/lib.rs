pub mod proto {
    tonic::include_proto!("youtube.api.v3");
    pub const FILE_DESCRIPTOR_SET: &[u8] =
        tonic::include_file_descriptor_set!("live_chat_service_descriptor");
}

use proto::v3_data_live_chat_message_service_server::{
    V3DataLiveChatMessageService, V3DataLiveChatMessageServiceServer,
};
use proto::{LiveChatMessageListRequest, LiveChatMessageListResponse};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tonic::{Request, Response, Status};

#[derive(Debug, Default)]
pub struct LiveChatService;

#[tonic::async_trait]
impl V3DataLiveChatMessageService for LiveChatService {
    type StreamListStream = ReceiverStream<Result<LiveChatMessageListResponse, Status>>;

    async fn stream_list(
        &self,
        _request: Request<LiveChatMessageListRequest>,
    ) -> Result<Response<Self::StreamListStream>, Status> {
        let (tx, rx) = mpsc::channel(4);

        tokio::spawn(async move {
            for i in 0..5 {
                let snippet = proto::LiveChatMessageSnippet {
                    r#type: Some(
                        proto::live_chat_message_snippet::type_wrapper::Type::TextMessageEvent
                            as i32,
                    ),
                    live_chat_id: Some("live-chat-id-1".to_string()),
                    author_channel_id: Some(format!("channel-id-{}", i)),
                    published_at: Some("2023-01-01T00:00:00Z".to_string()),
                    display_message: Some(format!("Hello world {}", i)),
                    displayed_content: Some(
                        proto::live_chat_message_snippet::DisplayedContent::TextMessageDetails(
                            proto::LiveChatTextMessageDetails {
                                message_text: Some(format!("Hello world {}", i)),
                            },
                        ),
                    ),
                    ..Default::default()
                };

                let author_details = proto::LiveChatMessageAuthorDetails {
                    display_name: Some(format!("User {}", i)),
                    channel_id: Some(format!("channel-id-{}", i)),
                    is_verified: Some(true),
                    ..Default::default()
                };

                let item = proto::LiveChatMessage {
                    kind: Some("youtube#liveChatMessage".to_string()),
                    etag: Some(format!("etag-{}", i)),
                    id: Some(format!("msg-id-{}", i)),
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
pub fn create_service() -> V3DataLiveChatMessageServiceServer<LiveChatService> {
    V3DataLiveChatMessageServiceServer::new(LiveChatService)
}
