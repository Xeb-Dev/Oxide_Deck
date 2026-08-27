import { getDB, generateUUID } from "./connection";
import type {
  Test,
  TestQuestion,
  TestQuestionType,
  TestTrendPoint,
  TestAnalysis,
  TestError,
} from "./types";
import { triggerBackgroundSyncIfEnabled } from "../syncEngine";

export async function getTests(): Promise<Test[]> {
  const db = await getDB();
  return db.select<Test[]>("SELECT * FROM tests ORDER BY test_date DESC");
}

export async function getTestsBySubject(subjectId: string): Promise<Test[]> {
  const db = await getDB();
  return db.select<Test[]>(
    "SELECT * FROM tests WHERE subject_id = $1 ORDER BY datetime(test_date) ASC",
    [subjectId]
  );
}

export async function getTest(id: string): Promise<Test | null> {
  const db = await getDB();
  const rows = await db.select<Test[]>("SELECT * FROM tests WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function createTest(
  subjectId: string,
  name: string,
  description: string | null,
  sourceType: Test["source_type"],
  sourceData: string | null,
  score: number | null,
  maxScore: number,
  testDate: string | null,
  timeLimitMinutes: number | null = null
): Promise<Test> {
  const db = await getDB();
  const id = generateUUID();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO tests (id, subject_id, name, description, source_type, source_data, score, max_score, test_date, time_limit_minutes, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
    [
      id,
      subjectId,
      name,
      description,
      sourceType,
      sourceData,
      score,
      maxScore,
      testDate,
      timeLimitMinutes,
      now,
    ]
  );
  triggerBackgroundSyncIfEnabled("new test");
  return {
    id,
    subject_id: subjectId,
    name,
    description,
    source_type: sourceType,
    source_data: sourceData,
    score,
    max_score: maxScore,
    test_date: testDate,
    time_limit_minutes: timeLimitMinutes,
    created_at: now,
  };
}

export async function updateTest(
  id: string,
  name: string,
  description: string | null,
  score: number | null,
  maxScore: number,
  testDate: string | null,
  timeLimitMinutes: number | null = null
): Promise<void> {
  const db = await getDB();
  await db.execute(
    "UPDATE tests SET name = $1, description = $2, score = $3, max_score = $4, test_date = $5, time_limit_minutes = $6 WHERE id = $7",
    [name, description, score, maxScore, testDate, timeLimitMinutes, id]
  );
  triggerBackgroundSyncIfEnabled("update test");
}

export async function deleteTest(id: string): Promise<void> {
  const db = await getDB();
  await db.execute("DELETE FROM tests WHERE id = $1", [id]);
  triggerBackgroundSyncIfEnabled("delete test");
}

export async function getTestQuestions(testId: string): Promise<TestQuestion[]> {
  const db = await getDB();
  const rows = await db.select<(Omit<TestQuestion, "options"> & { options: string | null })[]>(
    "SELECT * FROM test_questions WHERE test_id = $1 ORDER BY created_at ASC",
    [testId]
  );
  return rows.map((r) => ({
    ...r,
    options: r.options ? (JSON.parse(r.options) as string[]) : null,
  }));
}

export async function createTestQuestion(
  testId: string,
  type: TestQuestionType,
  question: string,
  options: string[] | null,
  correctAnswer: string | null,
  userAnswer: string | null = null,
  score: number | null = null,
  mathWork: string | null = null,
  sourcePage: number | null = null
): Promise<void> {
  const db = await getDB();
  const id = generateUUID();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO test_questions (id, test_id, type, question, options, correct_answer, user_answer, score, math_work, source_page, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
    [
      id,
      testId,
      type,
      question,
      options ? JSON.stringify(options) : null,
      correctAnswer,
      userAnswer,
      score,
      mathWork,
      sourcePage,
      now,
    ]
  );
}

export async function deleteTestQuestions(testId: string): Promise<void> {
  const db = await getDB();
  await db.execute("DELETE FROM test_questions WHERE test_id = $1", [testId]);
}

export async function bulkCreateTestQuestions(
  testId: string,
  questions: {
    type: TestQuestionType;
    question: string;
    options: string[] | null;
    correctAnswer: string | null;
    userAnswer?: string | null;
    score?: number | null;
    mathWork?: string | null;
    sourcePage: number | null;
  }[]
): Promise<void> {
  for (const q of questions) {
    await createTestQuestion(
      testId,
      q.type,
      q.question,
      q.options,
      q.correctAnswer,
      q.userAnswer ?? null,
      q.score ?? null,
      q.mathWork ?? null,
      q.sourcePage
    );
  }
}

export async function getSubjectTestTrend(subjectId: string): Promise<TestTrendPoint[]> {
  const db = await getDB();
  const rows = await db.select<{ id: string; name: string; test_date: string; score: number; max_score: number }[]>(
    "SELECT id, name, test_date, score, max_score FROM tests WHERE subject_id = $1 AND score IS NOT NULL AND test_date IS NOT NULL ORDER BY datetime(test_date) ASC",
    [subjectId]
  );
  return rows.map((r) => ({
    test_date: r.test_date,
    scorePct: r.max_score > 0 ? Math.round((r.score / r.max_score) * 100) : 0,
    testName: r.name,
  }));
}

export async function saveTestAnalysis(
  testId: string,
  subjectId: string,
  summary: string,
  strengths: string | null,
  weaknesses: string | null,
  recommendations: string | null,
  errors: {
    questionId?: string | null;
    questionText: string;
    userAnswer?: string | null;
    correctAnswer?: string | null;
    errorReason: string;
    score?: number | null;
  }[]
): Promise<void> {
  const db = await getDB();
  const now = new Date().toISOString();

  // Clean up existing analysis & errors for this test before re-analyzing
  await db.execute("DELETE FROM test_analyses WHERE test_id = $1", [testId]);
  await db.execute("DELETE FROM test_errors WHERE test_id = $1", [testId]);

  const analysisId = generateUUID();
  await db.execute(
    "INSERT INTO test_analyses (id, test_id, subject_id, summary, strengths, weaknesses, recommendations, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [analysisId, testId, subjectId, summary, strengths, weaknesses, recommendations, now]
  );

  for (const err of errors) {
    const errorId = generateUUID();
    await db.execute(
      "INSERT INTO test_errors (id, test_id, subject_id, question_id, question_text, user_answer, correct_answer, error_reason, score, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
      [
        errorId,
        testId,
        subjectId,
        err.questionId ?? null,
        err.questionText,
        err.userAnswer ?? null,
        err.correctAnswer ?? null,
        err.errorReason,
        err.score ?? null,
        now,
      ]
    );
  }
  triggerBackgroundSyncIfEnabled("save test analysis");
}

export async function getTestErrors(subjectId?: string): Promise<TestError[]> {
  const db = await getDB();
  let query = `
    SELECT e.*, t.name as test_name, s.name as subject_name
    FROM test_errors e
    LEFT JOIN tests t ON e.test_id = t.id
    LEFT JOIN subjects s ON e.subject_id = s.id
  `;
  const params: any[] = [];
  if (subjectId && subjectId !== "all") {
    query += " WHERE e.subject_id = $1";
    params.push(subjectId);
  }
  query += " ORDER BY datetime(e.created_at) DESC";
  return await db.select<TestError[]>(query, params);
}

export async function getTestAnalysisByTestId(testId: string): Promise<TestAnalysis | null> {
  const db = await getDB();
  const rows = await db.select<TestAnalysis[]>(
    "SELECT * FROM test_analyses WHERE test_id = $1 LIMIT 1",
    [testId]
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function getAllTestAnalyses(): Promise<TestAnalysis[]> {
  const db = await getDB();
  return await db.select<TestAnalysis[]>("SELECT * FROM test_analyses");
}

export async function getTestErrorsByTestId(testId: string): Promise<TestError[]> {
  const db = await getDB();
  return await db.select<TestError[]>(
    "SELECT * FROM test_errors WHERE test_id = $1 ORDER BY datetime(created_at) DESC",
    [testId]
  );
}
