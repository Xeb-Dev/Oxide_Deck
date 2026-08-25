import type { TestQuestionType } from "../../services/db";

export type View = "list" | "edit" | "detail";
export type ScanTab = "text" | "pdf" | "image" | "manual";

export interface EditableQuestion {
  type: TestQuestionType;
  question: string;
  options: string[];
  correctAnswer: string;
  userAnswer: string;
  score: string;
  mathWork: string;
}

export const QUESTION_TYPES: TestQuestionType[] = [
  "multiple-choice",
  "short-answer",
  "long-answer",
  "true-false",
  "maths",
];

export function emptyQuestion(): EditableQuestion {
  return {
    type: "short-answer",
    question: "",
    options: [],
    correctAnswer: "",
    userAnswer: "",
    score: "",
    mathWork: "",
  };
}

export const SERVICE_UNAVAILABLE_MSG =
  "AI Service Unavailable (503). The AI provider is temporarily overloaded or unavailable. Please try again in a few moments.";
