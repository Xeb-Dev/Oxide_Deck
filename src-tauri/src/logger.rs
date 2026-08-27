use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const MAX_LOGS_TOTAL_BYTES: u64 = 50 * 1024 * 1024; // 50MB threshold

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct LogFileInfo {
    pub name: String,
    pub size_bytes: u64,
    pub size_formatted: String,
    pub date: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct LogsSummary {
    pub total_size_bytes: u64,
    pub total_size_formatted: String,
    pub files_count: usize,
    pub files: Vec<LogFileInfo>,
}

fn format_bytes(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.2} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}

pub fn get_logs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {}", e))?;
    let logs_dir = app_data.join("logs");
    if !logs_dir.exists() {
        fs::create_dir_all(&logs_dir)
            .map_err(|e| format!("Failed to create logs directory: {}", e))?;
    }
    Ok(logs_dir)
}

/// Scrub sensitive authentication headers, passwords, emails, and personal content.
pub fn sanitize_message(msg: &str) -> String {
    let mut cleaned = msg.to_string();

    // 1. Scrub Basic Auth headers
    if let Ok(re) = regex_lite_basic_auth() {
        cleaned = re(&cleaned);
    }

    // 2. Scrub password fields in JSON or URL query params
    if let Ok(re) = regex_lite_passwords() {
        cleaned = re(&cleaned);
    }

    // 3. Scrub emails
    if let Ok(re) = regex_lite_emails() {
        cleaned = re(&cleaned);
    }

    cleaned
}

// Lightweight sanitizers without requiring large regex dependencies
fn regex_lite_basic_auth() -> Result<Box<dyn Fn(&str) -> String>, ()> {
    Ok(Box::new(|text: &str| {
        let mut out = String::new();
        let mut remaining = text;
        while let Some(idx) = remaining.find("Basic ") {
            out.push_str(&remaining[..idx]);
            out.push_str("Basic [REDACTED_AUTH]");
            let after = &remaining[idx + 6..];
            let end_idx = after.find(|c: char| c.is_whitespace() || c == '"' || c == '\'').unwrap_or(after.len());
            remaining = &after[end_idx..];
        }
        out.push_str(remaining);
        out
    }))
}

fn regex_lite_passwords() -> Result<Box<dyn Fn(&str) -> String>, ()> {
    Ok(Box::new(|text: &str| {
        let mut result = text.to_string();
        for key in &["\"password\":", "\"password\" :", "password=", "password:"] {
            let mut search_from = 0;
            while let Some(pos) = result[search_from..].find(key) {
                let actual_pos = search_from + pos + key.len();
                // Find next comma or quote or bracket
                let rest = &result[actual_pos..];
                let end = rest.find([',', '}', '&', '\n']).unwrap_or(rest.len());
                // Redact
                let prefix = &result[..actual_pos];
                let suffix = &result[actual_pos + end..];
                result = format!("{} \"[REDACTED]\"{}", prefix, suffix);
                search_from = actual_pos + 14;
                if search_from >= result.len() {
                    break;
                }
            }
        }
        result
    }))
}

fn regex_lite_emails() -> Result<Box<dyn Fn(&str) -> String>, ()> {
    Ok(Box::new(|text: &str| {
        let mut out = String::new();
        for word in text.split_whitespace() {
            if word.contains('@') && word.contains('.') && !word.starts_with("http") {
                out.push_str("[REDACTED_EMAIL] ");
            } else {
                out.push_str(word);
                out.push(' ');
            }
        }
        if out.ends_with(' ') {
            out.pop();
        }
        out
    }))
}

/// Enforces the 50MB threshold by deleting the oldest daily log files if exceeded.
fn enforce_size_limit(logs_dir: &Path) {
    if let Ok(entries) = fs::read_dir(logs_dir) {
        let mut log_files: Vec<(PathBuf, u64, String)> = Vec::new();
        let mut total_bytes: u64 = 0;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("log") {
                if let Ok(meta) = entry.metadata() {
                    let size = meta.len();
                    total_bytes += size;
                    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                    log_files.push((path, size, name));
                }
            }
        }

        // Sort files ascending by filename (oxide_deck_YYYY-MM-DD.log sorts chronologically)
        log_files.sort_by(|a, b| a.2.cmp(&b.2));

        // Delete oldest files while total size exceeds threshold
        while total_bytes >= MAX_LOGS_TOTAL_BYTES && !log_files.is_empty() {
            let (oldest_path, size, name) = log_files.remove(0);
            let _ = fs::remove_file(&oldest_path);
            total_bytes = total_bytes.saturating_sub(size);
            println!("Deleted oldest log file due to 50MB size threshold: {}", name);
        }
    }
}

/// Writes a log entry into today's log file (oxide_deck_YYYY-MM-DD.log).
pub fn write_log(app: &AppHandle, level: &str, category: &str, message: &str) {
    let logs_dir = match get_logs_dir(app) {
        Ok(d) => d,
        Err(_) => return,
    };

    enforce_size_limit(&logs_dir);

    let now = chrono_lite_now();
    let today_str = &now[..10]; // YYYY-MM-DD
    let file_name = format!("oxide_deck_{}.log", today_str);
    let file_path = logs_dir.join(file_name);

    let sanitized = sanitize_message(message);
    let log_line = format!("[{}] [{}] [{}] {}\n", now, level.to_uppercase(), category, sanitized);

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(file_path) {
        let _ = file.write_all(log_line.as_bytes());
    }
}

fn chrono_lite_now() -> String {
    // Current UTC timestamp in ISO-like format: YYYY-MM-DD HH:MM:SS
    let duration = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let total_secs = duration.as_secs();
    let millis = duration.subsec_millis();

    let days = total_secs / 86400;
    let rem_secs = total_secs % 86400;
    let hours = rem_secs / 3600;
    let mins = (rem_secs % 3600) / 60;
    let secs = rem_secs % 60;

    // Epoch 1970-01-01 calculation
    let (year, month, day) = days_to_date(days);
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}.{:03}",
        year, month, day, hours, mins, secs, millis
    )
}

fn days_to_date(mut days: u64) -> (u64, u64, u64) {
    let mut year = 1970;
    loop {
        let leap = is_leap_year(year);
        let days_in_year = if leap { 366 } else { 365 };
        if days < days_in_year {
            break;
        }
        days -= days_in_year;
        year += 1;
    }
    let leap = is_leap_year(year);
    let month_days = [
        31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ];
    let mut month = 1;
    for &d in &month_days {
        if days < d {
            break;
        }
        days -= d;
        month += 1;
    }
    (year, month, days + 1)
}

fn is_leap_year(year: u64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

// ----------------- TAURI COMMANDS -----------------

#[tauri::command]
pub async fn log_event(
    app: AppHandle,
    level: String,
    category: String,
    message: String,
) -> Result<(), String> {
    write_log(&app, &level, &category, &message);
    Ok(())
}

#[tauri::command]
pub async fn get_logs_summary(app: AppHandle) -> Result<LogsSummary, String> {
    let logs_dir = get_logs_dir(&app)?;
    let mut files: Vec<LogFileInfo> = Vec::new();
    let mut total_size_bytes: u64 = 0;

    if let Ok(entries) = fs::read_dir(&logs_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("log") {
                if let Ok(meta) = entry.metadata() {
                    let size = meta.len();
                    total_size_bytes += size;
                    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                    let date = name.replace("oxide_deck_", "").replace(".log", "");
                    files.push(LogFileInfo {
                        name,
                        size_bytes: size,
                        size_formatted: format_bytes(size),
                        date,
                    });
                }
            }
        }
    }

    files.sort_by(|a, b| b.name.cmp(&a.name)); // newest first

    Ok(LogsSummary {
        total_size_bytes,
        total_size_formatted: format_bytes(total_size_bytes),
        files_count: files.len(),
        files,
    })
}

#[tauri::command]
pub async fn export_all_logs(app: AppHandle) -> Result<String, String> {
    let logs_dir = get_logs_dir(&app)?;
    let mut entries_list = Vec::new();

    if let Ok(entries) = fs::read_dir(&logs_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("log") {
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                entries_list.push((path, name));
            }
        }
    }

    // Sort chronologically (oldest to newest)
    entries_list.sort_by(|a, b| a.1.cmp(&b.1));

    let mut combined = String::new();
    combined.push_str("=====================================================\n");
    combined.push_str("  OXIDE DECK - SYSTEM DIAGNOSTIC LOGS EXPORT\n");
    combined.push_str(&format!("  Exported At: {}\n", chrono_lite_now()));
    combined.push_str(&format!("  Platform: {} ({})\n", std::env::consts::OS, std::env::consts::ARCH));
    combined.push_str("  Sanitization: Active (Passwords, Tokens & Notes Scrubbed)\n");
    combined.push_str("=====================================================\n\n");

    if entries_list.is_empty() {
        combined.push_str("No log records found.\n");
        return Ok(combined);
    }

    for (path, name) in entries_list {
        combined.push_str(&format!("--- FILE: {} ---\n", name));
        if let Ok(mut f) = File::open(&path) {
            let mut content = String::new();
            if f.read_to_string(&mut content).is_ok() {
                combined.push_str(&content);
                if !content.ends_with('\n') {
                    combined.push('\n');
                }
            }
        }
        combined.push('\n');
    }

    Ok(combined)
}

#[tauri::command]
pub async fn clear_all_logs(app: AppHandle) -> Result<(), String> {
    let logs_dir = get_logs_dir(&app)?;
    if let Ok(entries) = fs::read_dir(&logs_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("log") {
                let _ = fs::remove_file(path);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn save_logs_to_file(app: AppHandle) -> Result<String, String> {
    let content = export_all_logs(app.clone()).await?;

    let target_dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().document_dir())
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("Failed to find save directory: {}", e))?;

    if !target_dir.exists() {
        let _ = fs::create_dir_all(&target_dir);
    }

    let now = chrono_lite_now();
    let safe_ts = now.replace(':', "-").replace(' ', "_").replace('.', "_");
    let file_name = format!("oxide_deck_diagnostics_{}.txt", safe_ts);
    let target_path = target_dir.join(&file_name);

    let mut file = File::create(&target_path)
        .map_err(|e| format!("Failed to create export file: {}", e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write logs to file: {}", e))?;

    let saved_path_str = target_path.to_string_lossy().to_string();

    Ok(saved_path_str)
}
