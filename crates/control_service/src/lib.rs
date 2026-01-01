use axum::{Json, Router, extract::State, http::StatusCode, response::IntoResponse, routing::post};
use chrono::{DateTime, Utc};
use fake::Fake;
use fake::faker::internet::en::Username;
use fake::faker::lorem::en::Sentence;
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
    #[serde(default = "default_datetime")]
    pub published_at: DateTime<Utc>,
    pub live_chat_id: Option<String>,
    #[serde(default)]
    pub actual_start_time: Option<DateTime<Utc>>,
    #[serde(default)]
    pub actual_end_time: Option<DateTime<Utc>>,
    #[serde(default)]
    pub scheduled_start_time: Option<DateTime<Utc>>,
    #[serde(default)]
    pub scheduled_end_time: Option<DateTime<Utc>>,
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
    #[serde(default = "default_datetime")]
    pub published_at: DateTime<Utc>,
    pub is_verified: bool,
}

/// Request body for generating a chat message with minimal fields
/// Missing fields will be auto-generated using the fake library
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChatMessageGenerateRequest {
    pub live_chat_id: String,
    #[serde(default)]
    pub message_text: Option<String>,
    #[serde(default)]
    pub author_display_name: Option<String>,
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

/// Default to current datetime
fn default_datetime() -> DateTime<Utc> {
    Utc::now()
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

/// Handler for generating a chat message with auto-generated fields
async fn create_chat_message_generate(
    State(repo): State<Arc<dyn datastore::Repository>>,
    Json(request): Json<CreateChatMessageGenerateRequest>,
) -> impl IntoResponse {
    // Generate a unique ID using UUID
    let id = format!("msg-{}", uuid::Uuid::new_v4());

    // Use provided values or generate fake data
    let author_display_name = request
        .author_display_name
        .unwrap_or_else(|| Username().fake());
    let message_text = request
        .message_text
        .unwrap_or_else(|| Sentence(3..10).fake());

    let message = domain::LiveChatMessage {
        id: id.clone(),
        live_chat_id: request.live_chat_id,
        author_channel_id: format!("channel-{}", uuid::Uuid::new_v4()),
        author_display_name,
        message_text,
        published_at: Utc::now(),
        is_verified: false,
    };

    repo.add_chat_message(message);

    let response = CreateResponse {
        success: true,
        message: format!(
            "Chat message '{}' created successfully with auto-generated fields",
            id
        ),
    };

    (StatusCode::CREATED, Json(response)).into_response()
}

/// Create the router for the control API
pub fn create_router(repo: Arc<dyn datastore::Repository>) -> Router {
    Router::new()
        .route("/videos", post(create_video))
        .route("/chat_messages", post(create_chat_message))
        .route(
            "/chat_messages/generate",
            post(create_chat_message_generate),
        )
        .with_state(repo)
}
