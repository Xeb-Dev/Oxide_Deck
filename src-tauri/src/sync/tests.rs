use std::time::Instant;
use crate::sync::models::*;
use crate::sync::merger::merge_sync_packages;

/// Helper function to create an empty dummy SyncPackage for testing
fn create_test_package(client_id: &str, device_name: &str) -> SyncPackage {
    SyncPackage {
        version: "1.0".to_string(),
        app_version: Some("1.4.1".to_string()),
        exported_at: "2026-09-06T12:00:00Z".to_string(),
        client_id: client_id.to_string(),
        device_name: device_name.to_string(),
        schema_version: 16,
        min_compatible_app_version: Some("0.1.0".to_string()),
        subjects: vec![],
        folders: vec![],
        decks: vec![],
        flashcards: vec![],
        revision_history: vec![],
        tests: vec![],
        test_questions: vec![],
        test_analyses: vec![],
        test_errors: vec![],
        fsrs_parameters: None,
        fsrs_updated_at: None,
        notification_settings: None,
        tombstones: vec![],
    }
}

/// Helper function to create a test flashcard
fn create_test_flashcard(id: &str, deck_id: &str, front: &str, back: &str) -> Flashcard {
    Flashcard {
        id: id.to_string(),
        deck_id: deck_id.to_string(),
        front: front.to_string(),
        back: back.to_string(),
        tags: Some("test_tag".to_string()),
        ease: Some(2.5),
        interval_days: Some(1),
        repetitions: Some(1),
        next_review: "2026-09-07T12:00:00Z".to_string(),
        created_at: "2026-09-06T12:00:00Z".to_string(),
        stability: Some(2.0),
        difficulty: Some(5.0),
        state: Some(1),
        reps: Some(1),
        lapses: Some(0),
        elapsed_days: Some(1),
        scheduled_days: Some(1),
        last_review: Some("2026-09-06T12:00:00Z".to_string()),
        image_url: None,
        front_image_url: None,
        back_image_url: None,
        updated_at: Some("2026-09-06T12:00:00Z".to_string()),
    }
}

// ============================================================================
// TEST 1: Addition and Deletion of current entities (Subjects, Folders, Decks, Tests, Flashcards)
// ============================================================================
#[test]
fn test_addition_and_deletion_of_all_entity_types() {
    let mut device_a = create_test_package("device_a", "Phone");
    let mut device_b = create_test_package("device_b", "Desktop");

    // 1. Device A adds a Subject, Folder, Deck, Test, TestQuestion, TestAnalysis, TestError, and Flashcard
    device_a.subjects.push(Subject {
        id: "sub_1".to_string(),
        name: "Neuroscience".to_string(),
        icon: Some("🧠".to_string()),
        color: Some("#6366f1".to_string()),
        created_at: "2026-09-06T10:00:00Z".to_string(),
        updated_at: Some("2026-09-06T10:00:00Z".to_string()),
    });

    device_a.folders.push(Folder {
        id: "folder_1".to_string(),
        name: "Brain Anatomy".to_string(),
        icon: Some("📁".to_string()),
        color: None,
        subject_id: Some("sub_1".to_string()),
        parent_folder_id: None,
        created_at: "2026-09-06T10:01:00Z".to_string(),
        updated_at: Some("2026-09-06T10:01:00Z".to_string()),
    });

    device_a.decks.push(Deck {
        id: "deck_1".to_string(),
        folder_id: Some("folder_1".to_string()),
        name: "Cortex Layers".to_string(),
        icon: Some("🗂️".to_string()),
        description: Some("Deck description".to_string()),
        created_at: "2026-09-06T10:02:00Z".to_string(),
        updated_at: Some("2026-09-06T10:02:00Z".to_string()),
    });

    device_a.flashcards.push(create_test_flashcard("card_1", "deck_1", "What is Layer 4?", "Internal granular layer"));

    device_a.tests.push(Test {
        id: "test_1".to_string(),
        subject_id: "sub_1".to_string(),
        name: "Midterm Exam".to_string(),
        description: Some("Exam description".to_string()),
        source_type: "manual".to_string(),
        source_data: None,
        score: Some(92.0),
        max_score: 100.0,
        test_date: Some("2026-09-06T11:00:00Z".to_string()),
        time_limit_minutes: Some(45),
        created_at: "2026-09-06T10:03:00Z".to_string(),
        updated_at: Some("2026-09-06T10:03:00Z".to_string()),
    });

    device_a.test_questions.push(TestQuestion {
        id: "q_1".to_string(),
        test_id: "test_1".to_string(),
        question_type: "mcq".to_string(),
        question: "Primary output layer?".to_string(),
        options: Some("[\"Layer 1\",\"Layer 5\"]".to_string()),
        correct_answer: Some("Layer 5".to_string()),
        user_answer: Some("Layer 5".to_string()),
        score: Some(1.0),
        math_work: None,
        source_page: None,
        created_at: "2026-09-06T10:04:00Z".to_string(),
        updated_at: Some("2026-09-06T10:04:00Z".to_string()),
    });

    // Step 1: Initial sync (Device A uploads, Device B downloads)
    let snapshot_v1 = merge_sync_packages(device_b.clone(), device_a.clone());
    assert_eq!(snapshot_v1.subjects.len(), 1);
    assert_eq!(snapshot_v1.folders.len(), 1);
    assert_eq!(snapshot_v1.decks.len(), 1);
    assert_eq!(snapshot_v1.flashcards.len(), 1);
    assert_eq!(snapshot_v1.tests.len(), 1);
    assert_eq!(snapshot_v1.test_questions.len(), 1);

    // Step 2: Device B now has all data from snapshot_v1
    device_b = snapshot_v1.clone();

    // Step 3: Device A deletes Test 1 and Flashcard 1, creating tombstones
    device_a.tests.clear();
    device_a.flashcards.clear();
    device_a.tombstones.push(Tombstone {
        entity_id: "test_1".to_string(),
        entity_type: "test".to_string(),
        deleted_at: "2026-09-06T13:00:00Z".to_string(),
    });
    device_a.tombstones.push(Tombstone {
        entity_id: "card_1".to_string(),
        entity_type: "flashcard".to_string(),
        deleted_at: "2026-09-06T13:00:00Z".to_string(),
    });

    // Step 4: Sync Device A's deletions with Device B
    let snapshot_v2 = merge_sync_packages(device_a, device_b);

    // Assert that the deleted test and flashcard are completely gone and NOT resurrected
    assert_eq!(snapshot_v2.tests.len(), 0, "Deleted test must not resurrect from device B");
    assert_eq!(snapshot_v2.flashcards.len(), 0, "Deleted card must not resurrect from device B");
    assert_eq!(snapshot_v2.tombstones.len(), 2, "Tombstones must be preserved across sync");

    // The bug: child questions of deleted tests are NOT pruned by the current merger!
    assert_eq!(snapshot_v2.test_questions.len(), 0, "Child questions of deleted test must be pruned!");

    // Existing non-deleted items should still remain intact
    assert_eq!(snapshot_v2.subjects.len(), 1);
    assert_eq!(snapshot_v2.folders.len(), 1);
    assert_eq!(snapshot_v2.decks.len(), 1);
}

// ============================================================================
// TEST 2: Syncing Flashcards (FSRS State vs Content Updates Conflict Resolution)
// ============================================================================
#[test]
fn test_sync_flashcard_fsrs_and_content_conflict_resolution() {
    let mut device_a = create_test_package("device_a", "Phone");
    let mut device_b = create_test_package("device_b", "Desktop");

    // Base card
    let base_card = create_test_flashcard("card_42", "deck_1", "Original Question", "Original Answer");

    // Device A reviews the card on the phone (advances FSRS: reps, stability, interval)
    let mut card_a = base_card.clone();
    card_a.reps = Some(5);
    card_a.interval_days = Some(14);
    card_a.stability = Some(12.5);
    card_a.last_review = Some("2026-09-06T15:00:00Z".to_string());
    card_a.next_review = "2026-09-20T15:00:00Z".to_string();
    card_a.updated_at = Some("2026-09-06T15:00:00Z".to_string());
    device_a.flashcards.push(card_a);

    // Device B edits the card text on desktop (newer content edit)
    let mut card_b = base_card.clone();
    card_b.front = "Updated Clearer Question".to_string();
    card_b.back = "Updated Detailed Answer".to_string();
    card_b.tags = Some("neuro,high-yield".to_string());
    card_b.updated_at = Some("2026-09-06T16:00:00Z".to_string()); // 1 hour newer edit
    device_b.flashcards.push(card_b);

    // Merge Device A and Device B
    let merged = merge_sync_packages(device_a, device_b);
    assert_eq!(merged.flashcards.len(), 1);

    let result_card = &merged.flashcards[0];

    // Verification:
    // 1. The card should have Device B's newer content
    assert_eq!(result_card.front, "Updated Clearer Question");
    assert_eq!(result_card.back, "Updated Detailed Answer");
    assert_eq!(result_card.tags.as_deref(), Some("neuro,high-yield"));

    // 2. The card MUST preserve Device A's higher FSRS review state (reps = 5, interval = 14, stability = 12.5)
    assert_eq!(result_card.reps, Some(5), "FSRS review progress must not be overwritten by text edit");
    assert_eq!(result_card.interval_days, Some(14));
    assert_eq!(result_card.stability, Some(12.5));
    assert_eq!(result_card.last_review.as_deref(), Some("2026-09-06T15:00:00Z"));
}

// ============================================================================
// TEST 3: Handling Future Versions with New Database Object Types
// ============================================================================
#[test]
fn test_future_version_handling_and_schema_compatibility() {
    // Simulate a future version payload from Oxide Deck v2.0 (Schema 99)
    // which contains an entirely new database object type ("voice_memos")
    let future_json = r#"{
        "version": "2.0",
        "app_version": "2.0.0",
        "schema_version": 99,
        "min_compatible_app_version": "1.5.0",
        "exported_at": "2027-01-01T00:00:00Z",
        "client_id": "future_device",
        "device_name": "Device 2027",
        "subjects": [],
        "folders": [],
        "decks": [],
        "flashcards": [],
        "revision_history": [],
        "tests": [],
        "test_questions": [],
        "test_analyses": [],
        "test_errors": [],
        "voice_memos": [
            {"id": "vm_1", "audio_file": "media://audio1.m4a", "transcript": "Lecture notes"}
        ],
        "tombstones": []
    }"#;

    // 1. Verify that standard JSON header inspection can detect the future schema
    let parsed_val: serde_json::Value = serde_json::from_str(future_json).expect("JSON must be valid");
    let remote_schema = parsed_val.get("schema_version").and_then(|v| v.as_i64()).unwrap_or(0);
    let remote_app_ver = parsed_val.get("app_version").and_then(|v| v.as_str()).unwrap_or("");
    let current_schema = 16;

    assert!(remote_schema > current_schema, "Remote schema (99) is newer than current (16)");
    assert_eq!(remote_app_ver, "2.0.0");

    // 2. Deserializing into current SyncPackage should not panic on unknown fields like "voice_memos"
    let package_res: Result<SyncPackage, _> = serde_json::from_str(future_json);
    assert!(package_res.is_ok(), "SyncPackage should ignore unknown future fields gracefully");

    let package = package_res.unwrap();
    assert_eq!(package.schema_version, 99);
}

// ============================================================================
// TEST 4: Syncing a Device with Different Flashcards Already on It (Disjoint Sets)
// ============================================================================
#[test]
fn test_sync_two_devices_with_completely_different_cards() {
    let mut device_a = create_test_package("device_a", "Mark Phone");
    let mut device_b = create_test_package("device_b", "Mark Laptop");

    // Device A created 3 Biology cards
    device_a.decks.push(Deck {
        id: "deck_bio".to_string(),
        folder_id: None,
        name: "Biology".to_string(),
        icon: None,
        description: None,
        created_at: "2026-09-06T10:00:00Z".to_string(),
        updated_at: Some("2026-09-06T10:00:00Z".to_string()),
    });
    device_a.flashcards.push(create_test_flashcard("bio_1", "deck_bio", "Mitochondria", "Powerhouse"));
    device_a.flashcards.push(create_test_flashcard("bio_2", "deck_bio", "Ribosome", "Protein synthesis"));
    device_a.flashcards.push(create_test_flashcard("bio_3", "deck_bio", "Nucleus", "Genetic material"));

    // Device B created 3 Physics cards completely independently
    device_b.decks.push(Deck {
        id: "deck_phys".to_string(),
        folder_id: None,
        name: "Physics".to_string(),
        icon: None,
        description: None,
        created_at: "2026-09-06T11:00:00Z".to_string(),
        updated_at: Some("2026-09-06T11:00:00Z".to_string()),
    });
    device_b.flashcards.push(create_test_flashcard("phys_1", "deck_phys", "Newton 1st Law", "Inertia"));
    device_b.flashcards.push(create_test_flashcard("phys_2", "deck_phys", "Newton 2nd Law", "F = ma"));
    device_b.flashcards.push(create_test_flashcard("phys_3", "deck_phys", "Newton 3rd Law", "Action = Reaction"));

    // Bidirectional merge
    let merged = merge_sync_packages(device_a, device_b);

    // Verification:
    // 1. Both decks must exist
    assert_eq!(merged.decks.len(), 2, "Both Biology and Physics decks must exist");

    // 2. All 6 cards must exist without missing any
    assert_eq!(merged.flashcards.len(), 6, "All 6 flashcards must be combined");

    let card_ids: std::collections::HashSet<String> = merged.flashcards.iter().map(|c| c.id.clone()).collect();
    assert!(card_ids.contains("bio_1"));
    assert!(card_ids.contains("bio_2"));
    assert!(card_ids.contains("bio_3"));
    assert!(card_ids.contains("phys_1"));
    assert!(card_ids.contains("phys_2"));
    assert!(card_ids.contains("phys_3"));
}

// ============================================================================
// TEST 5: Speed, Benchmark, and Deterministic Reliability Under Load
// ============================================================================
#[test]
fn test_sync_speed_and_reliability_stress_benchmark() {
    let mut device_a = create_test_package("device_a", "Stress A");
    let mut device_b = create_test_package("device_b", "Stress B");

    // Generate 100 decks and 1,000 flashcards across both devices
    for d in 0..50 {
        device_a.decks.push(Deck {
            id: format!("deck_a_{}", d),
            folder_id: None,
            name: format!("Deck A {}", d),
            icon: None,
            description: None,
            created_at: "2026-09-06T10:00:00Z".to_string(),
            updated_at: Some("2026-09-06T10:00:00Z".to_string()),
        });
        device_b.decks.push(Deck {
            id: format!("deck_b_{}", d),
            folder_id: None,
            name: format!("Deck B {}", d),
            icon: None,
            description: None,
            created_at: "2026-09-06T10:00:00Z".to_string(),
            updated_at: Some("2026-09-06T10:00:00Z".to_string()),
        });
    }

    // 1,000 flashcards on Device A
    for c in 0..1000 {
        let deck_id = format!("deck_a_{}", c % 50);
        device_a.flashcards.push(create_test_flashcard(
            &format!("card_{}", c),
            &deck_id,
            &format!("Front text for question {}", c),
            &format!("Back text for answer {}", c),
        ));
    }

    // 500 overlapping cards with reviews on Device B, plus 500 new cards
    for c in 0..500 {
        let deck_id = format!("deck_a_{}", c % 50);
        let mut card = create_test_flashcard(
            &format!("card_{}", c),
            &deck_id,
            &format!("Front text for question {}", c),
            &format!("Back text for answer {}", c),
        );
        card.reps = Some(10);
        card.last_review = Some("2026-09-06T18:00:00Z".to_string());
        device_b.flashcards.push(card);
    }
    for c in 1000..1500 {
        let deck_id = format!("deck_b_{}", c % 50);
        device_b.flashcards.push(create_test_flashcard(
            &format!("card_{}", c),
            &deck_id,
            &format!("Front text for question {}", c),
            &format!("Back text for answer {}", c),
        ));
    }

    // Benchmark merge speed
    let start_time = Instant::now();
    let merged = merge_sync_packages(device_a.clone(), device_b.clone());
    let elapsed = start_time.elapsed();

    // Merged total must be 1,500 unique cards and 100 decks
    assert_eq!(merged.flashcards.len(), 1500);
    assert_eq!(merged.decks.len(), 100);

    // Test JSON serialization speed on the merged package
    let json_start = Instant::now();
    let json_str = serde_json::to_string(&merged).expect("Serialization must succeed");
    let json_elapsed = json_start.elapsed();

    println!(
        "[PERFORMANCE] Merged 2,000 card candidates in {:?}, serialized to {:.2} KB JSON in {:?}",
        elapsed,
        (json_str.len() as f64) / 1024.0,
        json_elapsed
    );

    // Execution time must be fast (under 100ms on desktop)
    assert!(
        elapsed.as_millis() < 100,
        "Sync merge should take under 100ms, took {:?}",
        elapsed
    );

    // Deterministic check: merging (B, A) must produce the exact same count
    let reverse_merged = merge_sync_packages(device_b, device_a);
    assert_eq!(reverse_merged.flashcards.len(), 1500);
    assert_eq!(reverse_merged.decks.len(), 100);
}

// ============================================================================
// TEST 6: SQLite Foreign Key Cascades & Tombstone Deletion Application
// ============================================================================
#[tokio::test]
async fn test_sqlite_foreign_key_cascades_and_tombstone_application() {
    let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.expect("Memory DB connect");

    // 1. Enforce foreign keys
    sqlx::query("PRAGMA foreign_keys = ON;").execute(&pool).await.unwrap();

    // 2. Setup schema
    sqlx::query(
        r#"
        CREATE TABLE subjects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            icon TEXT,
            color TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            icon TEXT,
            color TEXT,
            subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
            parent_folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE decks (
            id TEXT PRIMARY KEY,
            folder_id TEXT,
            name TEXT NOT NULL,
            icon TEXT,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE SET NULL
        );
        CREATE TABLE flashcards (
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
            stability REAL DEFAULT 0,
            difficulty REAL DEFAULT 0,
            state INTEGER DEFAULT 0,
            reps INTEGER DEFAULT 0,
            lapses INTEGER DEFAULT 0,
            elapsed_days INTEGER DEFAULT 0,
            scheduled_days INTEGER DEFAULT 0,
            last_review DATETIME,
            image_url TEXT,
            front_image_url TEXT,
            back_image_url TEXT,
            updated_at DATETIME,
            FOREIGN KEY(deck_id) REFERENCES decks(id) ON DELETE CASCADE
        );
        CREATE TABLE revision_history (
            id TEXT PRIMARY KEY,
            flashcard_id TEXT,
            type TEXT NOT NULL,
            score REAL NOT NULL,
            reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            rating INTEGER
        );
        CREATE TABLE tests (
            id TEXT PRIMARY KEY,
            subject_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            source_type TEXT NOT NULL DEFAULT 'manual',
            source_data TEXT,
            score REAL,
            max_score REAL DEFAULT 100,
            test_date DATETIME,
            time_limit_minutes INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME,
            FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
        );
        CREATE TABLE test_questions (
            id TEXT PRIMARY KEY,
            test_id TEXT NOT NULL,
            type TEXT NOT NULL,
            question TEXT NOT NULL,
            options TEXT,
            correct_answer TEXT,
            user_answer TEXT,
            score REAL,
            math_work TEXT,
            source_page INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE
        );
        CREATE TABLE test_analyses (
            id TEXT PRIMARY KEY,
            test_id TEXT NOT NULL,
            subject_id TEXT NOT NULL,
            summary TEXT NOT NULL,
            strengths TEXT,
            weaknesses TEXT,
            recommendations TEXT,
            created_at DATETIME NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE,
            FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
        );
        CREATE TABLE test_errors (
            id TEXT PRIMARY KEY,
            test_id TEXT NOT NULL,
            subject_id TEXT NOT NULL,
            question_id TEXT,
            question_text TEXT NOT NULL,
            user_answer TEXT,
            correct_answer TEXT,
            error_reason TEXT NOT NULL,
            score REAL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE,
            FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
        );
        CREATE TABLE sync_tombstones (
            entity_id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE fsrs_parameters (
            id INTEGER PRIMARY KEY DEFAULT 1,
            params TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        "#
    ).execute(&pool).await.unwrap();

    // 3. Populate sample data
    sqlx::query("INSERT INTO subjects (id, name) VALUES ('sub_test', 'Math');").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO folders (id, name, subject_id) VALUES ('fold_test', 'Algebra', 'sub_test');").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO tests (id, subject_id, name) VALUES ('test_math', 'sub_test', 'Calculus Quiz');").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO test_questions (id, test_id, type, question) VALUES ('q_1', 'test_math', 'mcq', 'Derivative of x^2?');").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO test_analyses (id, test_id, subject_id, summary, created_at) VALUES ('a_1', 'test_math', 'sub_test', 'Great score', '2026-09-06T12:00:00Z');").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO test_errors (id, test_id, subject_id, question_text, error_reason, created_at) VALUES ('e_1', 'test_math', 'sub_test', 'Question 1', 'Calculation slip', '2026-09-06T12:00:00Z');").execute(&pool).await.unwrap();

    // 4. Verify cascade when Test is deleted directly:
    // With PRAGMA foreign_keys = ON, deleting a test MUST automatically remove test_questions, test_analyses, and test_errors!
    sqlx::query("DELETE FROM tests WHERE id = 'test_math';").execute(&pool).await.unwrap();

    let q_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM test_questions WHERE test_id = 'test_math';").fetch_one(&pool).await.unwrap();
    let a_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM test_analyses WHERE test_id = 'test_math';").fetch_one(&pool).await.unwrap();
    let e_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM test_errors WHERE test_id = 'test_math';").fetch_one(&pool).await.unwrap();

    assert_eq!(q_count, 0, "test_questions must be cascade-deleted");
    assert_eq!(a_count, 0, "test_analyses must be cascade-deleted");
    assert_eq!(e_count, 0, "test_errors must be cascade-deleted");

    // 5. Verify folder unassignment when Subject is deleted:
    // With ON DELETE SET NULL, folder.subject_id must become NULL
    sqlx::query("DELETE FROM subjects WHERE id = 'sub_test';").execute(&pool).await.unwrap();
    let folder_sub_id: Option<String> = sqlx::query_scalar("SELECT subject_id FROM folders WHERE id = 'fold_test';").fetch_one(&pool).await.unwrap();
    assert_eq!(folder_sub_id, None, "Folder subject_id must become NULL upon subject deletion");

    // 6. Test apply_sync_package_to_db with incoming tombstones
    // Insert a new deck and card
    sqlx::query("INSERT INTO decks (id, name) VALUES ('deck_to_del', 'Old Deck');").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO flashcards (id, deck_id, front, back, next_review, created_at) VALUES ('card_to_del', 'deck_to_del', 'F', 'B', '2026-09-06', '2026-09-06');").execute(&pool).await.unwrap();

    let mut pkg_with_tombstone = create_test_package("remote", "Remote Server");
    pkg_with_tombstone.tombstones.push(Tombstone {
        entity_id: "deck_to_del".to_string(),
        entity_type: "deck".to_string(),
        deleted_at: "2026-09-06T19:00:00Z".to_string(),
    });

    crate::sync::db::apply_sync_package_to_db(&pool, &pkg_with_tombstone).await.unwrap();

    let deck_exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM decks WHERE id = 'deck_to_del';").fetch_one(&pool).await.unwrap();
    let card_exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM flashcards WHERE id = 'card_to_del';").fetch_one(&pool).await.unwrap();

    assert_eq!(deck_exists, 0, "Deck must be deleted when remote tombstone is applied");
    assert_eq!(card_exists, 0, "Flashcard under deleted deck must also be cascade-deleted");
}

// ============================================================================
// TEST 7: Folder & Deck Parent Unassignment when Parent is Tombstoned
// ============================================================================
#[test]
fn test_folder_and_deck_parent_unassignment_on_parent_deletion() {
    let mut device_a = create_test_package("device_a", "Phone");
    let mut device_b = create_test_package("device_b", "Desktop");

    // Device A deletes folder_parent
    device_a.tombstones.push(Tombstone {
        entity_id: "folder_parent".to_string(),
        entity_type: "folder".to_string(),
        deleted_at: "2026-09-06T14:00:00Z".to_string(),
    });

    // Device B has child_folder pointing to folder_parent and deck_child pointing to folder_parent
    device_b.folders.push(Folder {
        id: "child_folder".to_string(),
        name: "Subtopics".to_string(),
        icon: None,
        color: None,
        subject_id: None,
        parent_folder_id: Some("folder_parent".to_string()),
        created_at: "2026-09-06T10:00:00Z".to_string(),
        updated_at: Some("2026-09-06T10:00:00Z".to_string()),
    });

    device_b.decks.push(Deck {
        id: "deck_child".to_string(),
        folder_id: Some("folder_parent".to_string()),
        name: "Child Deck".to_string(),
        icon: None,
        description: None,
        created_at: "2026-09-06T10:00:00Z".to_string(),
        updated_at: Some("2026-09-06T10:00:00Z".to_string()),
    });

    let merged = merge_sync_packages(device_a, device_b);

    // Assert that the parent folder is absent (tombstoned)
    assert!(merged.folders.iter().all(|f| f.id != "folder_parent"));

    // Assert that child_folder and deck_child had their parents unassigned to None instead of broken foreign keys
    let child = merged.folders.iter().find(|f| f.id == "child_folder").expect("Child folder must exist");
    assert_eq!(child.parent_folder_id, None, "Parent folder ID must be unassigned to None");

    let deck = merged.decks.iter().find(|d| d.id == "deck_child").expect("Deck must exist");
    assert_eq!(deck.folder_id, None, "Deck folder ID must be unassigned to None to avoid FK violation");
}

// ============================================================================
// TEST 8: Folder Parent Cycle Breaking (Loop Detection)
// ============================================================================
#[test]
fn test_folder_cycle_detection_and_breaking() {
    let mut pkg_a = create_test_package("a", "A");
    let mut pkg_b = create_test_package("b", "B");

    // Device A: Folder 1 -> Parent is Folder 2
    pkg_a.folders.push(Folder {
        id: "folder_1".to_string(),
        name: "Folder 1".to_string(),
        icon: None,
        color: None,
        subject_id: None,
        parent_folder_id: Some("folder_2".to_string()),
        created_at: "2026-09-06T10:00:00Z".to_string(),
        updated_at: Some("2026-09-06T12:00:00Z".to_string()),
    });

    // Device B: Folder 2 -> Parent is Folder 1 (creates a circular loop!)
    pkg_b.folders.push(Folder {
        id: "folder_2".to_string(),
        name: "Folder 2".to_string(),
        icon: None,
        color: None,
        subject_id: None,
        parent_folder_id: Some("folder_1".to_string()),
        created_at: "2026-09-06T10:00:00Z".to_string(),
        updated_at: Some("2026-09-06T12:00:00Z".to_string()),
    });

    let merged = merge_sync_packages(pkg_a, pkg_b);

    // One of the folders must have had its parent cycle broken to None
    let f1 = merged.folders.iter().find(|f| f.id == "folder_1").unwrap();
    let f2 = merged.folders.iter().find(|f| f.id == "folder_2").unwrap();

    let has_broken_cycle = f1.parent_folder_id.is_none() || f2.parent_folder_id.is_none();
    assert!(has_broken_cycle, "Folder loop cycle must be broken so folders don't disappear");
}

// ============================================================================
// TEST 9: Test Question Timestamp LWW & Answer Preservation Merge
// ============================================================================
#[test]
fn test_test_question_timestamp_and_answered_merge() {
    let mut device_a = create_test_package("device_a", "Phone");
    let mut device_b = create_test_package("device_b", "Desktop");

    device_a.tests.push(Test {
        id: "exam_1".to_string(),
        subject_id: "sub_1".to_string(),
        name: "Exam".to_string(),
        description: None,
        source_type: "manual".to_string(),
        source_data: None,
        score: None,
        max_score: 100.0,
        test_date: None,
        time_limit_minutes: None,
        created_at: "2026-09-06T10:00:00Z".to_string(),
        updated_at: Some("2026-09-06T10:00:00Z".to_string()),
    });
    device_b.tests = device_a.tests.clone();

    // Device A has unanswered question
    device_a.test_questions.push(TestQuestion {
        id: "q_exam_1".to_string(),
        test_id: "exam_1".to_string(),
        question_type: "mcq".to_string(),
        question: "Capital of France?".to_string(),
        options: Some("[\"Paris\",\"Berlin\"]".to_string()),
        correct_answer: Some("Paris".to_string()),
        user_answer: None,
        score: None,
        math_work: None,
        source_page: None,
        created_at: "2026-09-06T10:00:00Z".to_string(),
        updated_at: Some("2026-09-06T10:00:00Z".to_string()),
    });

    // Device B answered the question
    device_b.test_questions.push(TestQuestion {
        id: "q_exam_1".to_string(),
        test_id: "exam_1".to_string(),
        question_type: "mcq".to_string(),
        question: "Capital of France?".to_string(),
        options: Some("[\"Paris\",\"Berlin\"]".to_string()),
        correct_answer: Some("Paris".to_string()),
        user_answer: Some("Paris".to_string()),
        score: Some(1.0),
        math_work: None,
        source_page: None,
        created_at: "2026-09-06T10:00:00Z".to_string(),
        updated_at: Some("2026-09-06T11:30:00Z".to_string()),
    });

    let merged = merge_sync_packages(device_a, device_b);
    assert_eq!(merged.test_questions.len(), 1);
    let q = &merged.test_questions[0];
    assert_eq!(q.user_answer.as_deref(), Some("Paris"), "Answered question must be preserved");
    assert_eq!(q.score, Some(1.0));
}

// ============================================================================
// TEST 10: FSRS Parameters Timestamped Merge
// ============================================================================
#[test]
fn test_fsrs_parameter_timestamp_merge() {
    let mut device_a = create_test_package("device_a", "Phone");
    let mut device_b = create_test_package("device_b", "Desktop");

    device_a.fsrs_parameters = Some("{\"w\":[1,2,3]}".to_string());
    device_a.fsrs_updated_at = Some("2026-09-06T10:00:00Z".to_string());

    device_b.fsrs_parameters = Some("{\"w\":[4,5,6]}".to_string());
    device_b.fsrs_updated_at = Some("2026-09-06T12:00:00Z".to_string()); // Newer optimization

    let merged = merge_sync_packages(device_a, device_b);
    assert_eq!(merged.fsrs_parameters.as_deref(), Some("{\"w\":[4,5,6]}"));
    assert_eq!(merged.fsrs_updated_at.as_deref(), Some("2026-09-06T12:00:00Z"));
}

// ============================================================================
// TEST 11: 60-Day Tombstone TTL Purging
// ============================================================================
#[test]
fn test_tombstone_60_day_ttl_purging() {
    let mut device_a = create_test_package("device_a", "Phone");
    let device_b = create_test_package("device_b", "Desktop");

    // Expired tombstone (90 days ago)
    device_a.tombstones.push(Tombstone {
        entity_id: "ancient_card".to_string(),
        entity_type: "flashcard".to_string(),
        deleted_at: "2020-01-01T00:00:00Z".to_string(),
    });

    // Recent tombstone (1 day ago)
    device_a.tombstones.push(Tombstone {
        entity_id: "recent_card".to_string(),
        entity_type: "flashcard".to_string(),
        deleted_at: "2026-09-05T00:00:00Z".to_string(),
    });

    let merged = merge_sync_packages(device_a, device_b);

    // Ancient tombstone should be pruned, recent tombstone kept
    assert_eq!(merged.tombstones.len(), 1);
    assert_eq!(merged.tombstones[0].entity_id, "recent_card");
}


