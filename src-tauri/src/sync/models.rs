use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, sqlx::FromRow)]
pub struct Subject {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, sqlx::FromRow)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub subject_id: Option<String>,
    pub parent_folder_id: Option<String>,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, sqlx::FromRow)]
pub struct Deck {
    pub id: String,
    pub folder_id: Option<String>,
    pub name: String,
    pub icon: Option<String>,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, sqlx::FromRow)]
pub struct Flashcard {
    pub id: String,
    pub deck_id: String,
    pub front: String,
    pub back: String,
    pub tags: Option<String>,
    pub ease: Option<f64>,
    pub interval_days: Option<i64>,
    pub repetitions: Option<i64>,
    pub next_review: String,
    pub created_at: String,
    pub stability: Option<f64>,
    pub difficulty: Option<f64>,
    pub state: Option<i64>,
    pub reps: Option<i64>,
    pub lapses: Option<i64>,
    pub elapsed_days: Option<i64>,
    pub scheduled_days: Option<i64>,
    pub last_review: Option<String>,
    pub image_url: Option<String>,
    pub front_image_url: Option<String>,
    pub back_image_url: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, sqlx::FromRow)]
pub struct RevisionHistory {
    pub id: String,
    pub flashcard_id: Option<String>,
    #[serde(rename = "type")]
    #[sqlx(rename = "type")]
    pub revision_type: String,
    pub score: f64,
    pub reviewed_at: String,
    pub rating: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug, Clone, sqlx::FromRow)]
pub struct Test {
    pub id: String,
    pub subject_id: String,
    pub name: String,
    pub description: Option<String>,
    pub source_type: String,
    pub source_data: Option<String>,
    pub score: Option<f64>,
    pub max_score: f64,
    pub test_date: Option<String>,
    pub time_limit_minutes: Option<i64>,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, sqlx::FromRow)]
pub struct TestQuestion {
    pub id: String,
    pub test_id: String,
    #[serde(rename = "type")]
    #[sqlx(rename = "type")]
    pub question_type: String,
    pub question: String,
    pub options: Option<String>,
    pub correct_answer: Option<String>,
    pub user_answer: Option<String>,
    pub score: Option<f64>,
    pub math_work: Option<String>,
    pub source_page: Option<i64>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, sqlx::FromRow)]
pub struct TestAnalysis {
    pub id: String,
    pub test_id: String,
    pub subject_id: String,
    pub summary: String,
    pub strengths: Option<String>,
    pub weaknesses: Option<String>,
    pub recommendations: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, sqlx::FromRow)]
pub struct TestError {
    pub id: String,
    pub test_id: String,
    pub subject_id: String,
    pub question_id: Option<String>,
    pub question_text: String,
    pub user_answer: Option<String>,
    pub correct_answer: Option<String>,
    pub error_reason: String,
    pub score: Option<f64>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, sqlx::FromRow)]
pub struct Tombstone {
    pub entity_id: String,
    pub entity_type: String,
    pub deleted_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SyncPackage {
    pub version: String,
    pub exported_at: String,
    pub client_id: String,
    pub device_name: String,
    pub schema_version: i64,
    pub subjects: Vec<Subject>,
    pub folders: Vec<Folder>,
    pub decks: Vec<Deck>,
    pub flashcards: Vec<Flashcard>,
    pub revision_history: Vec<RevisionHistory>,
    pub tests: Vec<Test>,
    pub test_questions: Vec<TestQuestion>,
    pub test_analyses: Vec<TestAnalysis>,
    pub test_errors: Vec<TestError>,
    pub fsrs_parameters: Option<String>,
    pub notification_settings: Option<serde_json::Value>,
    #[serde(default)]
    pub tombstones: Vec<Tombstone>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WebDavConfig {
    pub enabled: bool,
    #[serde(rename = "serverUrl")]
    pub server_url: String,
    pub username: String,
    pub password: String,
    #[serde(rename = "remotePath")]
    pub remote_path: String,
    #[serde(rename = "lastSyncedAt")]
    pub last_synced_at: Option<String>,
    #[serde(rename = "lastRemoteEtag")]
    pub last_remote_etag: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SyncStats {
    pub subjects: usize,
    pub folders: usize,
    pub decks: usize,
    pub flashcards: usize,
    pub revision_logs: usize,
    pub tests: usize,
    pub media_synced: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SyncResult {
    pub success: boolean_or_bool::Boolean,
    pub message: String,
    pub timestamp: String,
    pub stats: Option<SyncStats>,
}

// Helper alias for bool
mod boolean_or_bool {
    pub type Boolean = bool;
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SyncProgressEvent {
    pub stage: String, // e.g. "checking", "downloading", "merging", "saving", "media", "uploading", "done"
    pub message: String,
    pub current: Option<usize>,
    pub total: Option<usize>,
}
