import { getDB } from "./connection";
import type { GlobalSearchResult } from "./types";

/**
 * Global Unified Search engine across flashcards, folders, decks, subjects, tests, study focus points, and AI insights.
 */
export async function searchGlobal(rawQuery: string): Promise<GlobalSearchResult> {
  const query = rawQuery.trim();
  if (!query) {
    return {
      flashcards: [],
      foldersAndDecks: [],
      tests: [],
      studyFocusPoints: [],
      aiInsights: [],
    };
  }

  const db = await getDB();
  const searchPattern = `%${query}%`;

  // 1. Search Flashcards (using FTS5 if available with fallback to LIKE)
  let flashcardRows: {
    id: string;
    deck_id: string;
    deck_name: string;
    front: string;
    back: string;
    tags: string | null;
  }[] = [];

  try {
    const ftsQuery = `"${query.replace(/"/g, '""')}"*`;
    flashcardRows = await db.select(
      `SELECT f.id, f.deck_id, d.name as deck_name, f.front, f.back, f.tags
       FROM flashcards f
       JOIN decks d ON f.deck_id = d.id
       WHERE f.id IN (SELECT id FROM flashcards_fts WHERE flashcards_fts MATCH $1)
       LIMIT 15`,
      [ftsQuery]
    );
  } catch {
    // Fallback to LIKE search if FTS5 query format fails or is building
    flashcardRows = await db.select(
      `SELECT f.id, f.deck_id, d.name as deck_name, f.front, f.back, f.tags
       FROM flashcards f
       JOIN decks d ON f.deck_id = d.id
       WHERE f.front LIKE $1 OR f.back LIKE $1 OR f.tags LIKE $1
       LIMIT 15`,
      [searchPattern]
    );
  }

  // 2. Search Subjects, Folders, and Decks
  const foldersAndDecks: GlobalSearchResult["foldersAndDecks"] = [];

  const matchedSubjects = await db.select<{ id: string; name: string; icon: string | null }[]>(
    "SELECT id, name, icon FROM subjects WHERE name LIKE $1 LIMIT 5",
    [searchPattern]
  );
  matchedSubjects.forEach((s) =>
    foldersAndDecks.push({
      id: s.id,
      type: "subject",
      name: s.name,
      icon: s.icon || "📚",
      subject_id: s.id,
    })
  );

  const matchedFolders = await db.select<
    { id: string; name: string; icon: string | null; subject_id: string | null }[]
  >("SELECT id, name, icon, subject_id FROM folders WHERE name LIKE $1 LIMIT 5", [
    searchPattern,
  ]);
  matchedFolders.forEach((f) =>
    foldersAndDecks.push({
      id: f.id,
      type: "folder",
      name: f.name,
      icon: f.icon || "📁",
      folder_id: f.id,
      subject_id: f.subject_id,
    })
  );

  const matchedDecks = await db.select<
    { id: string; name: string; icon: string | null; folder_id: string | null }[]
  >("SELECT id, name, icon, folder_id FROM decks WHERE name LIKE $1 OR description LIKE $1 LIMIT 5", [
    searchPattern,
  ]);
  matchedDecks.forEach((d) =>
    foldersAndDecks.push({
      id: d.id,
      type: "deck",
      name: d.name,
      icon: d.icon || "🎴",
      folder_id: d.folder_id,
    })
  );

  // 3. Search Tests & Exams
  const matchedTests = await db.select<
    {
      id: string;
      name: string;
      description: string | null;
      score: number | null;
      max_score: number;
      test_date: string | null;
    }[]
  >(
    "SELECT id, name, description, score, max_score, test_date FROM tests WHERE name LIKE $1 OR description LIKE $1 LIMIT 5",
    [searchPattern]
  );

  // 4. Search Study Focus Points (test_errors)
  const matchedFocusPoints = await db.select<
    {
      id: string;
      test_id: string;
      test_name: string;
      subject_name: string;
      question_text: string;
      user_answer: string | null;
      correct_answer: string | null;
      error_reason: string;
    }[]
  >(
    `SELECT e.id, e.test_id, COALESCE(t.name, 'Test') as test_name, COALESCE(s.name, 'Subject') as subject_name,
            e.question_text, e.user_answer, e.correct_answer, e.error_reason
     FROM test_errors e
     LEFT JOIN tests t ON e.test_id = t.id
     LEFT JOIN subjects s ON e.subject_id = s.id
     WHERE e.question_text LIKE $1 OR e.user_answer LIKE $1 OR e.correct_answer LIKE $1 OR e.error_reason LIKE $1
     LIMIT 5`,
    [searchPattern]
  );

  // 5. Search AI Insights (test_analyses)
  const matchedInsights = await db.select<
    {
      id: string;
      test_id: string;
      test_name: string;
      subject_name: string;
      summary: string;
      strengths: string | null;
      weaknesses: string | null;
      recommendations: string | null;
    }[]
  >(
    `SELECT a.id, a.test_id, COALESCE(t.name, 'Test') as test_name, COALESCE(s.name, 'Subject') as subject_name,
            a.summary, a.strengths, a.weaknesses, a.recommendations
     FROM test_analyses a
     LEFT JOIN tests t ON a.test_id = t.id
     LEFT JOIN subjects s ON a.subject_id = s.id
     WHERE a.summary LIKE $1 OR a.strengths LIKE $1 OR a.weaknesses LIKE $1 OR a.recommendations LIKE $1
     LIMIT 5`,
    [searchPattern]
  );

  return {
    flashcards: flashcardRows,
    foldersAndDecks,
    tests: matchedTests,
    studyFocusPoints: matchedFocusPoints,
    aiInsights: matchedInsights,
  };
}
