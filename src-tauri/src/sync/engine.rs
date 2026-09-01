use tauri::{AppHandle, Emitter, Manager};
use sqlx::sqlite::SqlitePoolOptions;
use reqwest::Client;
use crate::sync::models::{
    SyncPackage, SyncProgressEvent, SyncResult, SyncStats, WebDavConfig,
};
use crate::sync::webdav::UploadError;

pub async fn run_native_sync(
    app: AppHandle,
    config: WebDavConfig,
    force_upload: bool,
    force_download: bool,
) -> Result<SyncResult, String> {
    let emit_progress = |stage: &str, message: &str, current: Option<usize>, total: Option<usize>| {
        let _ = app.emit(
            "sync-progress",
            SyncProgressEvent {
                stage: stage.to_string(),
                message: message.to_string(),
                current,
                total,
            },
        );
    };

    emit_progress("initializing", "Connecting to local database...", None, None);

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to locate app data directory: {}", e))?;

    let db_path = app_data_dir.join("oxide_deck.db");
    let db_url = format!("sqlite://{}", db_path.to_str().unwrap());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to SQLite: {}", e))?;

    let media_dir = crate::sync::media::get_media_dir(&app_data_dir);

    // 1. One-time Migration: extract any embedded base64 images from SQLite to media folder
    emit_progress("media_migration", "Checking for embedded image data...", None, None);
    let _ = crate::sync::media::migrate_existing_base64_images_in_db(&pool, &media_dir).await;

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    // 2. Ensure remote folders exist
    emit_progress("verifying_server", "Connecting to WebDAV storage...", None, None);
    crate::sync::webdav::ensure_remote_directories(&client, &config).await?;

    // 3. Check remote metadata (HEAD)
    let (_remote_exists, _remote_etag) =
        crate::sync::webdav::get_remote_metadata(&client, &config).await?;

    // Handle Force Upload
    if force_upload {
        emit_progress("force_upload", "Exporting local database for upload...", None, None);
        let local_pkg = crate::sync::db::export_local_package(&pool, "client_desktop", "Desktop")
            .await
            .map_err(|e| format!("Local export error: {}", e))?;

        let json_str = serde_json::to_string(&local_pkg)
            .map_err(|e| format!("JSON serialization error: {}", e))?;

        emit_progress("force_upload", "Uploading snapshot to WebDAV...", None, None);
        let _new_etag = crate::sync::webdav::upload_snapshot_conditional(
            &client,
            &config,
            &json_str,
            None,
        )
        .await
        .map_err(|e| match e {
            UploadError::PreconditionFailed => "Precondition failed during force upload.".to_string(),
            UploadError::Network(err) => err,
        })?;

        // Sync media
        let referenced = crate::sync::media::extract_referenced_media_files(&local_pkg.flashcards);
        let media_count = crate::sync::webdav::sync_media_files(&client, &config, &media_dir, &referenced)
            .await
            .unwrap_or(0);

        let now_iso = crate::sync::merger::chrono_now_iso();
        return Ok(SyncResult {
            success: true,
            message: format!(
                "Successfully uploaded database ({} cards, {} media files).",
                local_pkg.flashcards.len(),
                media_count
            ),
            timestamp: now_iso,
            stats: Some(SyncStats {
                subjects: local_pkg.subjects.len(),
                folders: local_pkg.folders.len(),
                decks: local_pkg.decks.len(),
                flashcards: local_pkg.flashcards.len(),
                revision_logs: local_pkg.revision_history.len(),
                tests: local_pkg.tests.len(),
                media_synced: media_count,
            }),
        });
    }

    // Handle Force Download
    if force_download {
        emit_progress("force_download", "Downloading snapshot from WebDAV...", None, None);
        let remote_data = crate::sync::webdav::download_snapshot(&client, &config).await?;
        let (raw_json, _) = remote_data
            .filter(|(raw, _)| !raw.trim().is_empty())
            .ok_or_else(|| "No remote sync snapshot found on WebDAV server.".to_string())?;

        let remote_pkg: SyncPackage = serde_json::from_str(&raw_json)
            .map_err(|e| format!("Invalid remote JSON snapshot: {}", e))?;

        emit_progress("force_download", "Restoring local database...", None, None);
        crate::sync::db::apply_sync_package_to_db(&pool, &remote_pkg)
            .await
            .map_err(|e| format!("Failed to apply snapshot to database: {}", e))?;

        // Sync media
        let referenced = crate::sync::media::extract_referenced_media_files(&remote_pkg.flashcards);
        let media_count = crate::sync::webdav::sync_media_files(&client, &config, &media_dir, &referenced)
            .await
            .unwrap_or(0);

        let now_iso = crate::sync::merger::chrono_now_iso();
        return Ok(SyncResult {
            success: true,
            message: format!(
                "Successfully restored database from WebDAV ({} cards).",
                remote_pkg.flashcards.len()
            ),
            timestamp: now_iso,
            stats: Some(SyncStats {
                subjects: remote_pkg.subjects.len(),
                folders: remote_pkg.folders.len(),
                decks: remote_pkg.decks.len(),
                flashcards: remote_pkg.flashcards.len(),
                revision_logs: remote_pkg.revision_history.len(),
                tests: remote_pkg.tests.len(),
                media_synced: media_count,
            }),
        });
    }

    // Bidirectional Merge with Optimistic Concurrency Retry Loop
    let max_retries = 3;
    let mut attempt = 0;

    loop {
        attempt += 1;
        emit_progress(
            "syncing",
            &format!("Syncing database (Attempt {}/{})...", attempt, max_retries),
            Some(attempt),
            Some(max_retries),
        );

        // 1. Export local state
        let local_pkg = crate::sync::db::export_local_package(&pool, "client_device", "Device")
            .await
            .map_err(|e| format!("Failed to read local database: {}", e))?;

        // 2. Download remote snapshot
        let remote_data = crate::sync::webdav::download_snapshot(&client, &config).await?;

        let (merged_pkg, current_remote_etag) = match remote_data {
            Some((raw_json, etag)) if !raw_json.trim().is_empty() => {
                // Back up legacy v13 files if needed
                let _ = crate::sync::webdav::backup_legacy_file_if_needed(&client, &config, &raw_json).await;

                let remote_pkg: SyncPackage = serde_json::from_str(&raw_json)
                    .map_err(|e| format!(
                        "Error deserializing remote sync package: {}. The remote WebDAV file appears corrupted or truncated from an interrupted transfer. Please use 'Force Upload' in Settings to replace it with your local database.",
                        e
                    ))?;

                emit_progress("merging", "Reconciling local and remote changes...", None, None);
                let merged = crate::sync::merger::merge_sync_packages(local_pkg, remote_pkg);
                (merged, etag)
            }
            _ => {
                // First sync, remote is empty or 0-byte file
                (local_pkg, None)
            }
        };

        // 3. Save merged dataset into local SQLite in atomic transaction
        emit_progress("committing", "Writing updates to local database...", None, None);
        crate::sync::db::apply_sync_package_to_db(&pool, &merged_pkg)
            .await
            .map_err(|e| format!("Failed to commit merged data: {}", e))?;

        // 4. Sync media files
        emit_progress("media_sync", "Syncing flashcard media assets...", None, None);
        let referenced_media = crate::sync::media::extract_referenced_media_files(&merged_pkg.flashcards);
        let media_count = crate::sync::webdav::sync_media_files(&client, &config, &media_dir, &referenced_media)
            .await
            .unwrap_or(0);

        // 5. Upload merged snapshot with optimistic concurrency
        emit_progress("uploading", "Uploading synced snapshot to cloud...", None, None);
        let json_str = serde_json::to_string(&merged_pkg)
            .map_err(|e| format!("Error serializing merged package: {}", e))?;

        let upload_result = crate::sync::webdav::upload_snapshot_conditional(
            &client,
            &config,
            &json_str,
            current_remote_etag.as_deref(),
        )
        .await;

        match upload_result {
            Ok(_new_etag) => {
                let now_iso = crate::sync::merger::chrono_now_iso();
                emit_progress("complete", "Sync completed successfully!", None, None);

                return Ok(SyncResult {
                    success: true,
                    message: format!(
                        "Sync successful! Synced {} deck(s), {} card(s), and {} media file(s).",
                        merged_pkg.decks.len(),
                        merged_pkg.flashcards.len(),
                        media_count
                    ),
                    timestamp: now_iso,
                    stats: Some(SyncStats {
                        subjects: merged_pkg.subjects.len(),
                        folders: merged_pkg.folders.len(),
                        decks: merged_pkg.decks.len(),
                        flashcards: merged_pkg.flashcards.len(),
                        revision_logs: merged_pkg.revision_history.len(),
                        tests: merged_pkg.tests.len(),
                        media_synced: media_count,
                    }),
                });
            }
            Err(UploadError::PreconditionFailed) => {
                if attempt < max_retries {
                    // Conflict detected! Wait with backoff and re-merge
                    tokio::time::sleep(tokio::time::Duration::from_millis(300 * attempt as u64)).await;
                    continue;
                } else {
                    return Err("WebDAV sync conflict: another device updated concurrently. Please retry.".to_string());
                }
            }
            Err(UploadError::Network(err)) => {
                return Err(format!("WebDAV upload failed: {}", err));
            }
        }
    }
}
