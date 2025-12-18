use serde::{Deserialize, Serialize};

/// Represents a video resource
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Video {
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

/// Represents a live chat message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveChatMessage {
    pub id: String,
    pub live_chat_id: String,
    pub author_channel_id: String,
    pub author_display_name: String,
    pub message_text: String,
    pub published_at: String,
    pub is_verified: bool,
}
