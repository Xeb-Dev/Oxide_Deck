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
            update_widget_data
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

