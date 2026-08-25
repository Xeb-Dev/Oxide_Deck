export interface Subject {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  created_at: string;
}

export interface Folder {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  subject_id: string | null;
  parent_folder_id: string | null;
  created_at: string;
}

export interface Deck {
  id: string;
  folder_id: string | null;
  name: string;
  icon: string | null;
  description: string | null;
  created_at: string;
}

export interface Flashcard {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  tags: string | null;
  /** @deprecated SM-2 ease factor — kept for rollback safety. Use `difficulty`/`stability`. */
  ease: number;
  /** @deprecated SM-2 interval — kept for rollback safety. Use `scheduled_days`. */
  interval_days: number;
  /** @deprecated SM-2 consecutive reps — kept for rollback safety. Use `reps`. */
  repetitions: number;
  /** ISO datetime of next due review. Source of truth for the due query. */
  next_review: string;
  created_at: string;
  // FSRS fields (added in migration v4)
  stability: number;
  difficulty: number;
  /** 0=New, 1=Learning, 2=Review, 3=Relearning */
  state: number;
  reps: number;
  lapses: number;
  elapsed_days: number;
  scheduled_days: number;
  last_review: string | null;
  image_url?: string | null;
  front_image_url?: string | null;
  back_image_url?: string | null;
}

export interface RevisionHistory {
  id: string;
  flashcard_id: string | null;
  type: 'flashcard' | 'quiz' | 'mock' | 'teach';
  score: number;
  reviewed_at: string;
  /** FSRS Rating (1=Again, 2=Hard, 3=Good, 4=Easy). Null for legacy/quiz rows. */
  rating: number | null;
}

export interface Stats {
  totalReviews: number;
  averageScore: number;
  cardsReviewedToday: number;
  streakDays: number;
  streakTargetToday: number;
  streakProgressToday: number;
  streakConditionMetToday: boolean;
  weeklyProgress: { day: string; count: number; avg_score: number }[];
}

export interface FsrsParametersInfo {
  w: number[];
  updatedAt: string | null;
  isDefault: boolean;
  reviewCount: number;
}

export interface Test {
  id: string;
  subject_id: string;
  name: string;
  description: string | null;
  source_type: 'manual' | 'text' | 'pdf' | 'image';
  source_data: string | null;
  score: number | null;
  max_score: number;
  test_date: string | null;
  /** Allocated time limit / duration in minutes (e.g. 60 or 90). */
  time_limit_minutes: number | null;
  created_at: string;
}

export type TestQuestionType = 'multiple-choice' | 'short-answer' | 'long-answer' | 'true-false' | 'maths';

export interface TestQuestion {
  id: string;
  test_id: string;
  type: TestQuestionType;
  question: string;
  options: string[] | null;
  correct_answer: string | null;
  /** The student's answer as written on the test, if captured. */
  user_answer: string | null;
  score: number | null;
  /** Step-by-step mathematical working out or derivation, if applicable. */
  math_work: string | null;
  source_page: number | null;
  created_at: string;
}

export interface TestTrendPoint {
  test_date: string;
  scorePct: number;
  testName: string;
}

export interface TestAnalysis {
  id: string;
  test_id: string;
  subject_id: string;
  summary: string;
  strengths: string | null;
  weaknesses: string | null;
  recommendations: string | null;
  created_at: string;
}

export interface TestError {
  id: string;
  test_id: string;
  subject_id: string;
  question_id: string | null;
  question_text: string;
  user_answer: string | null;
  correct_answer: string | null;
  error_reason: string;
  score: number | null;
  created_at: string;
  test_name?: string;
  subject_name?: string;
}

export interface GlobalSearchResult {
  flashcards: {
    id: string;
    deck_id: string;
    deck_name: string;
    front: string;
    back: string;
    tags: string | null;
  }[];
  foldersAndDecks: {
    id: string;
    type: 'folder' | 'deck' | 'subject';
    name: string;
    icon: string | null;
    folder_id?: string | null;
    subject_id?: string | null;
  }[];
  tests: {
    id: string;
    name: string;
    description: string | null;
    score: number | null;
    max_score: number;
    test_date: string | null;
  }[];
  studyFocusPoints: {
    id: string;
    test_id: string;
    test_name: string;
    subject_name: string;
    question_text: string;
    user_answer: string | null;
    correct_answer: string | null;
    error_reason: string;
  }[];
  aiInsights: {
    id: string;
    test_id: string;
    test_name: string;
    subject_name: string;
    summary: string;
    strengths: string | null;
    weaknesses: string | null;
    recommendations: string | null;
  }[];
}
