use axum::{Json, Router, extract::Query, http::StatusCode, response::IntoResponse, routing::get};
use serde::{Deserialize, Serialize};

// Constant for the default live chat ID - this should match the one used in live_chat_service
pub const DEFAULT_LIVE_CHAT_ID: &str = "live-chat-id-1";

#[derive(Debug, Deserialize)]
pub struct VideosListParams {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub part: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideosListResponse {
    pub kind: String,
    pub etag: String,
    pub page_info: PageInfo,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_page_token: Option<String>,
    pub items: Vec<Video>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    pub total_results: i32,
    pub results_per_page: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Video {
    pub kind: String,
    pub etag: String,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet: Option<VideoSnippet>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub live_streaming_details: Option<LiveStreamingDetails>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoSnippet {
    pub published_at: String,
    pub channel_id: String,
    pub title: String,
    pub description: String,
    pub channel_title: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveStreamingDetails {
    pub active_live_chat_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_start_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_end_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scheduled_start_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scheduled_end_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub concurrent_viewers: Option<u64>,
}

async fn videos_list(Query(params): Query<VideosListParams>) -> impl IntoResponse {
    // Get video IDs from the request
    let video_id = if params.id.is_empty() {
        "video-1".to_string()
    } else {
        params.id.split(',').next().unwrap_or("video-1").to_string()
    };

    // Parse which parts are requested
    let parts: Vec<&str> = params.part.split(',').map(|s| s.trim()).collect();
    let include_snippet = parts.is_empty() || parts.contains(&"snippet");
    let include_live_streaming = parts.is_empty() || parts.contains(&"liveStreamingDetails");

    // Create the video resource
    let video = Video {
        kind: "youtube#video".to_string(),
        etag: "etag-video-1".to_string(),
        id: video_id,
        snippet: if include_snippet {
            Some(VideoSnippet {
                published_at: "2023-01-01T00:00:00Z".to_string(),
                channel_id: "channel-1".to_string(),
                title: "Mock Live Stream Video".to_string(),
                description: "This is a mock video for testing the YouTube Data API".to_string(),
                channel_title: "Mock Channel".to_string(),
            })
        } else {
            None
        },
        live_streaming_details: if include_live_streaming {
            Some(LiveStreamingDetails {
                active_live_chat_id: DEFAULT_LIVE_CHAT_ID.to_string(),
                actual_start_time: Some("2023-01-01T00:00:00Z".to_string()),
                actual_end_time: None,
                scheduled_start_time: Some("2023-01-01T00:00:00Z".to_string()),
                scheduled_end_time: None,
                concurrent_viewers: Some(42),
            })
        } else {
            None
        },
    };

    let response = VideosListResponse {
        kind: "youtube#videoListResponse".to_string(),
        etag: "etag-list-1".to_string(),
        page_info: PageInfo {
            total_results: 1,
            results_per_page: 1,
        },
        next_page_token: None,
        items: vec![video],
    };

    (StatusCode::OK, Json(response))
}

// Create the router for the video API
pub fn create_router() -> Router {
    Router::new().route("/youtube/v3/videos", get(videos_list))
}
