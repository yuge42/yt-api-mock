use chrono::{TimeZone, Utc};
use domain::{LiveChatMessage, Video};
use fake::Fake;
use fake::faker::internet::en::Username;
use fake::faker::lorem::en::Sentence;
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

        // Add dummy chat messages for live-chat-id-1 using fake library
        for i in 0..5 {
            let message = LiveChatMessage {
                id: format!("msg-id-{i}"),
                live_chat_id: "live-chat-id-1".to_string(),
                author_channel_id: format!("channel-id-{i}"),
                author_display_name: Username().fake(),
                message_text: Sentence(3..8).fake(),
                published_at: fixed_time,
                is_verified: true,
            };
            self.add_chat_message(message);
        }

        // Add dummy chat messages for test-chat-id (used in tests)
        for i in 0..5 {
            let message = LiveChatMessage {
                id: format!("test-msg-id-{i}"),
                live_chat_id: "test-chat-id".to_string(),
                author_channel_id: format!("test-channel-id-{i}"),
                author_display_name: format!("Test User {i}"),
                message_text: format!("Test message {i}"),
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

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{TimeZone, Utc};

    #[test]
    fn test_new_repository_creates_with_dummy_data() {
        let repo = InMemoryRepository::new();

        // Should have at least one video from dummy data
        let videos = repo.get_videos();
        assert!(!videos.is_empty(), "Repository should contain dummy videos");

        // Should have the test-video-1
        let video = repo.get_video("test-video-1");
        assert!(video.is_some(), "Repository should contain test-video-1");
    }

    #[test]
    fn test_default_trait() {
        let repo = InMemoryRepository::default();

        // Default should behave the same as new()
        let videos = repo.get_videos();
        assert!(
            !videos.is_empty(),
            "Default repository should contain dummy videos"
        );
    }

    #[test]
    fn test_get_video_existing() {
        let repo = InMemoryRepository::new();

        let video = repo.get_video("test-video-1");
        assert!(video.is_some(), "Should find test-video-1");

        let video = video.unwrap();
        assert_eq!(video.id, "test-video-1");
        assert_eq!(video.channel_id, "channel-1");
        assert_eq!(video.title, "Mock Live Stream Video");
        assert_eq!(video.channel_title, "Mock Channel");
        assert_eq!(video.live_chat_id, Some("live-chat-id-1".to_string()));
        assert_eq!(video.concurrent_viewers, Some(42));
    }

    #[test]
    fn test_get_video_non_existing() {
        let repo = InMemoryRepository::new();

        let video = repo.get_video("non-existent-id");
        assert!(video.is_none(), "Should not find non-existent video");
    }

    #[test]
    fn test_add_video() {
        let repo = InMemoryRepository::new();

        let fixed_time = Utc
            .with_ymd_and_hms(2024, 6, 15, 12, 0, 0)
            .single()
            .expect("Valid datetime");

        let new_video = Video {
            id: "new-video-id".to_string(),
            channel_id: "channel-2".to_string(),
            title: "New Test Video".to_string(),
            description: "A newly added test video".to_string(),
            channel_title: "Test Channel 2".to_string(),
            published_at: fixed_time,
            live_chat_id: Some("live-chat-2".to_string()),
            actual_start_time: None,
            actual_end_time: None,
            scheduled_start_time: Some(fixed_time),
            scheduled_end_time: None,
            concurrent_viewers: Some(100),
        };

        repo.add_video(new_video.clone());

        let retrieved = repo.get_video("new-video-id");
        assert!(retrieved.is_some(), "Should find newly added video");

        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.id, "new-video-id");
        assert_eq!(retrieved.title, "New Test Video");
        assert_eq!(retrieved.concurrent_viewers, Some(100));
    }

    #[test]
    fn test_add_video_overwrites_existing() {
        let repo = InMemoryRepository::new();

        let fixed_time = Utc
            .with_ymd_and_hms(2024, 6, 15, 12, 0, 0)
            .single()
            .expect("Valid datetime");

        // Add a video with the same ID as existing dummy data
        let updated_video = Video {
            id: "test-video-1".to_string(),
            channel_id: "channel-updated".to_string(),
            title: "Updated Title".to_string(),
            description: "Updated description".to_string(),
            channel_title: "Updated Channel".to_string(),
            published_at: fixed_time,
            live_chat_id: None,
            actual_start_time: None,
            actual_end_time: None,
            scheduled_start_time: None,
            scheduled_end_time: None,
            concurrent_viewers: Some(999),
        };

        repo.add_video(updated_video);

        let retrieved = repo.get_video("test-video-1");
        assert!(retrieved.is_some());

        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.title, "Updated Title");
        assert_eq!(retrieved.channel_id, "channel-updated");
        assert_eq!(retrieved.concurrent_viewers, Some(999));
    }

    #[test]
    fn test_get_videos() {
        let repo = InMemoryRepository::new();

        let videos = repo.get_videos();

        // Should have at least the dummy video
        assert!(!videos.is_empty(), "Should have videos");

        // Add more videos
        let fixed_time = Utc
            .with_ymd_and_hms(2024, 1, 1, 0, 0, 0)
            .single()
            .expect("Valid datetime");

        let video2 = Video {
            id: "video-2".to_string(),
            channel_id: "channel-3".to_string(),
            title: "Second Video".to_string(),
            description: "Description 2".to_string(),
            channel_title: "Channel 3".to_string(),
            published_at: fixed_time,
            live_chat_id: None,
            actual_start_time: None,
            actual_end_time: None,
            scheduled_start_time: None,
            scheduled_end_time: None,
            concurrent_viewers: None,
        };

        let initial_count = videos.len();
        repo.add_video(video2);

        let videos = repo.get_videos();
        assert_eq!(
            videos.len(),
            initial_count + 1,
            "Should have one more video"
        );

        // Verify we can find the new video in the list
        let found = videos.iter().any(|v| v.id == "video-2");
        assert!(found, "Should find video-2 in the list");
    }

    #[test]
    fn test_get_chat_messages_existing() {
        let repo = InMemoryRepository::new();

        let messages = repo.get_chat_messages("live-chat-id-1");
        assert!(
            !messages.is_empty(),
            "Should have messages for live-chat-id-1"
        );
        assert_eq!(messages.len(), 5, "Should have 5 dummy messages");

        // Verify message content (uses fake data, so we check structure not exact values)
        for (i, message) in messages.iter().enumerate() {
            assert_eq!(message.id, format!("msg-id-{}", i));
            assert_eq!(message.live_chat_id, "live-chat-id-1");
            assert!(
                !message.author_display_name.is_empty(),
                "Author display name should not be empty"
            );
            assert!(
                !message.message_text.is_empty(),
                "Message text should not be empty"
            );
            assert!(message.is_verified);
        }
    }

    #[test]
    fn test_get_chat_messages_test_chat_id() {
        let repo = InMemoryRepository::new();

        let messages = repo.get_chat_messages("test-chat-id");
        assert!(
            !messages.is_empty(),
            "Should have messages for test-chat-id"
        );
        assert_eq!(messages.len(), 5, "Should have 5 test messages");

        // Verify message content
        for (i, message) in messages.iter().enumerate() {
            assert_eq!(message.id, format!("test-msg-id-{}", i));
            assert_eq!(message.live_chat_id, "test-chat-id");
            assert_eq!(message.author_display_name, format!("Test User {}", i));
            assert_eq!(message.message_text, format!("Test message {}", i));
        }
    }

    #[test]
    fn test_get_chat_messages_non_existing() {
        let repo = InMemoryRepository::new();

        let messages = repo.get_chat_messages("non-existent-chat-id");
        assert!(
            messages.is_empty(),
            "Should return empty vec for non-existent chat ID"
        );
    }

    #[test]
    fn test_add_chat_message() {
        let repo = InMemoryRepository::new();

        let fixed_time = Utc
            .with_ymd_and_hms(2024, 6, 15, 12, 30, 0)
            .single()
            .expect("Valid datetime");

        let new_message = LiveChatMessage {
            id: "new-msg-1".to_string(),
            live_chat_id: "new-chat-id".to_string(),
            author_channel_id: "author-channel-1".to_string(),
            author_display_name: "New User".to_string(),
            message_text: "Hello from new chat!".to_string(),
            published_at: fixed_time,
            is_verified: false,
        };

        repo.add_chat_message(new_message.clone());

        let messages = repo.get_chat_messages("new-chat-id");
        assert_eq!(messages.len(), 1, "Should have one message in new chat");

        let retrieved = &messages[0];
        assert_eq!(retrieved.id, "new-msg-1");
        assert_eq!(retrieved.message_text, "Hello from new chat!");
        assert_eq!(retrieved.author_display_name, "New User");
        assert!(!retrieved.is_verified);
    }

    #[test]
    fn test_add_multiple_chat_messages_same_chat() {
        let repo = InMemoryRepository::new();

        let fixed_time = Utc
            .with_ymd_and_hms(2024, 1, 1, 0, 0, 0)
            .single()
            .expect("Valid datetime");

        let chat_id = "multi-message-chat";

        for i in 0..10 {
            let message = LiveChatMessage {
                id: format!("multi-msg-{}", i),
                live_chat_id: chat_id.to_string(),
                author_channel_id: format!("author-{}", i),
                author_display_name: format!("User {}", i),
                message_text: format!("Message number {}", i),
                published_at: fixed_time,
                is_verified: i % 2 == 0,
            };
            repo.add_chat_message(message);
        }

        let messages = repo.get_chat_messages(chat_id);
        assert_eq!(messages.len(), 10, "Should have 10 messages");

        // Verify order is preserved
        for (i, message) in messages.iter().enumerate() {
            assert_eq!(message.id, format!("multi-msg-{}", i));
            assert_eq!(message.message_text, format!("Message number {}", i));
        }
    }

    #[test]
    fn test_repository_trait_implementation() {
        // Test that InMemoryRepository implements Repository trait
        let repo: Box<dyn Repository> = Box::new(InMemoryRepository::new());

        // Should be able to call trait methods through trait object
        let videos = repo.get_videos();
        assert!(!videos.is_empty());

        let video = repo.get_video("test-video-1");
        assert!(video.is_some());

        let messages = repo.get_chat_messages("live-chat-id-1");
        assert!(!messages.is_empty());
    }

    #[test]
    fn test_concurrent_video_operations() {
        use std::thread;

        let repo = Arc::new(InMemoryRepository::new());
        let mut handles = vec![];

        // Spawn multiple threads to add videos concurrently
        for i in 0..10 {
            let repo_clone = Arc::clone(&repo);
            let handle = thread::spawn(move || {
                let fixed_time = Utc
                    .with_ymd_and_hms(2024, 1, 1, 0, 0, 0)
                    .single()
                    .expect("Valid datetime");

                let video = Video {
                    id: format!("concurrent-video-{}", i),
                    channel_id: format!("channel-{}", i),
                    title: format!("Concurrent Video {}", i),
                    description: "Test concurrent access".to_string(),
                    channel_title: format!("Channel {}", i),
                    published_at: fixed_time,
                    live_chat_id: None,
                    actual_start_time: None,
                    actual_end_time: None,
                    scheduled_start_time: None,
                    scheduled_end_time: None,
                    concurrent_viewers: Some(i as u64),
                };

                repo_clone.add_video(video);
            });
            handles.push(handle);
        }

        // Wait for all threads to complete
        for handle in handles {
            handle.join().expect("Thread should complete successfully");
        }

        // Verify all videos were added
        let videos = repo.get_videos();
        for i in 0..10 {
            let video = repo.get_video(&format!("concurrent-video-{}", i));
            assert!(video.is_some(), "Video {} should exist", i);
        }

        // Count concurrent videos
        let concurrent_count = videos
            .iter()
            .filter(|v| v.id.starts_with("concurrent-video-"))
            .count();
        assert_eq!(concurrent_count, 10, "Should have all 10 concurrent videos");
    }

    #[test]
    fn test_concurrent_chat_message_operations() {
        use std::thread;

        let repo = Arc::new(InMemoryRepository::new());
        let mut handles = vec![];

        let chat_id = "concurrent-chat";

        // Spawn multiple threads to add messages concurrently
        for i in 0..10 {
            let repo_clone = Arc::clone(&repo);
            let chat_id = chat_id.to_string();
            let handle = thread::spawn(move || {
                let fixed_time = Utc
                    .with_ymd_and_hms(2024, 1, 1, 0, 0, 0)
                    .single()
                    .expect("Valid datetime");

                let message = LiveChatMessage {
                    id: format!("concurrent-msg-{}", i),
                    live_chat_id: chat_id,
                    author_channel_id: format!("author-{}", i),
                    author_display_name: format!("User {}", i),
                    message_text: format!("Concurrent message {}", i),
                    published_at: fixed_time,
                    is_verified: true,
                };

                repo_clone.add_chat_message(message);
            });
            handles.push(handle);
        }

        // Wait for all threads to complete
        for handle in handles {
            handle.join().expect("Thread should complete successfully");
        }

        // Verify all messages were added
        let messages = repo.get_chat_messages(chat_id);
        assert_eq!(messages.len(), 10, "Should have all 10 concurrent messages");

        // Verify all message IDs are present (order may vary due to concurrency)
        for i in 0..10 {
            let found = messages
                .iter()
                .any(|m| m.id == format!("concurrent-msg-{}", i));
            assert!(found, "Message {} should exist", i);
        }
    }

    #[test]
    fn test_concurrent_read_write_videos() {
        use std::thread;

        let repo = Arc::new(InMemoryRepository::new());
        let mut handles = vec![];

        // Spawn reader threads
        for _ in 0..5 {
            let repo_clone = Arc::clone(&repo);
            let handle = thread::spawn(move || {
                for _ in 0..100 {
                    let _ = repo_clone.get_videos();
                    let _ = repo_clone.get_video("test-video-1");
                }
            });
            handles.push(handle);
        }

        // Spawn writer threads
        for i in 0..5 {
            let repo_clone = Arc::clone(&repo);
            let handle = thread::spawn(move || {
                let fixed_time = Utc
                    .with_ymd_and_hms(2024, 1, 1, 0, 0, 0)
                    .single()
                    .expect("Valid datetime");

                for j in 0..10 {
                    let video = Video {
                        id: format!("rw-video-{}-{}", i, j),
                        channel_id: format!("channel-{}", i),
                        title: format!("RW Video {} {}", i, j),
                        description: "Test read-write".to_string(),
                        channel_title: format!("Channel {}", i),
                        published_at: fixed_time,
                        live_chat_id: None,
                        actual_start_time: None,
                        actual_end_time: None,
                        scheduled_start_time: None,
                        scheduled_end_time: None,
                        concurrent_viewers: None,
                    };
                    repo_clone.add_video(video);
                }
            });
            handles.push(handle);
        }

        // Wait for all threads to complete
        for handle in handles {
            handle.join().expect("Thread should complete successfully");
        }

        // Verify data integrity - should have at least the added videos
        let videos = repo.get_videos();
        let rw_count = videos
            .iter()
            .filter(|v| v.id.starts_with("rw-video-"))
            .count();
        assert_eq!(rw_count, 50, "Should have all 50 read-write test videos");
    }
}
