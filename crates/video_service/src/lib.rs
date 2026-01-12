use axum::{
    Json, Router,
    extract::{Query, State},
    http::{Request, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

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
pub struct ErrorResponse {
    pub error: ErrorDetail,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorDetail {
    pub code: u16,
    pub message: String,
    pub errors: Vec<ErrorItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorItem {
    pub domain: String,
    pub reason: String,
    pub message: String,
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
    pub published_at: DateTime<Utc>,
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
    pub actual_start_time: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_end_time: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scheduled_start_time: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scheduled_end_time: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub concurrent_viewers: Option<u64>,
}

async fn videos_list(
    State(repo): State<Arc<dyn datastore::Repository>>,
    Query(params): Query<VideosListParams>,
) -> impl IntoResponse {
    // Validate required parameters
    // Note: The actual YouTube API behavior for missing required parameters is unconfirmed.
    // This implementation returns 400 Bad Request to enforce proper API usage.
    if params.part.is_empty() {
        let error = ErrorResponse {
            error: ErrorDetail {
                code: 400,
                message: "Required parameter: part".to_string(),
                errors: vec![ErrorItem {
                    domain: "global".to_string(),
                    reason: "required".to_string(),
                    message: "Required parameter: part".to_string(),
                }],
            },
        };
        return (StatusCode::BAD_REQUEST, Json(error)).into_response();
    }

    if params.id.is_empty() {
        let error = ErrorResponse {
            error: ErrorDetail {
                code: 400,
                message: "Required parameter: id".to_string(),
                errors: vec![ErrorItem {
                    domain: "global".to_string(),
                    reason: "required".to_string(),
                    message: "Required parameter: id".to_string(),
                }],
            },
        };
        return (StatusCode::BAD_REQUEST, Json(error)).into_response();
    }

    // Get video IDs from the request
    let video_id = params.id.split(',').next().unwrap_or("video-1").to_string();

    // Fetch video from datastore
    let video_data = repo.get_video(&video_id);

    // If video not found, return empty items array
    let items = if let Some(video_data) = video_data {
        // Parse which parts are requested
        let parts: Vec<&str> = params.part.split(',').map(|s| s.trim()).collect();
        let include_snippet = parts.contains(&"snippet");
        let include_live_streaming = parts.contains(&"liveStreamingDetails");

        // Create the video resource
        let video = Video {
            kind: "youtube#video".to_string(),
            etag: "etag-video-1".to_string(),
            id: video_data.id.clone(),
            snippet: if include_snippet {
                Some(VideoSnippet {
                    published_at: video_data.published_at,
                    channel_id: video_data.channel_id.clone(),
                    title: video_data.title.clone(),
                    description: video_data.description.clone(),
                    channel_title: video_data.channel_title.clone(),
                })
            } else {
                None
            },
            live_streaming_details: if include_live_streaming {
                video_data
                    .live_chat_id
                    .as_ref()
                    .map(|live_chat_id| LiveStreamingDetails {
                        active_live_chat_id: live_chat_id.clone(),
                        actual_start_time: video_data.actual_start_time,
                        actual_end_time: video_data.actual_end_time,
                        scheduled_start_time: video_data.scheduled_start_time,
                        scheduled_end_time: video_data.scheduled_end_time,
                        concurrent_viewers: video_data.concurrent_viewers,
                    })
            } else {
                None
            },
        };
        vec![video]
    } else {
        vec![]
    };

    let response = VideosListResponse {
        kind: "youtube#videoListResponse".to_string(),
        etag: "etag-list-1".to_string(),
        page_info: PageInfo {
            total_results: items.len() as i32,
            results_per_page: items.len() as i32,
        },
        next_page_token: None,
        items,
    };

    (StatusCode::OK, Json(response)).into_response()
}

// Middleware to check authorization for REST API
// Checks for either:
// 1. 'key' query parameter (API key)
// 2. 'Authorization' header (OAuth 2.0)
async fn check_auth(request: Request<axum::body::Body>, next: Next) -> Response {
    // Check if auth check is enabled via environment variable
    let require_auth = std::env::var("REQUIRE_AUTH")
        .unwrap_or_else(|_| "false".to_string())
        .parse::<bool>()
        .unwrap_or(false);

    if !require_auth {
        return next.run(request).await;
    }

    // Extract query parameters to check for 'key' parameter
    let uri = request.uri();
    let query = uri.query().unwrap_or("");
    let has_key_param = query.split('&').any(|param| param.starts_with("key="));

    // Check for Authorization header and validate token expiry
    let auth_header = request.headers().get(header::AUTHORIZATION);
    let has_auth_header = auth_header.is_some();

    if !has_key_param && !has_auth_header {
        let error = ErrorResponse {
            error: ErrorDetail {
                code: 401,
                message: "Request is missing required authentication credential. Expected OAuth 2 access token, login cookie or other valid authentication credential.".to_string(),
                errors: vec![ErrorItem {
                    domain: "global".to_string(),
                    reason: "required".to_string(),
                    message: "Login Required".to_string(),
                }],
            },
        };
        return (StatusCode::UNAUTHORIZED, Json(error)).into_response();
    }

    // Validate OAuth token expiry if Authorization header is present
    if let Some(auth_value) = auth_header
        && let Ok(auth_str) = auth_value.to_str()
    {
        // Extract token from "Bearer <token>" format
        if let Some(token) = auth_str
            .strip_prefix("Bearer ")
            .or_else(|| auth_str.strip_prefix("bearer "))
        {
            // Validate token expiry
            if let Err(err_msg) = oauth_service::validate_token(token) {
                let error = ErrorResponse {
                    error: ErrorDetail {
                        code: 401,
                        message: format!("Invalid Credentials: {}", err_msg),
                        errors: vec![ErrorItem {
                            domain: "global".to_string(),
                            reason: "authError".to_string(),
                            message: err_msg,
                        }],
                    },
                };
                return (StatusCode::UNAUTHORIZED, Json(error)).into_response();
            }
        }
    }

    next.run(request).await
}

// Create the router for the video API
pub fn create_router(repo: Arc<dyn datastore::Repository>) -> Router {
    Router::new()
        .route("/videos", get(videos_list))
        .route_layer(middleware::from_fn(check_auth))
        .with_state(repo)
}
