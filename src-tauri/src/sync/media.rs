use std::fs;
use std::path::{Path, PathBuf};
use base64::prelude::*;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

pub fn get_media_dir(app_data_dir: &Path) -> PathBuf {
    let dir = app_data_dir.join("media");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

/// Convert a base64 data URL into a local media file and return its canonical "media://<sha256>.<ext>" URI.
pub fn extract_base64_to_media_file(data_url: &str, media_dir: &Path) -> Option<String> {
    if !data_url.starts_with("data:") {
        return None;
    }

    let parts: Vec<&str> = data_url.splitn(2, ',').collect();
    if parts.len() != 2 {
        return None;
    }

    let header = parts[0];
    let payload = parts[1];

    let ext = if header.contains("image/png") {
        "png"
    } else if header.contains("image/jpeg") || header.contains("image/jpg") {
        "jpg"
    } else if header.contains("image/webp") {
        "webp"
    } else if header.contains("image/gif") {
        "gif"
    } else if header.contains("image/svg") {
        "svg"
    } else {
        "bin"
    };

    let bytes = match BASE64_STANDARD.decode(payload.trim()) {
        Ok(b) => b,
        Err(_) => return None,
    };

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let hash = hex::encode(hasher.finalize());
    let filename = format!("{}.{}", hash, ext);
    let file_path = media_dir.join(&filename);

    if !file_path.exists() {
        if let Err(e) = fs::write(&file_path, &bytes) {
            eprintln!("Failed to write media file {}: {}", filename, e);
            return None;
        }
    }

    Some(format!("media://{}", filename))
}

#[derive(sqlx::FromRow)]
struct CardImages {
    id: String,
    image_url: Option<String>,
    front_image_url: Option<String>,
    back_image_url: Option<String>,
}

/// Scans the local database for flashcards storing embedded base64 data URLs,
/// extracts each image to the local `media/` folder, and replaces the database field
/// with a clean "media://<sha256>.<ext>" reference.
pub async fn migrate_existing_base64_images_in_db(
    pool: &SqlitePool,
    media_dir: &Path,
) -> Result<usize, sqlx::Error> {
    let rows = sqlx::query_as::<_, CardImages>(
        r#"
        SELECT id, image_url, front_image_url, back_image_url
        FROM flashcards
        WHERE (image_url LIKE 'data:%')
           OR (front_image_url LIKE 'data:%')
           OR (back_image_url LIKE 'data:%')
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut migrated_count = 0;

    for row in rows {
        let mut new_image_url = row.image_url.clone();
        let mut new_front_image_url = row.front_image_url.clone();
        let mut new_back_image_url = row.back_image_url.clone();
        let mut modified = false;

        if let Some(ref img) = row.image_url {
            if img.starts_with("data:") {
                if let Some(media_uri) = extract_base64_to_media_file(img, media_dir) {
                    new_image_url = Some(media_uri);
                    modified = true;
                }
            }
        }

        if let Some(ref f_img) = row.front_image_url {
            if f_img.starts_with("data:") {
                if let Some(media_uri) = extract_base64_to_media_file(f_img, media_dir) {
                    new_front_image_url = Some(media_uri);
                    modified = true;
                }
            }
        }

        if let Some(ref b_img) = row.back_image_url {
            if b_img.starts_with("data:") {
                if let Some(media_uri) = extract_base64_to_media_file(b_img, media_dir) {
                    new_back_image_url = Some(media_uri);
                    modified = true;
                }
            }
        }

        if modified {
            sqlx::query(
                r#"
                UPDATE flashcards
                SET image_url = ?, front_image_url = ?, back_image_url = ?
                WHERE id = ?
                "#,
            )
            .bind(&new_image_url)
            .bind(&new_front_image_url)
            .bind(&new_back_image_url)
            .bind(&row.id)
            .execute(pool)
            .await?;

            migrated_count += 1;
        }
    }

    Ok(migrated_count)
}


/// List all filenames stored in local media directory
#[allow(dead_code)]
pub fn list_local_media_files(media_dir: &Path) -> std::collections::HashSet<String> {
    let mut files = std::collections::HashSet::new();
    if let Ok(entries) = fs::read_dir(media_dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    if let Some(name) = entry.file_name().to_str() {
                        files.insert(name.to_string());
                    }
                }
            }
        }
    }
    files
}

/// Helper to extract all media filenames referenced across flashcards (e.g. from "media://<filename>")
pub fn extract_referenced_media_files(cards: &[crate::sync::models::Flashcard]) -> std::collections::HashSet<String> {
    let mut refs = std::collections::HashSet::new();

    let check_uri = |uri: &Option<String>, set: &mut std::collections::HashSet<String>| {
        if let Some(u) = uri {
            if let Some(stripped) = u.strip_prefix("media://") {
                set.insert(stripped.to_string());
            }
        }
    };

    for c in cards {
        check_uri(&c.image_url, &mut refs);
        check_uri(&c.front_image_url, &mut refs);
        check_uri(&c.back_image_url, &mut refs);
    }

    refs
}
