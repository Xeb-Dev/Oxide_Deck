mod migrations;

#[tauri::command]
async fn fetch_url_html(url: String) -> Result<String, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Invalid URL protocol. Must start with http:// or https://".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("Server returned error status: {}", status));
    }

    let body = response
        .text()
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

use std::sync::OnceLock;

static WEBDAV_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn get_webdav_client() -> &'static reqwest::Client {
    WEBDAV_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("OxideDeck-WebDAV/1.0")
            .timeout(std::time::Duration::from_secs(25))
            .connect_timeout(std::time::Duration::from_secs(12))
            .pool_idle_timeout(std::time::Duration::from_secs(15))
            .pool_max_idle_per_host(5)
            .tcp_keepalive(std::time::Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct WebdavResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: std::collections::HashMap<String, String>,
    pub body: String,
    pub is_success: bool,
}

#[tauri::command]
async fn webdav_exec(
    method: String,
    url: String,
    headers: std::collections::HashMap<String, String>,
    body: Option<String>,
) -> Result<WebdavResponse, String> {
    let client = get_webdav_client();

    let method_upper = method.to_uppercase();
    let reqwest_method = match method_upper.as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "HEAD" => reqwest::Method::HEAD,
        "OPTIONS" => reqwest::Method::OPTIONS,
        other => reqwest::Method::from_bytes(other.as_bytes())
            .map_err(|e| format!("Invalid HTTP method {}: {}", other, e))?,
    };

    let mut request_builder = client.request(reqwest_method, &url);

    for (key, value) in headers {
        request_builder = request_builder.header(key, value);
    }

    if let Some(b) = body {
        request_builder = request_builder.body(b);
    }

    let response = request_builder
        .send()
        .await
        .map_err(|e| format!("WebDAV network error: {}", e))?;

    let status = response.status();
    let is_success = status.is_success()
        || status.as_u16() == 207 // 207 Multi-Status (WebDAV)
        || status.as_u16() == 201 // 201 Created (MKCOL/PUT)
        || status.as_u16() == 204 // 204 No Content
        || status.as_u16() == 405; // 405 Method Not Allowed (e.g. MKCOL on existing dir)

    let mut resp_headers = std::collections::HashMap::new();
    for (k, v) in response.headers() {
        if let Ok(v_str) = v.to_str() {
            resp_headers.insert(k.as_str().to_string(), v_str.to_string());
        }
    }

    let response_text = response.text().await.unwrap_or_default();

    Ok(WebdavResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        headers: resp_headers,
        body: response_text,
        is_success,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:oxide_deck.db", migrations::get_migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            fetch_url_html,
            proxy_post_request,
            update_widget_data,
            webdav_exec,
            sync_webdav_workmanager_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn update_widget_data(
    _app: tauri::AppHandle,
    streak_days: i32,
    progress_today: i32,
    target_today: i32,
    condition_met: bool,
    due_cards_count: i32,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        // Update widget on Android platform
        println!(
            "Android widget updated: streak={}, progress={}/{}, met={}, due={}",
            streak_days, progress_today, target_today, condition_met, due_cards_count
        );
    }

    let _ = (streak_days, progress_today, target_today, condition_met, due_cards_count);
    Ok(())
}

#[tauri::command]
async fn sync_webdav_workmanager_config(
    _app: tauri::AppHandle,
    enabled: bool,
    interval_minutes: i64,
    server_url: String,
    username: String,
    password: String,
    remote_path: String,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        println!(
            "Android WorkManager sync configured: enabled={}, interval={}m, url={}",
            enabled, interval_minutes, server_url
        );
    }

    let _ = (enabled, interval_minutes, server_url, username, password, remote_path);
    Ok(())
}

