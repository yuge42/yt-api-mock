use axum::{Json, Router, extract::State, http::StatusCode, response::IntoResponse, routing::post};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Request body for creating a new video
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateVideoRequest {
    pub id: String,
    pub channel_id: String,
    pub title: String,
    pub description: String,
    pub channel_title: String,
    pub published_at: String,
    pub live_chat_id: Option<String>,
    pub actual_start_time: Option<String>,
    pub actual_end_time: Option<String>,
    pub scheduled_start_time: Option<String>,
    pub scheduled_end_time: Option<String>,
    pub concurrent_viewers: Option<u64>,
}

/// Request body for creating a new chat message
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChatMessageRequest {
    pub id: String,
    pub live_chat_id: String,
    pub author_channel_id: String,
    pub author_display_name: String,
    pub message_text: String,
    pub published_at: String,
    pub is_verified: bool,
}

/// Response for successful creation
#[derive(Debug, Serialize)]
pub struct CreateResponse {
    pub success: bool,
    pub message: String,
}

/// Error response
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub success: bool,
    pub error: String,
}

/// Handler for creating a new video
async fn create_video(
    State(repo): State<Arc<dyn datastore::Repository>>,
    Json(request): Json<CreateVideoRequest>,
) -> impl IntoResponse {
    let video = domain::Video {
        id: request.id.clone(),
        channel_id: request.channel_id,
        title: request.title,
        description: request.description,
        channel_title: request.channel_title,
        published_at: request.published_at,
        live_chat_id: request.live_chat_id,
        actual_start_time: request.actual_start_time,
        actual_end_time: request.actual_end_time,
        scheduled_start_time: request.scheduled_start_time,
        scheduled_end_time: request.scheduled_end_time,
        concurrent_viewers: request.concurrent_viewers,
    };

    repo.add_video(video);

    let response = CreateResponse {
        success: true,
        message: format!("Video '{}' created successfully", request.id),
    };

    (StatusCode::CREATED, Json(response)).into_response()
}

/// Handler for creating a new chat message
async fn create_chat_message(
    State(repo): State<Arc<dyn datastore::Repository>>,
    Json(request): Json<CreateChatMessageRequest>,
) -> impl IntoResponse {
    let message = domain::LiveChatMessage {
        id: request.id.clone(),
        live_chat_id: request.live_chat_id,
        author_channel_id: request.author_channel_id,
        author_display_name: request.author_display_name,
        message_text: request.message_text,
        published_at: request.published_at,
        is_verified: request.is_verified,
    };

    repo.add_chat_message(message);

    let response = CreateResponse {
        success: true,
        message: format!("Chat message '{}' created successfully", request.id),
    };

    (StatusCode::CREATED, Json(response)).into_response()
}

/// Create the router for the control API
pub fn create_router(repo: Arc<dyn datastore::Repository>) -> Router {
    Router::new()
        .route("/videos", post(create_video))
        .route("/chat_messages", post(create_chat_message))
        .with_state(repo)
}
