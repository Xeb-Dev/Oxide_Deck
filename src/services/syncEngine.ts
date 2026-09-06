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

export interface Tombstone {
  entity_id: string;
  entity_type: string;
  deleted_at: string;
}

export interface SyncPackage {
  version: "1.0";
  app_version?: string;
  exported_at: string;
  client_id: string;
  device_name: string;
  schema_version: number;
  min_compatible_app_version?: string;
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
  fsrs_updated_at?: string | null;
  notification_settings?: any;
  tombstones?: Tombstone[];
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
    media_synced?: number;
  };
  update_required?: boolean;
  required_version?: string;
}

function getClientId(): string {
  let id = localStorage.getItem("oxide_deck_client_id");
  if (!id) {
    id = "client_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();
    localStorage.setItem("oxide_deck_client_id", id);
  }
  return id;
}

export function normalizeSyncTimestamp(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (!isNaN(d.getTime())) return d.toISOString();
  const num = parseFloat(ts);
  if (!isNaN(num) && num > 0) {
    const fromNum = new Date(num < 1e11 ? num * 1000 : num);
    if (!isNaN(fromNum.getTime())) return fromNum.toISOString();
  }
  return new Date().toISOString();
}

export function getSyncTimestampMs(ts: string | null | undefined): number {
  if (!ts) return 0;
  const d = new Date(ts);
  if (!isNaN(d.getTime())) return d.getTime();
  const num = parseFloat(ts);
  if (!isNaN(num) && num > 0) {
    return num < 1e11 ? num * 1000 : num;
  }
  return 0;
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
  const fsrsRows = await db.select<{ params: string; updated_at?: string }[]>(
    "SELECT params, updated_at FROM fsrs_parameters WHERE id = 1"
  );
  const tombstones = await db.select<Tombstone[]>(
    "SELECT entity_id, entity_type, deleted_at FROM sync_tombstones WHERE deleted_at >= datetime('now', '-60 days') ORDER BY deleted_at ASC"
  );

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
    schema_version: 16,
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
    fsrs_updated_at: fsrsRows[0]?.updated_at || null,
    notification_settings: notifSettings,
    tombstones,
  };
}

/**
 * Deterministically merge remote and local sync packages with tombstone propagation and cascade pruning.
 */
export function mergeSyncPackages(local: SyncPackage, remote: SyncPackage): SyncPackage {
  // 0. Build Tombstones Map (purging tombstones older than 60 days)
  const sixtyDaysAgoIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const tombstoneMap = new Map<string, Tombstone>();
  
  (remote.tombstones || []).forEach((t) => {
    if (t.deleted_at >= sixtyDaysAgoIso) {
      tombstoneMap.set(t.entity_id, t);
    }
  });
  (local.tombstones || []).forEach((t) => {
    if (t.deleted_at >= sixtyDaysAgoIso) {
      tombstoneMap.set(t.entity_id, t);
    }
  });

  const isDeleted = (id: string) => tombstoneMap.has(id);

  // 1. Subjects Merge (Union by ID, filtering tombstones)
  const subjectMap = new Map<string, Subject>();
  remote.subjects?.forEach((s) => {
    if (!isDeleted(s.id)) subjectMap.set(s.id, s);
  });
  local.subjects?.forEach((s) => {
    if (!isDeleted(s.id)) {
      const existing = subjectMap.get(s.id);
      if (existing) {
        const remUpdated = existing.updated_at || existing.created_at;
        const locUpdated = s.updated_at || s.created_at;
        if (locUpdated >= remUpdated) subjectMap.set(s.id, s);
      } else {
        subjectMap.set(s.id, s);
      }
    }
  });

  // 2. Folders Merge (Union by ID, filtering tombstones)
  const folderMap = new Map<string, Folder>();
  remote.folders?.forEach((f) => {
    if (!isDeleted(f.id)) folderMap.set(f.id, f);
  });
  local.folders?.forEach((f) => {
    if (!isDeleted(f.id)) {
      const existing = folderMap.get(f.id);
      if (existing) {
        const remUpdated = existing.updated_at || existing.created_at;
        const locUpdated = f.updated_at || f.created_at;
        if (locUpdated >= remUpdated) folderMap.set(f.id, f);
      } else {
        folderMap.set(f.id, f);
      }
    }
  });

  // Break folder parent cycles to prevent disappearing folders
  for (const folder of folderMap.values()) {
    let curr: string | null | undefined = folder.parent_folder_id;
    const visited = new Set<string>([folder.id]);
    while (curr) {
      if (visited.has(curr)) {
        folder.parent_folder_id = null;
        break;
      }
      visited.add(curr);
      curr = folderMap.get(curr)?.parent_folder_id;
    }
  }

  // 3. Decks Merge (Union by ID, filtering tombstones)
  const deckMap = new Map<string, Deck>();
  remote.decks?.forEach((d) => {
    if (!isDeleted(d.id)) deckMap.set(d.id, d);
  });
  local.decks?.forEach((d) => {
    if (!isDeleted(d.id)) {
      const existing = deckMap.get(d.id);
      if (existing) {
        const remUpdated = existing.updated_at || existing.created_at;
        const locUpdated = d.updated_at || d.created_at;
        if (locUpdated >= remUpdated) deckMap.set(d.id, d);
      } else {
        deckMap.set(d.id, d);
      }
    }
  });

  // 4. Flashcards Merge (Intelligent Spaced Repetition State Resolution)
  const cardMap = new Map<string, Flashcard>();
  const allCardIds = new Set<string>([
    ...(local.flashcards || []).map((c) => c.id),
    ...(remote.flashcards || []).map((c) => c.id),
  ]);

  const localCardMap = new Map((local.flashcards || []).map((c) => [c.id, c]));
  const remoteCardMap = new Map((remote.flashcards || []).map((c) => [c.id, c]));

  for (const id of allCardIds) {
    if (isDeleted(id)) continue;

    const loc = localCardMap.get(id);
    const rem = remoteCardMap.get(id);

    if (loc && !rem) {
      if (!isDeleted(loc.deck_id)) cardMap.set(id, loc);
    } else if (!loc && rem) {
      if (!isDeleted(rem.deck_id)) cardMap.set(id, rem);
    } else if (loc && rem) {
      if (isDeleted(loc.deck_id) || isDeleted(rem.deck_id)) continue;

      const locLastReview = loc.last_review ? new Date(loc.last_review).getTime() : 0;
      const remLastReview = rem.last_review ? new Date(rem.last_review).getTime() : 0;

      const preferRemoteFSRS =
        remLastReview > locLastReview ||
        (remLastReview === locLastReview && (rem.reps || 0) > (loc.reps || 0));

      const chosenFSRS = preferRemoteFSRS ? rem : loc;

      const locUpdated = loc.updated_at || loc.created_at;
      const remUpdated = rem.updated_at || rem.created_at;
      const contentSource = remUpdated > locUpdated ? rem : loc;

      cardMap.set(id, {
        id,
        deck_id: contentSource.deck_id,
        front: contentSource.front,
        back: contentSource.back,
        tags: contentSource.tags !== undefined ? contentSource.tags : loc.tags,
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
        image_url: contentSource.image_url || loc.image_url || null,
        front_image_url: contentSource.front_image_url || loc.front_image_url || null,
        back_image_url: contentSource.back_image_url || loc.back_image_url || null,
        updated_at: locUpdated > remUpdated ? locUpdated : remUpdated,
      });
    }
  }

  // 5. Revision History Merge (Union by unique log UUID)
  const historyMap = new Map<string, RevisionHistory>();
  remote.revision_history?.forEach((h) => historyMap.set(h.id, h));
  local.revision_history?.forEach((h) => historyMap.set(h.id, h));

  // 6. Tests & Exams Merge
  const testMap = new Map<string, Test>();
  remote.tests?.forEach((t) => {
    if (!isDeleted(t.id) && !isDeleted(t.subject_id)) testMap.set(t.id, t);
  });
  local.tests?.forEach((t) => {
    if (!isDeleted(t.id) && !isDeleted(t.subject_id)) {
      const existing = testMap.get(t.id);
      if (existing) {
        const remUpdated = existing.updated_at || existing.created_at;
        const locUpdated = t.updated_at || t.created_at;
        if (locUpdated >= remUpdated) testMap.set(t.id, t);
      } else {
        testMap.set(t.id, t);
      }
    }
  });

  // 7. Cascade dependent entity pruning & foreign key unassignment
  for (const folder of folderMap.values()) {
    if (folder.subject_id && (isDeleted(folder.subject_id) || !subjectMap.has(folder.subject_id))) {
      folder.subject_id = null;
    }
    if (folder.parent_folder_id && (isDeleted(folder.parent_folder_id) || !folderMap.has(folder.parent_folder_id))) {
      folder.parent_folder_id = null;
    }
  }

  for (const deck of deckMap.values()) {
    if (deck.folder_id && (isDeleted(deck.folder_id) || !folderMap.has(deck.folder_id))) {
      deck.folder_id = null;
    }
  }

  // 8. Questions, Analyses, Errors (pruned when test is deleted, merged by updated_at)
  const questionMap = new Map<string, TestQuestion>();
  const allQuestionIds = new Set<string>([
    ...(remote.test_questions || []).map((q) => q.id),
    ...(local.test_questions || []).map((q) => q.id),
  ]);
  const remQuestions = new Map((remote.test_questions || []).map((q) => [q.id, q]));
  const locQuestions = new Map((local.test_questions || []).map((q) => [q.id, q]));

  for (const qid of allQuestionIds) {
    if (isDeleted(qid)) continue;
    const loc = locQuestions.get(qid);
    const rem = remQuestions.get(qid);
    if (loc && !rem) {
      if (!isDeleted(loc.test_id) && testMap.has(loc.test_id)) questionMap.set(qid, loc);
    } else if (!loc && rem) {
      if (!isDeleted(rem.test_id) && testMap.has(rem.test_id)) questionMap.set(qid, rem);
    } else if (loc && rem) {
      if (isDeleted(loc.test_id) || !testMap.has(loc.test_id)) continue;
      const locUp = loc.updated_at || loc.created_at;
      const remUp = rem.updated_at || rem.created_at;
      if (locUp > remUp) {
        questionMap.set(qid, loc);
      } else if (remUp > locUp) {
        questionMap.set(qid, rem);
      } else {
        // Equal timestamp tie-breaker: prefer answered
        const locAnswered = Boolean(loc.user_answer || loc.score !== null);
        const remAnswered = Boolean(rem.user_answer || rem.score !== null);
        if (locAnswered && !remAnswered) {
          questionMap.set(qid, loc);
        } else {
          questionMap.set(qid, rem);
        }
      }
    }
  }

  const analysisMap = new Map<string, TestAnalysis>();
  const allAnalysisIds = new Set<string>([
    ...(remote.test_analyses || []).map((a) => a.id),
    ...(local.test_analyses || []).map((a) => a.id),
  ]);
  const remAnalyses = new Map((remote.test_analyses || []).map((a) => [a.id, a]));
  const locAnalyses = new Map((local.test_analyses || []).map((a) => [a.id, a]));
  for (const aid of allAnalysisIds) {
    if (isDeleted(aid)) continue;
    const loc = locAnalyses.get(aid);
    const rem = remAnalyses.get(aid);
    if (loc && !rem) {
      if (!isDeleted(loc.test_id) && testMap.has(loc.test_id)) analysisMap.set(aid, loc);
    } else if (!loc && rem) {
      if (!isDeleted(rem.test_id) && testMap.has(rem.test_id)) analysisMap.set(aid, rem);
    } else if (loc && rem) {
      if (isDeleted(loc.test_id) || !testMap.has(loc.test_id)) continue;
      const locUp = loc.updated_at || loc.created_at;
      const remUp = rem.updated_at || rem.created_at;
      analysisMap.set(aid, locUp >= remUp ? loc : rem);
    }
  }

  const errorMap = new Map<string, TestError>();
  const allErrorIds = new Set<string>([
    ...(remote.test_errors || []).map((e) => e.id),
    ...(local.test_errors || []).map((e) => e.id),
  ]);
  const remErrors = new Map((remote.test_errors || []).map((e) => [e.id, e]));
  const locErrors = new Map((local.test_errors || []).map((e) => [e.id, e]));
  for (const eid of allErrorIds) {
    if (isDeleted(eid)) continue;
    const loc = locErrors.get(eid);
    const rem = remErrors.get(eid);
    if (loc && !rem) {
      if (!isDeleted(loc.test_id) && testMap.has(loc.test_id)) errorMap.set(eid, loc);
    } else if (!loc && rem) {
      if (!isDeleted(rem.test_id) && testMap.has(rem.test_id)) errorMap.set(eid, rem);
    } else if (loc && rem) {
      if (isDeleted(loc.test_id) || !testMap.has(loc.test_id)) continue;
      const locUp = loc.updated_at || loc.created_at;
      const remUp = rem.updated_at || rem.created_at;
      errorMap.set(eid, locUp >= remUp ? loc : rem);
    }
  }

  // 9. FSRS parameters merged by timestamp
  let mergedFsrs = local.fsrs_parameters || remote.fsrs_parameters;
  let mergedFsrsUpdatedAt = local.fsrs_updated_at || remote.fsrs_updated_at;
  if (local.fsrs_parameters && remote.fsrs_parameters) {
    const locUp = local.fsrs_updated_at || "";
    const remUp = remote.fsrs_updated_at || "";
    if (remUp > locUp) {
      mergedFsrs = remote.fsrs_parameters;
      mergedFsrsUpdatedAt = remote.fsrs_updated_at;
    } else {
      mergedFsrs = local.fsrs_parameters;
      mergedFsrsUpdatedAt = local.fsrs_updated_at;
    }
  }

  return {
    version: "1.0",
    app_version: local.app_version || remote.app_version,
    exported_at: new Date().toISOString(),
    client_id: getClientId(),
    device_name: getDeviceName(),
    schema_version: Math.max(local.schema_version || 16, remote.schema_version || 16),
    min_compatible_app_version: local.min_compatible_app_version || remote.min_compatible_app_version,
    subjects: Array.from(subjectMap.values()),
    folders: Array.from(folderMap.values()),
    decks: Array.from(deckMap.values()),
    flashcards: Array.from(cardMap.values()),
    revision_history: Array.from(historyMap.values()),
    tests: Array.from(testMap.values()),
    test_questions: Array.from(questionMap.values()),
    test_analyses: Array.from(analysisMap.values()),
    test_errors: Array.from(errorMap.values()),
    fsrs_parameters: mergedFsrs,
    fsrs_updated_at: mergedFsrsUpdatedAt,
    notification_settings: local.notification_settings || remote.notification_settings,
    tombstones: Array.from(tombstoneMap.values()),
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

  await db.execute("BEGIN TRANSACTION");
  try {
    await db.execute("PRAGMA recursive_triggers = ON;");

    // 0. Apply tombstones: delete matching entities from local SQLite and store tombstones
    if (pkg.tombstones && pkg.tombstones.length > 0) {
      for (const t of pkg.tombstones) {
        switch (t.entity_type) {
          case "flashcard":
            await db.execute("DELETE FROM flashcards WHERE id = $1", [t.entity_id]);
            break;
          case "deck":
            await db.execute("DELETE FROM decks WHERE id = $1", [t.entity_id]);
            break;
          case "folder":
            await db.execute("DELETE FROM folders WHERE id = $1", [t.entity_id]);
            break;
          case "subject":
            await db.execute("DELETE FROM subjects WHERE id = $1", [t.entity_id]);
            break;
          case "test":
            await db.execute("DELETE FROM tests WHERE id = $1", [t.entity_id]);
            break;
          case "test_question":
            await db.execute("DELETE FROM test_questions WHERE id = $1", [t.entity_id]);
            break;
        }
        await db.execute(
          "INSERT OR REPLACE INTO sync_tombstones (entity_id, entity_type, deleted_at) VALUES ($1, $2, $3)",
          [t.entity_id, t.entity_type, t.deleted_at]
        );
      }
    }
    // Purge expired tombstones (> 60 days)
    await db.execute("DELETE FROM sync_tombstones WHERE deleted_at < datetime('now', '-60 days')");

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

    // 4. Flashcards (Diff-based FSRS delta writes, protecting local reviews)
    for (const c of pkg.flashcards || []) {
      const existing = cardMap.get(c.id);
      if (
        existing &&
        existing.last_review &&
        c.last_review &&
        existing.last_review > c.last_review
      ) {
        continue; // Local card was reviewed more recently, preserve it
      }

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
        continue; // Unchanged, skip disk write
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
        `INSERT OR REPLACE INTO tests (id, subject_id, name, description, source_type, source_data, score, max_score, test_date, time_limit_minutes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
          t.updated_at || t.created_at,
        ]
      );
    }

    const existingQMap = new Map((localQuestionRows || []).map((q) => [q.id, q]));
    for (const q of pkg.test_questions || []) {
      const existing = existingQMap.get(q.id);
      const optsStr = q.options
        ? typeof q.options === "string"
          ? q.options
          : JSON.stringify(q.options)
        : null;

      if (
        existing &&
        existing.question === q.question &&
        existing.type === q.type &&
        existing.correct_answer === (q.correct_answer || null) &&
        existing.user_answer === (q.user_answer || null) &&
        existing.score === (q.score ?? null) &&
        existing.math_work === (q.math_work || null)
      ) {
        continue;
      }
      await db.execute(
        `INSERT OR REPLACE INTO test_questions (id, test_id, type, question, options, correct_answer, user_answer, score, math_work, source_page, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
          q.updated_at || q.created_at,
        ]
      );
    }

    const existingAMap = new Map((localAnalysisRows || []).map((a) => [a.id, a]));
    for (const a of pkg.test_analyses || []) {
      const existing = existingAMap.get(a.id);
      if (
        existing &&
        existing.summary === a.summary &&
        existing.strengths === (a.strengths || null) &&
        existing.weaknesses === (a.weaknesses || null) &&
        existing.recommendations === (a.recommendations || null)
      ) {
        continue;
      }
      await db.execute(
        `INSERT OR REPLACE INTO test_analyses (id, test_id, subject_id, summary, strengths, weaknesses, recommendations, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          a.id,
          a.test_id,
          a.subject_id,
          a.summary,
          a.strengths || null,
          a.weaknesses || null,
          a.recommendations || null,
          a.created_at,
          a.updated_at || a.created_at,
        ]
      );
    }

    const existingEMap = new Map((localErrorRows || []).map((e) => [e.id, e]));
    for (const e of pkg.test_errors || []) {
      const existing = existingEMap.get(e.id);
      if (
        existing &&
        existing.question_text === e.question_text &&
        existing.user_answer === (e.user_answer || null) &&
        existing.correct_answer === (e.correct_answer || null) &&
        existing.error_reason === e.error_reason &&
        existing.score === (e.score ?? null)
      ) {
        continue;
      }
      await db.execute(
        `INSERT OR REPLACE INTO test_errors (id, test_id, subject_id, question_id, question_text, user_answer, correct_answer, error_reason, score, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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
          e.updated_at || e.created_at,
        ]
      );
    }

    // 7. FSRS Parameters
    if (pkg.fsrs_parameters) {
      const updatedAtVal = pkg.fsrs_updated_at || new Date().toISOString();
      await db.execute(
        "INSERT OR REPLACE INTO fsrs_parameters (id, params, updated_at) VALUES (1, $1, $2)",
        [pkg.fsrs_parameters, updatedAtVal]
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
        config.lastSyncedAt = normalizeSyncTimestamp(res.timestamp);
        lastLocalDataModifiedAt = getSyncTimestampMs(config.lastSyncedAt);
        saveWebDavConfig(config);
        await getStats().catch(() => {});
      }
      if (res.update_required && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("webdav-update-required", { detail: res }));
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
      if (remotePkg.schema_version && remotePkg.schema_version > 16) {
        const updateRes: SyncResult = {
          success: false,
          message: `Sync halted: Remote database schema v${remotePkg.schema_version} requires a newer version of Oxide Deck (current v16). Please update your app.`,
          timestamp: new Date().toISOString(),
          update_required: true,
          required_version: remotePkg.app_version || `v${remotePkg.schema_version}`,
        };
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("webdav-update-required", { detail: updateRes }));
          window.dispatchEvent(new CustomEvent("webdav-sync-completed", { detail: updateRes }));
        }
        return updateRes;
      }
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
  const lastSyncTime = getSyncTimestampMs(config.lastSyncedAt);
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
        config.lastSyncedAt = normalizeSyncTimestamp(res.timestamp);
        lastLocalDataModifiedAt = getSyncTimestampMs(config.lastSyncedAt);
        saveWebDavConfig(config);
      }
      if (res.update_required && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("webdav-update-required", { detail: res }));
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("webdav-sync-completed", { detail: res }));
      }
      return res;
    } catch (err: any) {
      const errRes: SyncResult = {
        success: false,
        message: `Force upload failed: ${err?.message || err}`,
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

    const successRes: SyncResult = {
      success: true,
      message: `Uploaded local database (${localPkg.flashcards.length} cards) to WebDAV.`,
      timestamp: nowIso,
    };
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("webdav-sync-completed", { detail: successRes }));
    }
    return successRes;
  } catch (err: any) {
    const errText = typeof err === "string" ? err : err?.message || (err ? JSON.stringify(err) : "Force upload failed.");
    const errRes: SyncResult = {
      success: false,
      message: `Force upload failed: ${errText}`,
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
        config.lastSyncedAt = normalizeSyncTimestamp(res.timestamp);
        lastLocalDataModifiedAt = getSyncTimestampMs(config.lastSyncedAt);
        saveWebDavConfig(config);
        await getStats().catch(() => {});
      }
      if (res.update_required && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("webdav-update-required", { detail: res }));
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("webdav-sync-completed", { detail: res }));
      }
      return res;
    } catch (err: any) {
      const errRes: SyncResult = {
        success: false,
        message: `Force download failed: ${err?.message || err}`,
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
    const remoteRawJson = await downloadSyncPackage(config);
    if (!remoteRawJson) {
      throw new Error("No remote synchronization file found on the WebDAV server.");
    }

    const remotePkg: SyncPackage = JSON.parse(remoteRawJson);
    if (remotePkg.schema_version && remotePkg.schema_version > 16) {
      const updateRes: SyncResult = {
        success: false,
        message: `Restore halted: Remote database schema v${remotePkg.schema_version} requires a newer version of Oxide Deck (current v16). Please update your app.`,
        timestamp: new Date().toISOString(),
        update_required: true,
        required_version: remotePkg.app_version || `v${remotePkg.schema_version}`,
      };
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("webdav-update-required", { detail: updateRes }));
        window.dispatchEvent(new CustomEvent("webdav-sync-completed", { detail: updateRes }));
      }
      return updateRes;
    }

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

    const successRes: SyncResult = {
      success: true,
      message: `Downloaded and restored database from WebDAV (${remotePkg.flashcards.length} cards).`,
      timestamp: nowIso,
    };
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("webdav-sync-completed", { detail: successRes }));
    }
    return successRes;
  } catch (err: any) {
    const errText = typeof err === "string" ? err : err?.message || (err ? JSON.stringify(err) : "Force download failed.");
    const errRes: SyncResult = {
      success: false,
      message: `Force download failed: ${errText}`,
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
