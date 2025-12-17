pub mod proto {
    tonic::include_proto!("youtube.api.v3");
    pub const FILE_DESCRIPTOR_SET: &[u8] =
        tonic::include_file_descriptor_set!("video_service_descriptor");
}

use proto::v3_data_video_service_server::{V3DataVideoService, V3DataVideoServiceServer};
use proto::{VideosListRequest, VideosListResponse};
use tonic::{Request, Response, Status};

// Constant for the default live chat ID - this should match the one used in live_chat_service
pub const DEFAULT_LIVE_CHAT_ID: &str = "live-chat-id-1";

#[derive(Debug, Default)]
pub struct VideoService;

#[tonic::async_trait]
impl V3DataVideoService for VideoService {
    async fn list(
        &self,
        request: Request<VideosListRequest>,
    ) -> Result<Response<VideosListResponse>, Status> {
        let req = request.into_inner();
        
        // Get video IDs from the request
        let video_ids = req.id.unwrap_or_default();
        
        // For the mock, we'll return a single video with live streaming details
        let video = proto::Video {
            kind: Some("youtube#video".to_string()),
            etag: Some("etag-video-1".to_string()),
            id: if video_ids.is_empty() {
                Some("video-1".to_string())
            } else {
                Some(video_ids.split(',').next().unwrap_or("video-1").to_string())
            },
            snippet: Some(proto::VideoSnippet {
                published_at: Some("2023-01-01T00:00:00Z".to_string()),
                channel_id: Some("channel-1".to_string()),
                title: Some("Mock Live Stream Video".to_string()),
                description: Some("This is a mock video for testing the YouTube Data API".to_string()),
                channel_title: Some("Mock Channel".to_string()),
            }),
            live_streaming_details: Some(proto::LiveStreamingDetails {
                active_live_chat_id: Some(DEFAULT_LIVE_CHAT_ID.to_string()),
                actual_start_time: Some("2023-01-01T00:00:00Z".to_string()),
                actual_end_time: None,
                scheduled_start_time: Some("2023-01-01T00:00:00Z".to_string()),
                scheduled_end_time: None,
                concurrent_viewers: Some(42),
            }),
        };

        let response = VideosListResponse {
            kind: Some("youtube#videoListResponse".to_string()),
            etag: Some("etag-list-1".to_string()),
            page_info: Some(proto::PageInfo {
                total_results: Some(1),
                results_per_page: Some(1),
            }),
            next_page_token: None,
            items: vec![video],
        };

        Ok(Response::new(response))
    }
}

// Public function to create the server
pub fn create_service() -> V3DataVideoServiceServer<VideoService> {
    V3DataVideoServiceServer::new(VideoService)
}
