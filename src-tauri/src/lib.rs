use tauri_plugin_sql::{Migration, MigrationKind};

#[tauri::command]
async fn fetch_url_html(url: String) -> Result<String, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Invalid URL protocol. Must start with http:// or https://".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("Server returned error status: {}", status));
    }

    let body = response.text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    Ok(body)
}

#[tauri::command]
async fn proxy_post_request(
    url: String,
    headers: std::collections::HashMap<String, String>,
    body: String,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let mut request_builder = client.post(&url);

    for (key, value) in headers {
        request_builder = request_builder.header(key, value);
    }

    let response = request_builder
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status();
    let response_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    if !status.is_success() {
        return Err(format!("HTTP Error {}: {}", status, response_text));
    }

    Ok(response_text)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: "
                CREATE TABLE IF NOT EXISTS folders (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    icon TEXT,
                    color TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS decks (
                    id TEXT PRIMARY KEY,
                    folder_id TEXT,
                    name TEXT NOT NULL,
                    icon TEXT,
                    description TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE SET NULL
                );
                CREATE TABLE IF NOT EXISTS flashcards (
                    id TEXT PRIMARY KEY,
                    deck_id TEXT NOT NULL,
                    front TEXT NOT NULL,
                    back TEXT NOT NULL,
                    tags TEXT,
                    ease REAL DEFAULT 2.5,
                    interval_days INTEGER DEFAULT 0,
                    repetitions INTEGER DEFAULT 0,
                    next_review DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(deck_id) REFERENCES decks(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS revision_history (
                    id TEXT PRIMARY KEY,
                    flashcard_id TEXT,
                    type TEXT NOT NULL,
                    score REAL NOT NULL,
                    reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            ",
            kind: MigrationKind::Up,
        }
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:oxide_deck.db", migrations)
                .build()
        )
        .invoke_handler(tauri::generate_handler![fetch_url_html, proxy_post_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

