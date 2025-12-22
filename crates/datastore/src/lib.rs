use chrono::{TimeZone, Utc};
use domain::{LiveChatMessage, Video};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

/// Repository trait for data access abstraction
/// This allows switching between different storage backends (in-memory, filesystem, database)
pub trait Repository: Send + Sync {
    /// Get a video by ID
    fn get_video(&self, id: &str) -> Option<Video>;

    /// Get all videos
    fn get_videos(&self) -> Vec<Video>;

    /// Get live chat messages for a specific live chat ID
    fn get_chat_messages(&self, live_chat_id: &str) -> Vec<LiveChatMessage>;

    /// Add a video to the repository
    fn add_video(&self, video: Video);

    /// Add a chat message to the repository
    fn add_chat_message(&self, message: LiveChatMessage);
}

/// In-memory implementation of the Repository trait
pub struct InMemoryRepository {
    videos: Arc<RwLock<HashMap<String, Video>>>,
    chat_messages: Arc<RwLock<HashMap<String, Vec<LiveChatMessage>>>>,
}

impl InMemoryRepository {
    /// Create a new in-memory repository with initial dummy data
    pub fn new() -> Self {
        let repo = Self {
            videos: Arc::new(RwLock::new(HashMap::new())),
            chat_messages: Arc::new(RwLock::new(HashMap::new())),
        };
        repo.populate_dummy_data();
        repo
    }

    /// Populate the repository with initial dummy data
    fn populate_dummy_data(&self) {
        // Fixed point in time for consistent dummy data
        let fixed_time = Utc
            .with_ymd_and_hms(2023, 1, 1, 0, 0, 0)
            .single()
            .expect("Fixed datetime should be valid");
        
        // Add dummy videos
        let video1 = Video {
            id: "test-video-1".to_string(),
            channel_id: "channel-1".to_string(),
            title: "Mock Live Stream Video".to_string(),
            description: "This is a mock video for testing the YouTube Data API".to_string(),
            channel_title: "Mock Channel".to_string(),
            published_at: fixed_time,
            live_chat_id: Some("live-chat-id-1".to_string()),
            actual_start_time: Some(fixed_time),
            actual_end_time: None,
            scheduled_start_time: Some(fixed_time),
            scheduled_end_time: None,
            concurrent_viewers: Some(42),
        };

        self.add_video(video1);

        // Add dummy chat messages for live-chat-id-1
        for i in 0..5 {
            let message = LiveChatMessage {
                id: format!("msg-id-{}", i),
                live_chat_id: "live-chat-id-1".to_string(),
                author_channel_id: format!("channel-id-{}", i),
                author_display_name: format!("User {}", i),
                message_text: format!("Hello world {}", i),
                published_at: fixed_time,
                is_verified: true,
            };
            self.add_chat_message(message);
        }

        // Add dummy chat messages for test-chat-id (used in tests)
        for i in 0..5 {
            let message = LiveChatMessage {
                id: format!("test-msg-id-{}", i),
                live_chat_id: "test-chat-id".to_string(),
                author_channel_id: format!("test-channel-id-{}", i),
                author_display_name: format!("Test User {}", i),
                message_text: format!("Test message {}", i),
                published_at: fixed_time,
                is_verified: true,
            };
            self.add_chat_message(message);
        }
    }
}

impl Default for InMemoryRepository {
    fn default() -> Self {
        Self::new()
    }
}

impl Repository for InMemoryRepository {
    fn get_video(&self, id: &str) -> Option<Video> {
        self.videos
            .read()
            .expect("Failed to acquire read lock on videos")
            .get(id)
            .cloned()
    }

    fn get_videos(&self) -> Vec<Video> {
        self.videos
            .read()
            .expect("Failed to acquire read lock on videos")
            .values()
            .cloned()
            .collect()
    }

    fn get_chat_messages(&self, live_chat_id: &str) -> Vec<LiveChatMessage> {
        self.chat_messages
            .read()
            .expect("Failed to acquire read lock on chat_messages")
            .get(live_chat_id)
            .cloned()
            .unwrap_or_default()
    }

    fn add_video(&self, video: Video) {
        self.videos
            .write()
            .expect("Failed to acquire write lock on videos")
            .insert(video.id.clone(), video);
    }

    fn add_chat_message(&self, message: LiveChatMessage) {
        self.chat_messages
            .write()
            .expect("Failed to acquire write lock on chat_messages")
            .entry(message.live_chat_id.clone())
            .or_default()
            .push(message);
    }
}
