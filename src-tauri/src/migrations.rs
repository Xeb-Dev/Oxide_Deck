use tauri_plugin_sql::{Migration, MigrationKind};

pub fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: "
                CREATE TABLE IF NOT EXISTS folders (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    icon TEXT,
                    color TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS decks (
                    id TEXT PRIMARY KEY,
                    folder_id TEXT,
                    name TEXT NOT NULL,
                    icon TEXT,
                    description TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE SET NULL
                );
                CREATE TABLE IF NOT EXISTS flashcards (
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
                    FOREIGN KEY(deck_id) REFERENCES decks(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS revision_history (
                    id TEXT PRIMARY KEY,
                    flashcard_id TEXT,
                    type TEXT NOT NULL,
                    score REAL NOT NULL,
                    reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_subjects_table",
            sql: "
                CREATE TABLE IF NOT EXISTS subjects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    icon TEXT,
                    color TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                ALTER TABLE folders ADD COLUMN subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_folder_parent_nesting",
            sql: "
                ALTER TABLE folders ADD COLUMN parent_folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "migrate_sm2_to_fsrs",
            sql: "
                ALTER TABLE flashcards ADD COLUMN stability REAL DEFAULT 0;
                ALTER TABLE flashcards ADD COLUMN difficulty REAL DEFAULT 0;
                ALTER TABLE flashcards ADD COLUMN state INTEGER DEFAULT 0;
                ALTER TABLE flashcards ADD COLUMN reps INTEGER DEFAULT 0;
                ALTER TABLE flashcards ADD COLUMN lapses INTEGER DEFAULT 0;
                ALTER TABLE flashcards ADD COLUMN elapsed_days INTEGER DEFAULT 0;
                ALTER TABLE flashcards ADD COLUMN scheduled_days INTEGER DEFAULT 0;
                ALTER TABLE flashcards ADD COLUMN last_review DATETIME;
                ALTER TABLE revision_history ADD COLUMN rating INTEGER;
                CREATE TABLE IF NOT EXISTS fsrs_parameters (
                    id INTEGER PRIMARY KEY DEFAULT 1,
                    params TEXT,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                INSERT OR IGNORE INTO fsrs_parameters (id, params) VALUES (
                    1,
                    '[0.4,0.6,2.4,5.8,4.93,0.94,0.86,0.01,1.49,0.14,0.94,2.18,0.05,0.34,1.26,0.29,2.61]'
                );
                UPDATE flashcards SET
                    state = 2,
                    stability = MAX(interval_days, 1),
                    difficulty = MIN(10, MAX(1, (2.5 - ease) * 10 + 5)),
                    reps = repetitions,
                    scheduled_days = interval_days,
                    last_review = datetime(next_review, '-' || interval_days || ' days')
                WHERE repetitions > 0;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "create_tests_tables",
            sql: "
                CREATE TABLE IF NOT EXISTS tests (
                    id TEXT PRIMARY KEY,
                    subject_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    source_type TEXT NOT NULL DEFAULT 'manual',
                    source_data TEXT,
                    score REAL,
                    max_score REAL DEFAULT 100,
                    test_date DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS test_questions (
                    id TEXT PRIMARY KEY,
                    test_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    question TEXT NOT NULL,
                    options TEXT,
                    correct_answer TEXT,
                    source_page INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_user_answer_to_test_questions",
            sql: "
                ALTER TABLE test_questions ADD COLUMN user_answer TEXT;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add_score_to_test_questions",
            sql: "
                ALTER TABLE test_questions ADD COLUMN score REAL;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add_math_work_to_test_questions",
            sql: "
                ALTER TABLE test_questions ADD COLUMN math_work TEXT;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "create_test_errors_and_analyses_tables",
            sql: "
                CREATE TABLE IF NOT EXISTS test_analyses (
                    id TEXT PRIMARY KEY,
                    test_id TEXT NOT NULL,
                    subject_id TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    strengths TEXT,
                    weaknesses TEXT,
                    recommendations TEXT,
                    created_at DATETIME NOT NULL,
                    FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE,
                    FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS test_errors (
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
                    FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE,
                    FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "add_time_limit_to_tests",
            sql: "
                ALTER TABLE tests ADD COLUMN time_limit_minutes INTEGER;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add_image_url_to_flashcards",
            sql: "
                ALTER TABLE flashcards ADD COLUMN image_url TEXT;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "add_front_and_back_image_url_to_flashcards",
            sql: "
                ALTER TABLE flashcards ADD COLUMN front_image_url TEXT;
                ALTER TABLE flashcards ADD COLUMN back_image_url TEXT;
            ",
            kind: MigrationKind::Up,
        },
    ]
}
