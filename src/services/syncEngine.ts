import { invoke } from "@tauri-apps/api/core";
import { getDB } from "./db/connection";
import {
  Subject,
  Folder,
  Deck,
  Flashcard,
  RevisionHistory,
  Test,
  TestQuestion,
  TestAnalysis,
  TestError,
} from "./db/types";
import { getStats } from "./db/revisionHistory";
import {
  WebDavConfig,
  loadWebDavConfig,
  saveWebDavConfig,
  uploadSyncPackage,
  downloadSyncPackage,
  getRemoteFileMetadata,
} from "./webdavService";
import { logger } from "./logger";

export interface SyncPackage {
  version: "1.0";
  exported_at: string;
  client_id: string;
  device_name: string;
  schema_version: number;
  subjects: Subject[];
  folders: Folder[];
  decks: Deck[];
  flashcards: Flashcard[];
  revision_history: RevisionHistory[];
  tests: Test[];
  test_questions: TestQuestion[];
  test_analyses: TestAnalysis[];
  test_errors: TestError[];
  fsrs_parameters?: string | null;
  notification_settings?: any;
}

export interface SyncResult {
  success: boolean;
  message: string;
  timestamp: string;
  stats?: {
    subjects: number;
    folders: number;
    decks: number;
    flashcards: number;
    revisionLogs: number;
    tests: number;
  };
}

function getClientId(): string {
  let id = localStorage.getItem("oxide_deck_client_id");
  if (!id) {
    id = "client_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();
    localStorage.setItem("oxide_deck_client_id", id);
  }
  return id;
}

function getDeviceName(): string {
  if (typeof navigator !== "undefined" && navigator.userAgent) {
    if (/android/i.test(navigator.userAgent)) return "Android Phone";
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return "iOS Device";
    if (/windows/i.test(navigator.userAgent)) return "Windows PC";
    if (/mac/i.test(navigator.userAgent)) return "macOS";
    if (/linux/i.test(navigator.userAgent)) return "Linux";
  }
  return "Device";
}

/**
 * Capture full snapshot of local database into a SyncPackage.
 */
export async function exportLocalSyncPackage(): Promise<SyncPackage> {
  const db = await getDB();

  const subjects = await db.select<Subject[]>("SELECT * FROM subjects ORDER BY created_at ASC");
  const folders = await db.select<Folder[]>("SELECT * FROM folders ORDER BY created_at ASC");
  const decks = await db.select<Deck[]>("SELECT * FROM decks ORDER BY created_at ASC");
  const flashcards = await db.select<Flashcard[]>("SELECT * FROM flashcards ORDER BY created_at ASC");
  const revision_history = await db.select<RevisionHistory[]>("SELECT * FROM revision_history ORDER BY reviewed_at ASC");
  const tests = await db.select<Test[]>("SELECT * FROM tests ORDER BY created_at ASC");
  const test_questions = await db.select<TestQuestion[]>("SELECT * FROM test_questions ORDER BY created_at ASC");
  const test_analyses = await db.select<TestAnalysis[]>("SELECT * FROM test_analyses ORDER BY created_at ASC");
  const test_errors = await db.select<TestError[]>("SELECT * FROM test_errors ORDER BY created_at ASC");
  const fsrsRows = await db.select<{ params: string }[]>("SELECT params FROM fsrs_parameters WHERE id = 1");

  let notifSettings: any = null;
  try {
    const raw = localStorage.getItem("oxide_deck_notification_settings");
    if (raw) notifSettings = JSON.parse(raw);
  } catch {}

  return {
    version: "1.0",
    exported_at: new Date().toISOString(),
    client_id: getClientId(),
    device_name: getDeviceName(),
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
    fsrs_parameters: fsrsRows[0]?.params || null,
    notification_settings: notifSettings,
  };
}

/**
 * Deterministically merge remote and local sync packages.
 */
export function mergeSyncPackages(local: SyncPackage, remote: SyncPackage): SyncPackage {
  // 1. Subjects Merge (Union by ID)
  const subjectMap = new Map<string, Subject>();
  remote.subjects?.forEach((s) => subjectMap.set(s.id, s));
  local.subjects?.forEach((s) => subjectMap.set(s.id, s));

  // 2. Folders Merge (Union by ID)
  const folderMap = new Map<string, Folder>();
  remote.folders?.forEach((f) => folderMap.set(f.id, f));
  local.folders?.forEach((f) => folderMap.set(f.id, f));

  // 3. Decks Merge (Union by ID)
  const deckMap = new Map<string, Deck>();
  remote.decks?.forEach((d) => deckMap.set(d.id, d));
  local.decks?.forEach((d) => deckMap.set(d.id, d));

  // 4. Flashcards Merge (Intelligent Spaced Repetition State Resolution)
  const cardMap = new Map<string, Flashcard>();
  const allCardIds = new Set<string>([
    ...(local.flashcards || []).map((c) => c.id),
    ...(remote.flashcards || []).map((c) => c.id),
  ]);

  const localCardMap = new Map(local.flashcards.map((c) => [c.id, c]));
  const remoteCardMap = new Map((remote.flashcards || []).map((c) => [c.id, c]));

  for (const id of allCardIds) {
    const loc = localCardMap.get(id);
    const rem = remoteCardMap.get(id);

    if (loc && !rem) {
      cardMap.set(id, loc);
    } else if (!loc && rem) {
      cardMap.set(id, rem);
    } else if (loc && rem) {
      // Both exist: resolve conflict
      const locLastReview = loc.last_review ? new Date(loc.last_review).getTime() : 0;
      const remLastReview = rem.last_review ? new Date(rem.last_review).getTime() : 0;

      // Prefer the one with more recent study activity or higher repetition count
      const preferRemoteFSRS =
        remLastReview > locLastReview ||
        (remLastReview === locLastReview && (rem.reps || 0) > (loc.reps || 0));

      const chosenFSRS = preferRemoteFSRS ? rem : loc;

      cardMap.set(id, {
        id,
        deck_id: loc.deck_id || rem.deck_id,
        front: loc.front || rem.front,
        back: loc.back || rem.back,
        tags: loc.tags !== undefined ? loc.tags : rem.tags,
        ease: chosenFSRS.ease ?? loc.ease ?? 2.5,
        interval_days: chosenFSRS.interval_days ?? loc.interval_days ?? 0,
        repetitions: chosenFSRS.repetitions ?? loc.repetitions ?? 0,
        next_review: chosenFSRS.next_review || loc.next_review || rem.next_review,
        created_at: loc.created_at || rem.created_at,
        stability: chosenFSRS.stability ?? loc.stability ?? 0,
        difficulty: chosenFSRS.difficulty ?? loc.difficulty ?? 0,
        state: chosenFSRS.state ?? loc.state ?? 0,
        reps: chosenFSRS.reps ?? loc.reps ?? 0,
        lapses: chosenFSRS.lapses ?? loc.lapses ?? 0,
        elapsed_days: chosenFSRS.elapsed_days ?? loc.elapsed_days ?? 0,
        scheduled_days: chosenFSRS.scheduled_days ?? loc.scheduled_days ?? 0,
        last_review: chosenFSRS.last_review ?? loc.last_review ?? null,
        image_url: loc.image_url || rem.image_url || null,
        front_image_url: loc.front_image_url || rem.front_image_url || null,
        back_image_url: loc.back_image_url || rem.back_image_url || null,
      });
    }
  }

  // 5. Revision History Merge (Union by unique log UUID)
  const historyMap = new Map<string, RevisionHistory>();
  remote.revision_history?.forEach((h) => historyMap.set(h.id, h));
  local.revision_history?.forEach((h) => historyMap.set(h.id, h));

  // 6. Tests & Exams Merge
  const testMap = new Map<string, Test>();
  remote.tests?.forEach((t) => testMap.set(t.id, t));
  local.tests?.forEach((t) => testMap.set(t.id, t));

  const questionMap = new Map<string, TestQuestion>();
  remote.test_questions?.forEach((q) => questionMap.set(q.id, q));
  local.test_questions?.forEach((q) => questionMap.set(q.id, q));

  const analysisMap = new Map<string, TestAnalysis>();
  remote.test_analyses?.forEach((a) => analysisMap.set(a.id, a));
  local.test_analyses?.forEach((a) => analysisMap.set(a.id, a));

  const errorMap = new Map<string, TestError>();
  remote.test_errors?.forEach((e) => errorMap.set(e.id, e));
  local.test_errors?.forEach((e) => errorMap.set(e.id, e));

  return {
    version: "1.0",
    exported_at: new Date().toISOString(),
    client_id: getClientId(),
    device_name: getDeviceName(),
    schema_version: 14,
    subjects: Array.from(subjectMap.values()),
    folders: Array.from(folderMap.values()),
    decks: Array.from(deckMap.values()),
    flashcards: Array.from(cardMap.values()),
    revision_history: Array.from(historyMap.values()),
    tests: Array.from(testMap.values()),
    test_questions: Array.from(questionMap.values()),
    test_analyses: Array.from(analysisMap.values()),
    test_errors: Array.from(errorMap.values()),
    fsrs_parameters: remote.fsrs_parameters || local.fsrs_parameters,
    notification_settings: local.notification_settings || remote.notification_settings,
  };
}

/**
 * Write the merged dataset into local SQLite database within a single atomic transaction
 * with diff-based delta filtering to minimize disk writes and IPC overhead.
 */
export async function applySyncPackageToLocalDB(
  pkg: SyncPackage,
  knownLocalPkg?: SyncPackage
): Promise<void> {
  const db = await getDB();

  // 1. Obtain local state: either directly from known local package (0 DB reads) or sequentially fetch
  let localSubjects = knownLocalPkg?.subjects;
  let localFolders = knownLocalPkg?.folders;
  let localDecks = knownLocalPkg?.decks;
  let localCards = knownLocalPkg?.flashcards;
  let localHistoryRows = knownLocalPkg?.revision_history;
  let localTestRows = knownLocalPkg?.tests;
  let localQuestionRows = knownLocalPkg?.test_questions;
  let localAnalysisRows = knownLocalPkg?.test_analyses;
  let localErrorRows = knownLocalPkg?.test_errors;

  if (!knownLocalPkg) {
    localSubjects = await db.select<Subject[]>("SELECT * FROM subjects ORDER BY created_at ASC");
    localFolders = await db.select<Folder[]>("SELECT * FROM folders ORDER BY created_at ASC");
    localDecks = await db.select<Deck[]>("SELECT * FROM decks ORDER BY created_at ASC");
    localCards = await db.select<Flashcard[]>("SELECT * FROM flashcards ORDER BY created_at ASC");
    localHistoryRows = await db.select<RevisionHistory[]>("SELECT * FROM revision_history ORDER BY reviewed_at ASC");
    localTestRows = await db.select<Test[]>("SELECT * FROM tests ORDER BY created_at ASC");
    localQuestionRows = await db.select<TestQuestion[]>("SELECT * FROM test_questions ORDER BY created_at ASC");
    localAnalysisRows = await db.select<TestAnalysis[]>("SELECT * FROM test_analyses ORDER BY created_at ASC");
    localErrorRows = await db.select<TestError[]>("SELECT * FROM test_errors ORDER BY created_at ASC");
  }

  const subjectMap = new Map((localSubjects || []).map((s) => [s.id, s]));
  const folderMap = new Map((localFolders || []).map((f) => [f.id, f]));
  const deckMap = new Map((localDecks || []).map((d) => [d.id, d]));
  const cardMap = new Map((localCards || []).map((c) => [c.id, c]));
  const historySet = new Set((localHistoryRows || []).map((h) => h.id));
  const testMap = new Map((localTestRows || []).map((t) => [t.id, t]));
  const questionSet = new Set((localQuestionRows || []).map((q) => q.id));
  const analysisSet = new Set((localAnalysisRows || []).map((a) => a.id));
  const errorSet = new Set((localErrorRows || []).map((e) => e.id));

  await db.execute("BEGIN TRANSACTION");
  try {
  // 1. Subjects (only insert/update if dirty or new)
  for (const s of pkg.subjects || []) {
      const existing = subjectMap.get(s.id);
      if (
        existing &&
        existing.name === s.name &&
        existing.icon === (s.icon || null) &&
        existing.color === (s.color || null)
      ) {
        continue;
      }
      await db.execute(
        "INSERT OR REPLACE INTO subjects (id, name, icon, color, created_at) VALUES ($1, $2, $3, $4, $5)",
        [s.id, s.name, s.icon || null, s.color || null, s.created_at]
      );
    }

    // 2. Folders (Pass 1: parent = NULL to satisfy foreign keys)
    for (const f of pkg.folders || []) {
      const existing = folderMap.get(f.id);
      if (
        existing &&
        existing.name === f.name &&
        existing.icon === (f.icon || null) &&
        existing.color === (f.color || null) &&
        existing.subject_id === (f.subject_id || null)
      ) {
        continue;
      }
      await db.execute(
        "INSERT OR REPLACE INTO folders (id, name, icon, color, subject_id, parent_folder_id, created_at) VALUES ($1, $2, $3, $4, $5, NULL, $6)",
        [f.id, f.name, f.icon || null, f.color || null, f.subject_id || null, f.created_at]
      );
    }

    // Folders (Pass 2: attach parent_folder_id for nested folders)
    for (const f of pkg.folders || []) {
      if (f.parent_folder_id) {
        const existing = folderMap.get(f.id);
        if (existing && existing.parent_folder_id === f.parent_folder_id) {
          continue;
        }
        await db.execute("UPDATE folders SET parent_folder_id = $1 WHERE id = $2", [
          f.parent_folder_id,
          f.id,
        ]);
      }
    }

    // 3. Decks
    for (const d of pkg.decks || []) {
      const existing = deckMap.get(d.id);
      if (
        existing &&
        existing.name === d.name &&
        existing.icon === (d.icon || null) &&
        existing.description === (d.description || null) &&
        existing.folder_id === (d.folder_id || null)
      ) {
        continue;
      }
      await db.execute(
        "INSERT OR REPLACE INTO decks (id, folder_id, name, icon, description, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [d.id, d.folder_id || null, d.name, d.icon || null, d.description || null, d.created_at]
      );
    }

    // 4. Flashcards (Diff-based FSRS delta writes)
    for (const c of pkg.flashcards || []) {
      const existing = cardMap.get(c.id);
      if (
        existing &&
        existing.deck_id === c.deck_id &&
        existing.front === c.front &&
        existing.back === c.back &&
        (existing.tags || null) === (c.tags || null) &&
        existing.reps === (c.reps ?? 0) &&
        existing.lapses === (c.lapses ?? 0) &&
        existing.state === (c.state ?? 0) &&
        existing.stability === (c.stability ?? 0) &&
        existing.difficulty === (c.difficulty ?? 0) &&
        existing.last_review === (c.last_review || null) &&
        existing.next_review === c.next_review &&
        existing.image_url === (c.image_url || null) &&
        existing.front_image_url === (c.front_image_url || null) &&
        existing.back_image_url === (c.back_image_url || null)
      ) {
        continue; // Unchanged, skip disk write!
      }

      await db.execute(
        `INSERT OR REPLACE INTO flashcards (
          id, deck_id, front, back, tags, ease, interval_days, repetitions, next_review, created_at,
          stability, difficulty, state, reps, lapses, elapsed_days, scheduled_days, last_review,
          image_url, front_image_url, back_image_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
        [
          c.id,
          c.deck_id,
          c.front,
          c.back,
          c.tags || null,
          c.ease ?? 2.5,
          c.interval_days ?? 0,
          c.repetitions ?? 0,
          c.next_review,
          c.created_at,
          c.stability ?? 0,
          c.difficulty ?? 0,
          c.state ?? 0,
          c.reps ?? 0,
          c.lapses ?? 0,
          c.elapsed_days ?? 0,
          c.scheduled_days ?? 0,
          c.last_review || null,
          c.image_url || null,
          c.front_image_url || null,
          c.back_image_url || null,
        ]
      );
    }

    // 5. Revision History (Immutable logs, only insert new IDs)
    for (const h of pkg.revision_history || []) {
      if (historySet.has(h.id)) {
        continue;
      }
      await db.execute(
        "INSERT OR REPLACE INTO revision_history (id, flashcard_id, type, score, reviewed_at, rating) VALUES ($1, $2, $3, $4, $5, $6)",
        [h.id, h.flashcard_id || null, h.type, h.score, h.reviewed_at, h.rating || null]
      );
    }

    // 6. Tests & Questions
    for (const t of pkg.tests || []) {
      const existing = testMap.get(t.id);
      if (
        existing &&
        existing.name === t.name &&
        existing.score === (t.score ?? null) &&
        existing.max_score === t.max_score &&
        existing.test_date === (t.test_date || null)
      ) {
        continue;
      }
      await db.execute(
        `INSERT OR REPLACE INTO tests (id, subject_id, name, description, source_type, source_data, score, max_score, test_date, time_limit_minutes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          t.id,
          t.subject_id,
          t.name,
          t.description || null,
          t.source_type,
          t.source_data || null,
          t.score,
          t.max_score,
          t.test_date || null,
          t.time_limit_minutes || null,
          t.created_at,
        ]
      );
    }

    for (const q of pkg.test_questions || []) {
      if (questionSet.has(q.id)) {
        continue;
      }
      const optsStr = q.options ? JSON.stringify(q.options) : null;
      await db.execute(
        `INSERT OR REPLACE INTO test_questions (id, test_id, type, question, options, correct_answer, user_answer, score, math_work, source_page, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          q.id,
          q.test_id,
          q.type,
          q.question,
          optsStr,
          q.correct_answer || null,
          q.user_answer || null,
          q.score,
          q.math_work || null,
          q.source_page || null,
          q.created_at,
        ]
      );
    }

    for (const a of pkg.test_analyses || []) {
      if (analysisSet.has(a.id)) {
        continue;
      }
      await db.execute(
        `INSERT OR REPLACE INTO test_analyses (id, test_id, subject_id, summary, strengths, weaknesses, recommendations, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          a.id,
          a.test_id,
          a.subject_id,
          a.summary,
          a.strengths || null,
          a.weaknesses || null,
          a.recommendations || null,
          a.created_at,
        ]
      );
    }

    for (const e of pkg.test_errors || []) {
      if (errorSet.has(e.id)) {
        continue;
      }
      await db.execute(
        `INSERT OR REPLACE INTO test_errors (id, test_id, subject_id, question_id, question_text, user_answer, correct_answer, error_reason, score, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          e.id,
          e.test_id,
          e.subject_id,
          e.question_id || null,
          e.question_text,
          e.user_answer || null,
          e.correct_answer || null,
          e.error_reason,
          e.score,
          e.created_at,
        ]
      );
    }

    // 7. FSRS Parameters
    if (pkg.fsrs_parameters) {
      await db.execute(
        "INSERT OR REPLACE INTO fsrs_parameters (id, params, updated_at) VALUES (1, $1, CURRENT_TIMESTAMP)",
        [pkg.fsrs_parameters]
      );
    }

    await db.execute("COMMIT");
  } catch (txErr) {
    try {
      await db.execute("ROLLBACK");
    } catch {}
    throw txErr;
  }

  // Refresh Stats
  await getStats().catch(() => {});
}

let lastLocalDataModifiedAt = Date.now();
let isSyncInProgress = false;

/**
 * Marks local database as dirty (mutated by user).
 */
export function markLocalDataChanged(): void {
  lastLocalDataModifiedAt = Date.now();
}

/**
 * Main WebDAV Synchronization Orchestrator (Bidirectional Merge).
 */
export async function performWebDAVSync(customConfig?: WebDavConfig, allowHidden = false): Promise<SyncResult> {
  const config = customConfig || loadWebDavConfig();
  if (!config.enabled && !customConfig) {
    return {
      success: false,
      message: "WebDAV sync is currently disabled in Settings.",
      timestamp: new Date().toISOString(),
    };
  }

  // If the app is in the background or screen is asleep, let Android WorkManager handle sync unless explicitly allowed
  if (!allowHidden && typeof document !== "undefined" && document.visibilityState === 'hidden' && !customConfig) {
    return {
      success: true,
      message: "In-app sync paused while screen is off / app is hidden (managed by WorkManager).",
      timestamp: new Date().toISOString(),
    };
  }

  if (isSyncInProgress) {
    return {
      success: true,
      message: "Sync already in progress.",
      timestamp: new Date().toISOString(),
    };
  }

  isSyncInProgress = true;

  const isTauri = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
  if (isTauri) {
    try {
      const res = await invoke<SyncResult>("sync_run_native", {
        config,
        forceUpload: false,
        forceDownload: false,
      });
      if (res.success) {
        config.lastSyncedAt = res.timestamp;
        lastLocalDataModifiedAt = new Date(res.timestamp).getTime();
        saveWebDavConfig(config);
        await getStats().catch(() => {});
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("webdav-sync-completed", { detail: res }));
      }
      return res;
    } catch (nativeErr: any) {
      logger.error("WebDAV-Sync", "Rust native sync error", nativeErr);
      const errText = typeof nativeErr === "string" ? nativeErr : nativeErr?.message || "Sync failed";
      const errRes: SyncResult = {
        success: false,
        message: `Sync failed: ${errText}`,
        timestamp: new Date().toISOString(),
      };
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("webdav-sync-completed", { detail: errRes }));
      }
      return errRes;
    } finally {
      isSyncInProgress = false;
    }
  }

  try {
    // 1. Export local dataset
    const localPkg = await exportLocalSyncPackage();

    // 2. Fetch remote dataset from WebDAV
    const remoteRawJson = await downloadSyncPackage(config);

    let mergedPkg: SyncPackage;
    if (remoteRawJson) {
      const remotePkg: SyncPackage = JSON.parse(remoteRawJson);
      mergedPkg = mergeSyncPackages(localPkg, remotePkg);
    } else {
      // First sync or empty remote
      mergedPkg = localPkg;
    }

    // 3. Apply merged dataset to local SQLite database (using localPkg in-memory, 0 extra DB reads)
    await applySyncPackageToLocalDB(mergedPkg, localPkg);

    // 4. Upload compact merged dataset back to WebDAV (no whitespace bloat)
    const mergedJsonStr = JSON.stringify(mergedPkg);
    await uploadSyncPackage(config, mergedJsonStr);

    // 5. Update last sync timestamp & fetch remote ETag
    const nowIso = new Date().toISOString();
    config.lastSyncedAt = nowIso;
    lastLocalDataModifiedAt = new Date(nowIso).getTime();

    try {
      const meta = await getRemoteFileMetadata(config);
      if (meta.etag) {
        config.lastRemoteEtag = meta.etag;
      }
    } catch {
      // Non-fatal
    }

    saveWebDavConfig(config);

    logger.info("WebDAV-Sync", "Bidirectional sync completed successfully", {
      decks_count: mergedPkg.decks.length,
      cards_count: mergedPkg.flashcards.length,
      logs_count: mergedPkg.revision_history.length,
      tests_count: mergedPkg.tests.length,
    });

    return {
      success: true,
      message: `Sync successful! Synced ${mergedPkg.decks.length} deck(s) and ${mergedPkg.flashcards.length} flashcard(s).`,
      timestamp: nowIso,
      stats: {
        subjects: mergedPkg.subjects.length,
        folders: mergedPkg.folders.length,
        decks: mergedPkg.decks.length,
        flashcards: mergedPkg.flashcards.length,
        revisionLogs: mergedPkg.revision_history.length,
        tests: mergedPkg.tests.length,
      },
    };
  } catch (err: any) {
    logger.error("WebDAV-Sync", "Bidirectional sync encountered an error", err);
    const errText = typeof err === "string" ? err : err?.message || (err ? JSON.stringify(err) : "Unexpected error");
    return {
      success: false,
      message: `Sync failed: ${errText}`,
      timestamp: new Date().toISOString(),
    };
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Optimized periodic sync that checks for local mutations or remote ETag changes
 * before doing a full network payload transfer.
 */
export async function performOptimizedPeriodicSync(customConfig?: WebDavConfig): Promise<SyncResult> {
  const config = customConfig || loadWebDavConfig();
  if (!config.enabled || !config.serverUrl.trim() || !config.username.trim()) {
    return {
      success: false,
      message: "WebDAV sync not configured.",
      timestamp: new Date().toISOString(),
    };
  }

  // If the app is in the background or screen is asleep, let Android WorkManager handle sync
  if (typeof document !== "undefined" && document.visibilityState === 'hidden' && !customConfig) {
    return {
      success: true,
      message: "In-app sync paused while screen is off / app is hidden (managed by WorkManager).",
      timestamp: new Date().toISOString(),
    };
  }

  if (isSyncInProgress) {
    return {
      success: true,
      message: "Sync already in progress.",
      timestamp: new Date().toISOString(),
    };
  }

  // 1. Check if local database was modified since last successful sync
  const lastSyncTime = config.lastSyncedAt ? new Date(config.lastSyncedAt).getTime() : 0;
  const localChanged = !config.lastSyncedAt || lastLocalDataModifiedAt > lastSyncTime;

  // 2. Check remote metadata (HEAD request - near-zero bandwidth)
  let remoteChanged = true;
  try {
    const meta = await getRemoteFileMetadata(config);
    if (meta.exists && meta.etag && config.lastRemoteEtag) {
      remoteChanged = meta.etag !== config.lastRemoteEtag;
    } else if (!meta.exists && !localChanged) {
      remoteChanged = false;
    }
  } catch {
    remoteChanged = true; // Fallback to full sync if HEAD fails
  }

  // 3. If neither local nor remote changed, it's a zero-bandwidth no-op
  if (!localChanged && !remoteChanged) {
    const nowIso = new Date().toISOString();
    config.lastSyncedAt = nowIso;
    saveWebDavConfig(config);

    const result: SyncResult = {
      success: true,
      message: "Up to date (no local or remote changes detected).",
      timestamp: nowIso,
    };
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("webdav-sync-completed", { detail: result }));
    }
    return result;
  }

  // 4. Perform bidirectional merge if changes were detected
  const result = await performWebDAVSync(config);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("webdav-sync-completed", { detail: result }));
  }
  return result;
}

/**
 * Force overwrite remote WebDAV server with current local database.
 */
export async function forceUploadToWebDAV(customConfig?: WebDavConfig): Promise<SyncResult> {
  const config = customConfig || loadWebDavConfig();
  if (isSyncInProgress) {
    return {
      success: false,
      message: "Another sync operation is already in progress.",
      timestamp: new Date().toISOString(),
    };
  }

  isSyncInProgress = true;

  const isTauriUpload = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
  if (isTauriUpload) {
    try {
      const res = await invoke<SyncResult>("sync_run_native", {
        config,
        forceUpload: true,
        forceDownload: false,
      });
      if (res.success) {
        config.lastSyncedAt = res.timestamp;
        lastLocalDataModifiedAt = new Date(res.timestamp).getTime();
        saveWebDavConfig(config);
      }
      return res;
    } catch (err: any) {
      return {
        success: false,
        message: `Force upload failed: ${err?.message || err}`,
        timestamp: new Date().toISOString(),
      };
    } finally {
      isSyncInProgress = false;
    }
  }

  try {
    const localPkg = await exportLocalSyncPackage();
    const jsonStr = JSON.stringify(localPkg);
    await uploadSyncPackage(config, jsonStr);

    const nowIso = new Date().toISOString();
    config.lastSyncedAt = nowIso;
    lastLocalDataModifiedAt = new Date(nowIso).getTime();

    try {
      const meta = await getRemoteFileMetadata(config);
      if (meta.etag) {
        config.lastRemoteEtag = meta.etag;
      }
    } catch {}

    saveWebDavConfig(config);

    return {
      success: true,
      message: `Uploaded local database (${localPkg.flashcards.length} cards) to WebDAV.`,
      timestamp: nowIso,
    };
  } catch (err: any) {
    const errText = typeof err === "string" ? err : err?.message || (err ? JSON.stringify(err) : "Force upload failed.");
    return {
      success: false,
      message: `Force upload failed: ${errText}`,
      timestamp: new Date().toISOString(),
    };
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Force overwrite local database with remote WebDAV snapshot.
 */
export async function forceDownloadFromWebDAV(customConfig?: WebDavConfig): Promise<SyncResult> {
  const config = customConfig || loadWebDavConfig();
  if (isSyncInProgress) {
    return {
      success: false,
      message: "Another sync operation is already in progress.",
      timestamp: new Date().toISOString(),
    };
  }

  isSyncInProgress = true;

  const isTauriDownload = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
  if (isTauriDownload) {
    try {
      const res = await invoke<SyncResult>("sync_run_native", {
        config,
        forceUpload: false,
        forceDownload: true,
      });
      if (res.success) {
        config.lastSyncedAt = res.timestamp;
        lastLocalDataModifiedAt = new Date(res.timestamp).getTime();
        saveWebDavConfig(config);
        await getStats().catch(() => {});
      }
      return res;
    } catch (err: any) {
      return {
        success: false,
        message: `Force download failed: ${err?.message || err}`,
        timestamp: new Date().toISOString(),
      };
    } finally {
      isSyncInProgress = false;
    }
  }

  try {
    const remoteRawJson = await downloadSyncPackage(config);
    if (!remoteRawJson) {
      throw new Error("No remote synchronization file found on the WebDAV server.");
    }

    const remotePkg: SyncPackage = JSON.parse(remoteRawJson);
    await applySyncPackageToLocalDB(remotePkg);

    const nowIso = new Date().toISOString();
    config.lastSyncedAt = nowIso;
    lastLocalDataModifiedAt = new Date(nowIso).getTime();

    try {
      const meta = await getRemoteFileMetadata(config);
      if (meta.etag) {
        config.lastRemoteEtag = meta.etag;
      }
    } catch {}

    saveWebDavConfig(config);

    return {
      success: true,
      message: `Downloaded and restored database from WebDAV (${remotePkg.flashcards.length} cards).`,
      timestamp: nowIso,
    };
  } catch (err: any) {
    const errText = typeof err === "string" ? err : err?.message || (err ? JSON.stringify(err) : "Force download failed.");
    return {
      success: false,
      message: `Force download failed: ${errText}`,
      timestamp: new Date().toISOString(),
    };
  } finally {
    isSyncInProgress = false;
  }
}

let syncDebounceTimer: any = null;

/**
 * Debounced or immediate background sync trigger for data creation/modification events and revision exits.
 */
export function triggerBackgroundSyncIfEnabled(reason?: string, immediate = false) {
  markLocalDataChanged();

  const config = loadWebDavConfig();
  if (
    !config.enabled ||
    !config.serverUrl.trim() ||
    !config.username.trim()
  ) {
    return;
  }

  const isReviewReason = Boolean(reason?.includes("revision") || reason?.includes("review"));
  const isEnabledForReason = isReviewReason
    ? (config.autoSyncOnReview || config.autoSyncOnChange)
    : config.autoSyncOnChange;

  if (!isEnabledForReason) {
    return;
  }

  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }

  const doSync = () => {
    performWebDAVSync(undefined, isReviewReason).catch((e) => {
      console.warn(`Background auto-sync (${reason || "data change"}) failed:`, e);
    });
  };

  if (immediate) {
    doSync();
  } else {
    // Debounce by 400ms to allow smooth UI transitions
    syncDebounceTimer = setTimeout(doSync, 400);
  }
}
