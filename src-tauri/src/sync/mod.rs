pub mod models;
pub mod media;
pub mod merger;
pub mod db;
pub mod webdav;
pub mod engine;

use tauri::command;
use models::{WebDavConfig, SyncResult};

#[command]
pub async fn sync_run_native(
    app: tauri::AppHandle,
    config: WebDavConfig,
    force_upload: Option<bool>,
    force_download: Option<bool>,
) -> Result<SyncResult, String> {
    engine::run_native_sync(
        app,
        config,
        force_upload.unwrap_or(false),
        force_download.unwrap_or(false),
    )
    .await
}

#[command]
pub async fn resolve_media_file_path(
    app: tauri::AppHandle,
    media_uri: String,
) -> Result<String, String> {
    use tauri::Manager;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let filename = media_uri
        .strip_prefix("media://")
        .unwrap_or(&media_uri);

    let path = app_data_dir.join("media").join(filename);
    Ok(path.to_string_lossy().to_string())
}
