use sqlx::SqlitePool;
use crate::sync::models::{
    Deck, Flashcard, Folder, RevisionHistory, Subject, SyncPackage, Test, TestAnalysis, TestError,
    TestQuestion, Tombstone,
};

pub async fn export_local_package(
    pool: &SqlitePool,
    client_id: &str,
    device_name: &str,
) -> Result<SyncPackage, sqlx::Error> {
    let subjects = sqlx::query_as::<_, Subject>(
        "SELECT id, name, icon, color, created_at, updated_at FROM subjects ORDER BY created_at ASC",
    )
    .fetch_all(pool)
    .await?;

    let folders = sqlx::query_as::<_, Folder>(
        "SELECT id, name, icon, color, subject_id, parent_folder_id, created_at, updated_at FROM folders ORDER BY created_at ASC",
    )
    .fetch_all(pool)
    .await?;

    let decks = sqlx::query_as::<_, Deck>(
        "SELECT id, folder_id, name, icon, description, created_at, updated_at FROM decks ORDER BY created_at ASC",
    )
    .fetch_all(pool)
    .await?;

    let flashcards = sqlx::query_as::<_, Flashcard>(
        r#"
        SELECT id, deck_id, front, back, tags, ease, interval_days, repetitions, next_review, created_at,
               stability, difficulty, state, reps, lapses, elapsed_days, scheduled_days, last_review,
               image_url, front_image_url, back_image_url, updated_at
        FROM flashcards ORDER BY created_at ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let revision_history = sqlx::query_as::<_, RevisionHistory>(
        "SELECT id, flashcard_id, type, score, reviewed_at, rating FROM revision_history ORDER BY reviewed_at ASC",
    )
    .fetch_all(pool)
    .await?;

    let tests = sqlx::query_as::<_, Test>(
        r#"
        SELECT id, subject_id, name, description, source_type, source_data, score, max_score,
               test_date, time_limit_minutes, created_at, updated_at
        FROM tests ORDER BY created_at ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let test_questions = sqlx::query_as::<_, TestQuestion>(
        r#"
        SELECT id, test_id, type, question, options, correct_answer, user_answer, score,
               math_work, source_page, created_at
        FROM test_questions ORDER BY created_at ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let test_analyses = sqlx::query_as::<_, TestAnalysis>(
        r#"
        SELECT id, test_id, subject_id, summary, strengths, weaknesses, recommendations, created_at
        FROM test_analyses ORDER BY created_at ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let test_errors = sqlx::query_as::<_, TestError>(
        r#"
        SELECT id, test_id, subject_id, question_id, question_text, user_answer, correct_answer,
               error_reason, score, created_at
        FROM test_errors ORDER BY created_at ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let tombstones = sqlx::query_as::<_, Tombstone>(
        "SELECT entity_id, entity_type, deleted_at FROM sync_tombstones ORDER BY deleted_at ASC",
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let fsrs_row = sqlx::query_scalar::<_, String>(
        "SELECT params FROM fsrs_parameters WHERE id = 1",
    )
    .fetch_optional(pool)
    .await?;

    Ok(SyncPackage {
        version: "1.0".to_string(),
        exported_at: crate::sync::merger::chrono_now_iso(),
        client_id: client_id.to_string(),
        device_name: device_name.to_string(),
        schema_version: 14,
        subjects,
        folders,
        decks,
        flashcards,
        revision_history,
        tests,
        test_questions,
        test_analyses,
        test_errors,
        fsrs_parameters: fsrs_row,
        notification_settings: None,
        tombstones,
    })
}

/// Applies a merged sync package into the local SQLite database within a single atomic transaction.
pub async fn apply_sync_package_to_db(
    pool: &SqlitePool,
    pkg: &SyncPackage,
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;

    // 0. Remove entities marked as deleted in tombstones
    for t in &pkg.tombstones {
        match t.entity_type.as_str() {
            "flashcard" => {
                let _ = sqlx::query("DELETE FROM flashcards WHERE id = ?")
                    .bind(&t.entity_id)
                    .execute(&mut *tx)
                    .await;
            }
            "deck" => {
                let _ = sqlx::query("DELETE FROM decks WHERE id = ?")
                    .bind(&t.entity_id)
                    .execute(&mut *tx)
                    .await;
            }
            "folder" => {
                let _ = sqlx::query("DELETE FROM folders WHERE id = ?")
                    .bind(&t.entity_id)
                    .execute(&mut *tx)
                    .await;
            }
            "subject" => {
                let _ = sqlx::query("DELETE FROM subjects WHERE id = ?")
                    .bind(&t.entity_id)
                    .execute(&mut *tx)
                    .await;
            }
            "test" => {
                let _ = sqlx::query("DELETE FROM tests WHERE id = ?")
                    .bind(&t.entity_id)
                    .execute(&mut *tx)
                    .await;
            }
            _ => {}
        }
    }

    // 1. Subjects
    for s in &pkg.subjects {
        sqlx::query(
            r#"
            INSERT INTO subjects (id, name, icon, color, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                icon = excluded.icon,
                color = excluded.color,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(&s.id)
        .bind(&s.name)
        .bind(&s.icon)
        .bind(&s.color)
        .bind(&s.created_at)
        .bind(&s.updated_at)
        .execute(&mut *tx)
        .await?;
    }

    // 2. Folders (Pass 1: parent = NULL)
    for f in &pkg.folders {
        sqlx::query(
            r#"
            INSERT INTO folders (id, name, icon, color, subject_id, parent_folder_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                icon = excluded.icon,
                color = excluded.color,
                subject_id = excluded.subject_id,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(&f.id)
        .bind(&f.name)
        .bind(&f.icon)
        .bind(&f.color)
        .bind(&f.subject_id)
        .bind(&f.created_at)
        .bind(&f.updated_at)
        .execute(&mut *tx)
        .await?;
    }

    // Folders (Pass 2: attach parent_folder_id)
    for f in &pkg.folders {
        if f.parent_folder_id.is_some() {
            sqlx::query("UPDATE folders SET parent_folder_id = ? WHERE id = ?")
                .bind(&f.parent_folder_id)
                .bind(&f.id)
                .execute(&mut *tx)
                .await?;
        }
    }

    // 3. Decks
    for d in &pkg.decks {
        sqlx::query(
            r#"
            INSERT INTO decks (id, folder_id, name, icon, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                folder_id = excluded.folder_id,
                name = excluded.name,
                icon = excluded.icon,
                description = excluded.description,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(&d.id)
        .bind(&d.folder_id)
        .bind(&d.name)
        .bind(&d.icon)
        .bind(&d.description)
        .bind(&d.created_at)
        .bind(&d.updated_at)
        .execute(&mut *tx)
        .await?;
    }

    // 4. Flashcards (Chunked batched writes)
    for c in &pkg.flashcards {
        sqlx::query(
            r#"
            INSERT INTO flashcards (
                id, deck_id, front, back, tags, ease, interval_days, repetitions, next_review, created_at,
                stability, difficulty, state, reps, lapses, elapsed_days, scheduled_days, last_review,
                image_url, front_image_url, back_image_url, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                deck_id = excluded.deck_id,
                front = excluded.front,
                back = excluded.back,
                tags = excluded.tags,
                ease = excluded.ease,
                interval_days = excluded.interval_days,
                repetitions = excluded.repetitions,
                next_review = excluded.next_review,
                stability = excluded.stability,
                difficulty = excluded.difficulty,
                state = excluded.state,
                reps = excluded.reps,
                lapses = excluded.lapses,
                elapsed_days = excluded.elapsed_days,
                scheduled_days = excluded.scheduled_days,
                last_review = excluded.last_review,
                image_url = excluded.image_url,
                front_image_url = excluded.front_image_url,
                back_image_url = excluded.back_image_url,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(&c.id)
        .bind(&c.deck_id)
        .bind(&c.front)
        .bind(&c.back)
        .bind(&c.tags)
        .bind(c.ease.unwrap_or(2.5))
        .bind(c.interval_days.unwrap_or(0))
        .bind(c.repetitions.unwrap_or(0))
        .bind(&c.next_review)
        .bind(&c.created_at)
        .bind(c.stability.unwrap_or(0.0))
        .bind(c.difficulty.unwrap_or(0.0))
        .bind(c.state.unwrap_or(0))
        .bind(c.reps.unwrap_or(0))
        .bind(c.lapses.unwrap_or(0))
        .bind(c.elapsed_days.unwrap_or(0))
        .bind(c.scheduled_days.unwrap_or(0))
        .bind(&c.last_review)
        .bind(&c.image_url)
        .bind(&c.front_image_url)
        .bind(&c.back_image_url)
        .bind(&c.updated_at)
        .execute(&mut *tx)
        .await?;
    }

    // 5. Revision History (Immutable, INSERT OR IGNORE)
    for h in &pkg.revision_history {
        sqlx::query(
            r#"
            INSERT OR IGNORE INTO revision_history (id, flashcard_id, type, score, reviewed_at, rating)
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&h.id)
        .bind(&h.flashcard_id)
        .bind(&h.revision_type)
        .bind(h.score)
        .bind(&h.reviewed_at)
        .bind(h.rating)
        .execute(&mut *tx)
        .await?;
    }

    // 6. Tests & Questions
    for t in &pkg.tests {
        sqlx::query(
            r#"
            INSERT INTO tests (id, subject_id, name, description, source_type, source_data, score, max_score, test_date, time_limit_minutes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                subject_id = excluded.subject_id,
                name = excluded.name,
                description = excluded.description,
                source_type = excluded.source_type,
                source_data = excluded.source_data,
                score = excluded.score,
                max_score = excluded.max_score,
                test_date = excluded.test_date,
                time_limit_minutes = excluded.time_limit_minutes,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(&t.id)
        .bind(&t.subject_id)
        .bind(&t.name)
        .bind(&t.description)
        .bind(&t.source_type)
        .bind(&t.source_data)
        .bind(t.score)
        .bind(t.max_score)
        .bind(&t.test_date)
        .bind(t.time_limit_minutes)
        .bind(&t.created_at)
        .bind(&t.updated_at)
        .execute(&mut *tx)
        .await?;
    }

    for q in &pkg.test_questions {
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO test_questions (id, test_id, type, question, options, correct_answer, user_answer, score, math_work, source_page, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&q.id)
        .bind(&q.test_id)
        .bind(&q.question_type)
        .bind(&q.question)
        .bind(&q.options)
        .bind(&q.correct_answer)
        .bind(&q.user_answer)
        .bind(q.score)
        .bind(&q.math_work)
        .bind(q.source_page)
        .bind(&q.created_at)
        .execute(&mut *tx)
        .await?;
    }

    for a in &pkg.test_analyses {
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO test_analyses (id, test_id, subject_id, summary, strengths, weaknesses, recommendations, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&a.id)
        .bind(&a.test_id)
        .bind(&a.subject_id)
        .bind(&a.summary)
        .bind(&a.strengths)
        .bind(&a.weaknesses)
        .bind(&a.recommendations)
        .bind(&a.created_at)
        .execute(&mut *tx)
        .await?;
    }

    for e in &pkg.test_errors {
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO test_errors (id, test_id, subject_id, question_id, question_text, user_answer, correct_answer, error_reason, score, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&e.id)
        .bind(&e.test_id)
        .bind(&e.subject_id)
        .bind(&e.question_id)
        .bind(&e.question_text)
        .bind(&e.user_answer)
        .bind(&e.correct_answer)
        .bind(&e.error_reason)
        .bind(e.score)
        .bind(&e.created_at)
        .execute(&mut *tx)
        .await?;
    }

    // 7. FSRS parameters
    if let Some(ref params) = pkg.fsrs_parameters {
        sqlx::query(
            "INSERT OR REPLACE INTO fsrs_parameters (id, params, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)",
        )
        .bind(params)
        .execute(&mut *tx)
        .await?;
    }

    // 8. Tombstones
    for t in &pkg.tombstones {
        sqlx::query(
            "INSERT OR IGNORE INTO sync_tombstones (entity_id, entity_type, deleted_at) VALUES (?, ?, ?)",
        )
        .bind(&t.entity_id)
        .bind(&t.entity_type)
        .bind(&t.deleted_at)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}
