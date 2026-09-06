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
        .map_err(|e| format!("Failed to read remote file body: {}. The connection was interrupted while streaming from WebDAV. Try tapping 'Force Upload' in Settings to push a fresh snapshot.", e))?;

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

fn percent_decode(input: &str) -> String {
    let mut bytes = Vec::with_capacity(input.len());
    let mut chars = input.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let h1 = chars.next();
            let h2 = chars.next();
            if let (Some(h1), Some(h2)) = (h1, h2) {
                if let (Some(d1), Some(d2)) = (hex_val(h1), hex_val(h2)) {
                    bytes.push((d1 << 4) | d2);
                    continue;
                } else {
                    bytes.push(b'%');
                    bytes.push(h1);
                    bytes.push(h2);
                    continue;
                }
            } else {
                bytes.push(b'%');
                if let Some(h1) = h1 {
                    bytes.push(h1);
                }
                continue;
            }
        } else {
            bytes.push(b);
        }
    }
    String::from_utf8_lossy(&bytes).to_string()
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Uploads merged sync snapshot with optional optimistic concurrency (If-Match).
/// Uses atomic .tmp upload and WebDAV MOVE with Overwrite: T to prevent incomplete writes.
/// Falls back to direct PUT if the server does not support MOVE.
pub async fn upload_snapshot_conditional(
    client: &Client,
    config: &WebDavConfig,
    json_str: &str,
    if_match_etag: Option<&str>,
) -> Result<Option<String>, UploadError> {
    let url = get_sync_file_url(config);
    let auth = build_basic_auth(&config.username, &config.password);

    // Strip weak ETag prefix (W/ or w/) per RFC 7232 § 3.1
    let clean_etag_opt = if_match_etag.map(|etag| {
        let trimmed = etag.trim();
        if trimmed.starts_with("W/") || trimmed.starts_with("w/") {
            trimmed[2..].trim().to_string()
        } else {
            trimmed.to_string()
        }
    });

    let tmp_url = format!("{}.tmp", url);

    // 1. Upload to .tmp file first
    let tmp_res = client
        .put(&tmp_url)
        .header("Authorization", &auth)
        .header("Content-Type", "application/json; charset=utf-8")
        .body(json_str.to_string())
        .send()
        .await
        .map_err(|e| UploadError::Network(format!("Upload to temporary file failed: {}", e)))?;

    let tmp_status = tmp_res.status();
    if !tmp_status.is_success() && tmp_status != StatusCode::CREATED && tmp_status != StatusCode::NO_CONTENT {
        let err_text = tmp_res.text().await.unwrap_or_default();
        return Err(UploadError::Network(format!(
            "Server returned HTTP {} on temporary upload: {}",
            tmp_status, err_text
        )));
    }

    // 2. Try to atomically MOVE .tmp to destination file with Overwrite: T
    if let Ok(move_method) = reqwest::Method::from_bytes(b"MOVE") {
        let mut move_req = client
            .request(move_method, &tmp_url)
            .header("Authorization", &auth)
            .header("Destination", &url)
            .header("Overwrite", "T");

        if let Some(ref etag) = clean_etag_opt {
            move_req = move_req.header("If-Match", etag);
        }

        if let Ok(res) = move_req.send().await {
            let status = res.status();
            if status == StatusCode::PRECONDITION_FAILED {
                let _ = client.delete(&tmp_url).header("Authorization", &auth).send().await;
                return Err(UploadError::PreconditionFailed);
            }

            if status.is_success() || status == StatusCode::CREATED || status == StatusCode::NO_CONTENT {
                let new_etag = res
                    .headers()
                    .get("etag")
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string());
                return Ok(new_etag);
            }

            // If MOVE returned unsupported status (e.g. 405 Method Not Allowed), clean up tmp
            let _ = client.delete(&tmp_url).header("Authorization", &auth).send().await;
        } else {
            let _ = client.delete(&tmp_url).header("Authorization", &auth).send().await;
        }
    }

    // 3. Fallback: Direct PUT with If-Match
    let mut req = client
        .put(&url)
        .header("Authorization", &auth)
        .header("Content-Type", "application/json; charset=utf-8")
        .body(json_str.to_string());

    if let Some(ref etag) = clean_etag_opt {
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

pub fn get_media_dir_url(config: &WebDavConfig) -> String {
    let sub = config.remote_path.trim_start_matches('/');
    let path = if sub.is_empty() {
        "media/".to_string()
    } else {
        format!("{}/media/", sub)
    };
    normalize_url(&config.server_url, &path)
}

/// Lists all remote media filenames in a single HTTP PROPFIND request.
/// Supports arbitrary WebDAV XML namespaces and percent-encoded filenames.
pub async fn list_remote_media_files(
    client: &Client,
    config: &WebDavConfig,
) -> Option<std::collections::HashSet<String>> {
    let media_url = get_media_dir_url(config);
    let auth = build_basic_auth(&config.username, &config.password);
    let propfind = reqwest::Method::from_bytes(b"PROPFIND").ok()?;

    let res = client
        .request(propfind, &media_url)
        .header("Authorization", &auth)
        .header("Depth", "1")
        .send()
        .await
        .ok()?;

    let status = res.status();
    // 207 Multi-Status or 200 OK
    if !status.is_success() && status.as_u16() != 207 {
        return None;
    }

    let text = res.text().await.ok()?;
    let mut files = std::collections::HashSet::new();

    // Parse href tags from PROPFIND XML (supports <d:href>, <D:href>, <a:href>, <DAV:href>, <href>)
    for part in text.split('<') {
        if let Some((tag_with_attrs, content_and_rest)) = part.split_once('>') {
            let tag_name = tag_with_attrs
                .split_whitespace()
                .next()
                .unwrap_or("")
                .to_ascii_lowercase();
            if tag_name == "href" || tag_name.ends_with(":href") {
                let href_val = content_and_rest
                    .split('<')
                    .next()
                    .unwrap_or("")
                    .trim()
                    .trim_end_matches('/');
                let decoded_href = percent_decode(href_val);
                if let Some(fname) = decoded_href.split('/').last() {
                    let clean_name = fname.trim();
                    if !clean_name.is_empty() && clean_name != "media" {
                        files.insert(clean_name.to_string());
                    }
                }
            }
        }
    }

    Some(files)
}

/// Synchronizes media files between local media folder and remote /media/ folder
pub async fn sync_media_files(
    client: &Client,
    config: &WebDavConfig,
    media_dir: &Path,
    referenced_files: &std::collections::HashSet<String>,
) -> Result<usize, String> {
    if referenced_files.is_empty() {
        return Ok(0);
    }

    let auth = build_basic_auth(&config.username, &config.password);
    let mut synced_count = 0;

    // Batched check: query all remote filenames in a single PROPFIND request
    let remote_files_opt = list_remote_media_files(client, config).await;

    for filename in referenced_files {
        let local_path = media_dir.join(filename);
        let remote_url = get_media_file_url(config, filename);

        if local_path.exists() {
            let need_upload = match &remote_files_opt {
                Some(remote_files) => !remote_files.contains(filename),
                None => {
                    // Fallback to individual HEAD check if PROPFIND was not supported
                    let head_res = client
                        .head(&remote_url)
                        .header("Authorization", &auth)
                        .send()
                        .await;
                    match head_res {
                        Ok(r) => r.status() == StatusCode::NOT_FOUND,
                        Err(_) => true,
                    }
                }
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
            let should_download = match &remote_files_opt {
                Some(remote_files) => remote_files.contains(filename),
                None => true,
            };

            if should_download {
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
    }

    Ok(synced_count)
}

