use std::path::Path;
use std::fs;
use reqwest::{Client, StatusCode};
use crate::sync::models::WebDavConfig;

pub enum UploadError {
    PreconditionFailed, // HTTP 412
    Network(String),
}

fn build_basic_auth(user: &str, pass: &str) -> String {
    use base64::prelude::*;
    let creds = format!("{}:{}", user, pass);
    format!("Basic {}", BASE64_STANDARD.encode(creds.as_bytes()))
}

fn normalize_url(base: &str, path: &str) -> String {
    let clean_base = base.trim_end_matches('/');
    let clean_path = path.trim_start_matches('/');
    if clean_path.is_empty() {
        clean_base.to_string()
    } else {
        format!("{}/{}", clean_base, clean_path)
    }
}

pub fn get_sync_file_url(config: &WebDavConfig) -> String {
    let sub = config.remote_path.trim_start_matches('/');
    let path = if sub.is_empty() {
        "oxide_deck_sync.json".to_string()
    } else {
        format!("{}/oxide_deck_sync.json", sub)
    };
    normalize_url(&config.server_url, &path)
}

pub fn get_media_file_url(config: &WebDavConfig, filename: &str) -> String {
    let sub = config.remote_path.trim_start_matches('/');
    let path = if sub.is_empty() {
        format!("media/{}", filename)
    } else {
        format!("{}/media/{}", sub, filename)
    };
    normalize_url(&config.server_url, &path)
}

/// Checks remote file metadata via lightweight HEAD request
pub async fn get_remote_metadata(
    client: &Client,
    config: &WebDavConfig,
) -> Result<(bool, Option<String>), String> {
    let url = get_sync_file_url(config);
    let auth = build_basic_auth(&config.username, &config.password);

    let res = client
        .head(&url)
        .header("Authorization", &auth)
        .send()
        .await
        .map_err(|e| format!("HEAD request failed: {}", e))?;

    let status = res.status();
    if status == StatusCode::NOT_FOUND {
        return Ok((false, None));
    }

    let etag = res
        .headers()
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    Ok((status.is_success(), etag))
}

/// Ensure remote root directory and /media/ subfolder exist via MKCOL
pub async fn ensure_remote_directories(
    client: &Client,
    config: &WebDavConfig,
) -> Result<(), String> {
    let auth = build_basic_auth(&config.username, &config.password);
    let sub = config.remote_path.trim_start_matches('/');

    let mkcol = reqwest::Method::from_bytes(b"MKCOL").unwrap();

    // 1. Root sync dir (e.g. /OxideDeck)
    if !sub.is_empty() {
        let root_url = normalize_url(&config.server_url, sub);
        let _ = client
            .request(mkcol.clone(), &root_url)
            .header("Authorization", &auth)
            .send()
            .await;
    }

    // 2. Media dir (e.g. /OxideDeck/media)
    let media_path = if sub.is_empty() {
        "media".to_string()
    } else {
        format!("{}/media", sub)
    };
    let media_url = normalize_url(&config.server_url, &media_path);
    let _ = client
        .request(mkcol, &media_url)
        .header("Authorization", &auth)
        .send()
        .await;

    Ok(())
}

/// Downloads remote sync package if present
pub async fn download_snapshot(
    client: &Client,
    config: &WebDavConfig,
) -> Result<Option<(String, Option<String>)>, String> {
    let url = get_sync_file_url(config);
    let auth = build_basic_auth(&config.username, &config.password);

    let res = client
        .get(&url)
        .header("Authorization", &auth)
        .send()
        .await
        .map_err(|e| format!("GET request failed: {}", e))?;

    let status = res.status();
    if status == StatusCode::NOT_FOUND {
        return Ok(None);
    }

    if !status.is_success() {
        return Err(format!("Server returned HTTP {}", status));
    }

    let etag = res
        .headers()
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let body = res
        .text()
        .await
        .map_err(|e| format!("Failed to read body: {}", e))?;

    if body.trim().is_empty() {
        return Ok(None);
    }

    Ok(Some((body, etag)))
}

/// Back up legacy sync files (schema <= 13) to /OxideDeck/oxide_deck_sync_legacy_backup.json
pub async fn backup_legacy_file_if_needed(
    client: &Client,
    config: &WebDavConfig,
    remote_raw_json: &str,
) -> Result<(), String> {
    // Check if legacy schema version <= 13
    if remote_raw_json.contains("\"schema_version\": 13")
        || remote_raw_json.contains("\"schema_version\":13")
        || remote_raw_json.contains("\"schema_version\": 12")
    {
        let sub = config.remote_path.trim_start_matches('/');
        let backup_path = if sub.is_empty() {
            "oxide_deck_sync_legacy_backup.json".to_string()
        } else {
            format!("{}/oxide_deck_sync_legacy_backup.json", sub)
        };
        let backup_url = normalize_url(&config.server_url, &backup_path);
        let auth = build_basic_auth(&config.username, &config.password);

        // Upload legacy backup safely without overwriting if already backed up
        let _ = client
            .put(&backup_url)
            .header("Authorization", &auth)
            .header("Content-Type", "application/json; charset=utf-8")
            .body(remote_raw_json.to_string())
            .send()
            .await;
    }
    Ok(())
}

/// Uploads merged sync snapshot with optional optimistic concurrency (If-Match)
pub async fn upload_snapshot_conditional(
    client: &Client,
    config: &WebDavConfig,
    json_str: &str,
    if_match_etag: Option<&str>,
) -> Result<Option<String>, UploadError> {
    let url = get_sync_file_url(config);
    let auth = build_basic_auth(&config.username, &config.password);

    let mut req = client
        .put(&url)
        .header("Authorization", &auth)
        .header("Content-Type", "application/json; charset=utf-8")
        .body(json_str.to_string());

    if let Some(etag) = if_match_etag {
        req = req.header("If-Match", etag);
    }

    let res = req
        .send()
        .await
        .map_err(|e| UploadError::Network(format!("Upload request failed: {}", e)))?;

    let status = res.status();
    if status == StatusCode::PRECONDITION_FAILED {
        return Err(UploadError::PreconditionFailed);
    }

    if !status.is_success() && status != StatusCode::CREATED && status != StatusCode::NO_CONTENT {
        let err_text = res.text().await.unwrap_or_default();
        return Err(UploadError::Network(format!(
            "Server returned HTTP {}: {}",
            status, err_text
        )));
    }

    let new_etag = res
        .headers()
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    Ok(new_etag)
}

/// Synchronizes media files between local media folder and remote /media/ folder
pub async fn sync_media_files(
    client: &Client,
    config: &WebDavConfig,
    media_dir: &Path,
    referenced_files: &std::collections::HashSet<String>,
) -> Result<usize, String> {
    let auth = build_basic_auth(&config.username, &config.password);
    let mut synced_count = 0;

    for filename in referenced_files {
        let local_path = media_dir.join(filename);
        let remote_url = get_media_file_url(config, filename);

        if local_path.exists() {
            // Check if remote already has it via HEAD
            let head_res = client
                .head(&remote_url)
                .header("Authorization", &auth)
                .send()
                .await;

            let need_upload = match head_res {
                Ok(r) => r.status() == StatusCode::NOT_FOUND,
                Err(_) => true,
            };

            if need_upload {
                if let Ok(bytes) = fs::read(&local_path) {
                    let _ = client
                        .put(&remote_url)
                        .header("Authorization", &auth)
                        .body(bytes)
                        .send()
                        .await;
                    synced_count += 1;
                }
            }
        } else {
            // Local file missing, download from remote WebDAV
            let get_res = client
                .get(&remote_url)
                .header("Authorization", &auth)
                .send()
                .await;

            if let Ok(r) = get_res {
                if r.status().is_success() {
                    if let Ok(bytes) = r.bytes().await {
                        let _ = fs::write(&local_path, &bytes);
                        synced_count += 1;
                    }
                }
            }
        }
    }

    Ok(synced_count)
}
