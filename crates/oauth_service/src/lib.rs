use axum::{Json, Router, extract::Form, http::StatusCode, response::IntoResponse, routing::post};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

/// Request body for token generation
/// Supports both authorization_code and refresh_token grant types
#[derive(Debug, Deserialize)]
pub struct TokenRequest {
    /// Grant type: "authorization_code" for initial token, "refresh_token" for refresh
    pub grant_type: String,

    /// Authorization code (used with grant_type=authorization_code)
    #[serde(default)]
    pub code: Option<String>,

    /// Refresh token (used with grant_type=refresh_token)
    #[serde(default)]
    pub refresh_token: Option<String>,

    /// Client ID (optional, not validated in mock)
    #[serde(default)]
    pub client_id: Option<String>,

    /// Client secret (optional, not validated in mock)
    #[serde(default)]
    pub client_secret: Option<String>,

    /// Redirect URI (optional, not validated in mock)
    #[serde(default)]
    pub redirect_uri: Option<String>,

    /// Custom expiry in seconds from now (for testing)
    /// Can be negative to create expired tokens
    #[serde(default)]
    pub expires_in: Option<i64>,

    /// Custom scope (optional, for testing)
    /// If not provided, uses default mock scope or environment variable
    #[serde(default)]
    pub scope: Option<String>,
}

/// Response for successful token generation
/// Follows Google OAuth2 token response format
#[derive(Debug, Serialize)]
pub struct TokenResponse {
    /// The access token
    pub access_token: String,

    /// The refresh token (only included for grant_type=authorization_code)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,

    /// Token type (always "Bearer")
    pub token_type: String,

    /// Expiry time in seconds from now
    pub expires_in: i64,

    /// Scope (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
}

/// Error response for OAuth errors
/// Follows Google OAuth2 error response format
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    /// Error code
    pub error: String,

    /// Error description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_description: Option<String>,
}

/// Token metadata for tracking expiry and scope
#[derive(Debug, Clone)]
struct TokenMetadata {
    /// When the token was issued
    issued_at: DateTime<Utc>,
    /// Expiry duration in seconds (can be negative for expired tokens)
    expires_in: i64,
    /// The scope associated with this token
    scope: String,
}

impl TokenMetadata {
    /// Check if the token is expired
    fn is_expired(&self) -> bool {
        let now = Utc::now();
        let expiry_time = self.issued_at + chrono::Duration::seconds(self.expires_in);
        now >= expiry_time
    }
}

// Global token store for tracking token expiry
lazy_static::lazy_static! {
    static ref TOKEN_STORE: Arc<RwLock<HashMap<String, TokenMetadata>>> =
        Arc::new(RwLock::new(HashMap::new()));
}

/// Validate if an access token is expired
pub fn validate_token(token: &str) -> Result<(), String> {
    let store = TOKEN_STORE.read().unwrap();

    if let Some(metadata) = store.get(token) {
        if metadata.is_expired() {
            return Err("Token has expired".to_string());
        }
        Ok(())
    } else {
        // If token not found, it might be from before tracking was implemented
        // or it's an invalid token. For mock purposes, we'll allow it.
        Ok(())
    }
}

/// Retrieve the scope associated with a token
pub fn get_token_scope(token: &str) -> Option<String> {
    let store = TOKEN_STORE.read().unwrap();
    store.get(token).map(|metadata| metadata.scope.clone())
}

/// Handler for token generation and refresh
async fn token_handler(Form(request): Form<TokenRequest>) -> impl IntoResponse {
    match request.grant_type.as_str() {
        "authorization_code" => handle_authorization_code(request).await.into_response(),
        "refresh_token" => handle_refresh_token(request).await.into_response(),
        _ => {
            let error = ErrorResponse {
                error: "unsupported_grant_type".to_string(),
                error_description: Some(format!(
                    "Grant type '{}' is not supported. Use 'authorization_code' or 'refresh_token'",
                    request.grant_type
                )),
            };
            (StatusCode::BAD_REQUEST, Json(error)).into_response()
        }
    }
}

/// Handle authorization_code grant type (initial token generation)
async fn handle_authorization_code(request: TokenRequest) -> impl IntoResponse {
    // In a real implementation, we would validate the authorization code
    // For mock purposes, we just check if it's present
    if request.code.is_none() || request.code.as_ref().unwrap().is_empty() {
        let error = ErrorResponse {
            error: "invalid_request".to_string(),
            error_description: Some(
                "The 'code' parameter is required for grant_type=authorization_code".to_string(),
            ),
        };
        return (StatusCode::BAD_REQUEST, Json(error)).into_response();
    }

    // Generate tokens
    let access_token = format!("ya29.mock_{}", uuid::Uuid::new_v4());
    let refresh_token = format!("1//mock_{}", uuid::Uuid::new_v4());

    // Use custom expiry if provided, otherwise default to 3600 seconds (1 hour)
    let expires_in = request.expires_in.unwrap_or(3600);

    // Use custom scope if provided in request, then check environment variable, then use default
    let scope = request
        .scope
        .or_else(|| std::env::var("OAUTH_MOCK_SCOPE").ok())
        .or_else(|| Some("mock.scope.read mock.scope.write".to_string()))
        .unwrap();

    // Store token metadata for expiry validation and scope tracking
    let metadata = TokenMetadata {
        issued_at: Utc::now(),
        expires_in,
        scope: scope.clone(),
    };
    {
        let mut store = TOKEN_STORE.write().unwrap();
        store.insert(access_token.clone(), metadata.clone());
        // Also store refresh token with the same scope so it can be retrieved later
        store.insert(refresh_token.clone(), metadata.clone());
    }

    let response = TokenResponse {
        access_token,
        refresh_token: Some(refresh_token),
        token_type: "Bearer".to_string(),
        expires_in,
        scope: Some(scope),
    };

    (StatusCode::OK, Json(response)).into_response()
}

/// Handle refresh_token grant type (token refresh)
async fn handle_refresh_token(request: TokenRequest) -> impl IntoResponse {
    // In a real implementation, we would validate the refresh token
    // For mock purposes, we just check if it's present
    if request.refresh_token.is_none() || request.refresh_token.as_ref().unwrap().is_empty() {
        let error = ErrorResponse {
            error: "invalid_request".to_string(),
            error_description: Some(
                "The 'refresh_token' parameter is required for grant_type=refresh_token"
                    .to_string(),
            ),
        };
        return (StatusCode::BAD_REQUEST, Json(error)).into_response();
    }

    let refresh_token = request.refresh_token.as_ref().unwrap();

    // Try to get the original scope from the refresh token
    // In a real implementation, refresh tokens would be tracked separately
    // For this mock, we'll try to look it up from TOKEN_STORE
    let original_scope = get_token_scope(refresh_token);

    // Generate a new access token
    let access_token = format!("ya29.mock_{}", uuid::Uuid::new_v4());

    // Use custom expiry if provided, otherwise default to 3600 seconds (1 hour)
    let expires_in = request.expires_in.unwrap_or(3600);

    // Use custom scope if provided in request, then use original scope from refresh token,
    // then check environment variable, then use default
    let scope = request
        .scope
        .or(original_scope)
        .or_else(|| std::env::var("OAUTH_MOCK_SCOPE").ok())
        .or_else(|| Some("mock.scope.read mock.scope.write".to_string()))
        .unwrap();

    // Store token metadata for expiry validation and scope tracking
    let metadata = TokenMetadata {
        issued_at: Utc::now(),
        expires_in,
        scope: scope.clone(),
    };
    {
        let mut store = TOKEN_STORE.write().unwrap();
        store.insert(access_token.clone(), metadata.clone());
    }

    let response = TokenResponse {
        access_token,
        refresh_token: None, // Refresh tokens are not returned when refreshing
        token_type: "Bearer".to_string(),
        expires_in,
        scope: Some(scope),
    };

    (StatusCode::OK, Json(response)).into_response()
}

/// Create the router for the OAuth service
pub fn create_router() -> Router {
    Router::new().route("/token", post(token_handler))
}
