import { useState } from "react";
import {
  ChevronLeft,
  Eye,
  Sparkles,
  Edit3,
  Trash2,
  Loader2,
  Clock,
  MessageSquare,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import MathText from "../../components/MathText";
import { reviewTestAnswers, TestQuestionReview } from "../../services/llm";
import type { Test, TestQuestion, Subject } from "../../services/db";

interface TestDetailViewProps {
  test: Test;
  questions: TestQuestion[];
  subject: Subject | null;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAnalyse: () => void;
  analyzing: boolean;
  hasAnalysis?: boolean;
  onReviewAnalysis?: () => void;
}

export default function TestDetailView({
  test,
  questions,
  subject,
  onBack,
  onEdit,
  onDelete,
  onAnalyse,
  analyzing,
  hasAnalysis,
  onReviewAnalysis,
}: TestDetailViewProps) {
  const pct =
    test.max_score > 0 && test.score != null
      ? Math.round((test.score / test.max_score) * 100)
      : null;

  // Answer-entry + AI review state
  const [userAnswers, setUserAnswers] = useState<string[]>(() =>
    questions.map((q) => q.user_answer ?? "")
  );
  const [reviews, setReviews] = useState<(TestQuestionReview | null)[]>(() =>
    questions.map(() => null)
  );
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [showReviewMode, setShowReviewMode] = useState(false);

  const handleAnswerChange = (idx: number, value: string) => {
    setUserAnswers((prev) => prev.map((a, i) => (i === idx ? value : a)));
  };

  const handleStartReview = () => {
    setShowReviewMode(true);
    setReviews(questions.map(() => null));
    setReviewError(null);
  };

  const handleRunAIReview = async () => {
    if (questions.length === 0) return;
    setReviewing(true);
    setReviewError(null);
    try {
      const result = await reviewTestAnswers(
        questions.map((q) => ({
          question: q.question,
          type: q.type,
          options: q.options,
          correctAnswer: q.correct_answer,
        })),
        userAnswers
      );
      // Map results back by questionIndex
      const byIndex: Record<number, TestQuestionReview> = {};
      for (const r of result) byIndex[r.questionIndex] = r;
      setReviews(questions.map((_, i) => byIndex[i] ?? null));
    } catch (e: any) {
      console.error(e);
      setReviewError(e?.message || "AI review failed.");
    } finally {
      setReviewing(false);
    }
  };

  const handleExitReview = () => {
    setShowReviewMode(false);
    setReviews(questions.map(() => null));
    setReviewError(null);
  };

  const correctCount = reviews.filter((r) => r?.isCorrect).length;
  const reviewedCount = reviews.filter((r) => r !== null).length;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          className="notion-btn secondary"
          onClick={onBack}
          style={{ padding: "6px 10px" }}
        >
          <ChevronLeft size={16} />
        </button>
        <h1 className="page-title" style={{ margin: 0, flex: 1 }}>
          {test.name}
        </h1>
        {!showReviewMode && (
          <div style={{ display: "flex", gap: "8px" }}>
            {hasAnalysis ? (
              <button
                className="notion-btn secondary"
                onClick={onReviewAnalysis}
                title="Review saved AI analysis and error breakdown"
              >
                <Eye size={14} /> Review the analysis
              </button>
            ) : (
              <button
                className="notion-btn primary"
                onClick={onAnalyse}
                disabled={analyzing}
              >
                {analyzing ? (
                  <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <Sparkles size={14} />
                )}
                Analyse using AI
              </button>
            )}
            <button className="notion-btn secondary" onClick={onEdit}>
              <Edit3 size={14} /> Edit
            </button>
            <button className="notion-btn danger" onClick={onDelete}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        )}
        {showReviewMode && (
          <button className="notion-btn secondary" onClick={handleExitReview}>
            Exit Review
          </button>
        )}
      </div>
      <div className="divider" />

      <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "700px" }}>
        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
          {subject && (
            <div className="test-meta-item">
              <div className="test-meta-label">Subject</div>
              <div>
                {subject.icon || "📚"} {subject.name}
              </div>
            </div>
          )}
          {test.test_date && (
            <div className="test-meta-item">
              <div className="test-meta-label">Date</div>
              <div>{new Date(test.test_date).toLocaleDateString()}</div>
            </div>
          )}
          {test.time_limit_minutes != null && (
            <div className="test-meta-item">
              <div className="test-meta-label">Time Allowed</div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <Clock size={14} style={{ color: "var(--accent-color)" }} />
                {test.time_limit_minutes} minutes
              </div>
            </div>
          )}
          {test.score != null && (
            <div className="test-meta-item">
              <div className="test-meta-label">Score</div>
              <div>
                {test.score} / {test.max_score}
                {pct != null && (
                  <span
                    className={`test-score-badge ${
                      pct >= 80 ? "good" : pct >= 50 ? "ok" : "low"
                    }`}
                    style={{ marginLeft: "8px" }}
                  >
                    {pct}%
                  </span>
                )}
              </div>
            </div>
          )}
          {test.source_type !== "manual" && (
            <div className="test-meta-item">
              <div className="test-meta-label">Source</div>
              <div>{test.source_type}</div>
            </div>
          )}
        </div>

        {test.description && (
          <div>
            <div className="test-meta-label">Description</div>
            <div style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "4px" }}>
              {test.description}
            </div>
          </div>
        )}

        {/* AI Review banner */}
        {!showReviewMode && questions.length > 0 && (
          <div className="test-review-cta">
            <div>
              <div
                style={{
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <MessageSquare size={16} style={{ color: "var(--accent-color)" }} /> AI Answer
                Review
              </div>
              <div
                style={{
                  fontSize: "0.82rem",
                  color: "var(--text-secondary)",
                  marginTop: "4px",
                }}
              >
                Enter the answers you wrote on this test and let AI comment on each question —
                especially the ones you got wrong.
              </div>
            </div>
            <button className="notion-btn primary" onClick={handleStartReview}>
              <Sparkles size={14} /> Review My Answers
            </button>
          </div>
        )}

        {showReviewMode && (
          <div className="test-review-controls">
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              {reviewedCount > 0 ? (
                <>
                  AI reviewed <strong>{reviewedCount}</strong> of {questions.length} questions ·{" "}
                  <strong style={{ color: "var(--success-color)" }}>
                    {correctCount} correct
                  </strong>
                </>
              ) : (
                <>Enter your answers below, then click "Run AI Review".</>
              )}
            </div>
            <button
              className="notion-btn primary"
              onClick={handleRunAIReview}
              disabled={reviewing}
            >
              {reviewing ? (
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <Sparkles size={14} />
              )}
              Run AI Review
            </button>
          </div>
        )}

        {reviewError && (
          <div
            style={{
              padding: "10px 12px",
              border: "1px solid var(--danger-color)",
              borderRadius: "8px",
              backgroundColor: "var(--danger-light)",
              color: "var(--danger-color)",
              fontSize: "0.85rem",
            }}
          >
            {reviewError}
          </div>
        )}

        {test.source_data && !showReviewMode && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
              <Eye size={16} style={{ color: "var(--accent-color)" }} />
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Original Source</span>
            </div>
            {test.source_type === "text" && <pre className="test-source-text">{test.source_data}</pre>}
            {test.source_type === "image" &&
              (() => {
                let urls: string[] = [];
                try {
                  const parsed = JSON.parse(test.source_data);
                  if (Array.isArray(parsed)) urls = parsed;
                  else urls = [test.source_data];
                } catch {
                  urls = [test.source_data];
                }
                return (
                  <div className="test-image-gallery">
                    {urls.map((url, i) => (
                      <div key={i} className="test-image-thumb">
                        <img src={url} alt={`Test source ${i + 1}`} />
                      </div>
                    ))}
                  </div>
                );
              })()}
            {test.source_type === "pdf" && (
              <div
                style={{
                  fontSize: "0.85rem",
                  color: "var(--text-muted)",
                  padding: "12px",
                  border: "1px dashed var(--border-color)",
                  borderRadius: "8px",
                }}
              >
                PDF source stored ({Math.round(test.source_data.length / 1024)} KB base64). PDF preview in
                detail view is deferred.
              </div>
            )}
          </div>
        )}

        <div>
          <div
            style={{
              fontWeight: 600,
              marginBottom: "10px",
              color: "var(--text-primary)",
            }}
          >
            Questions ({questions.length})
            {showReviewMode && " — enter your answers"}
          </div>
          {questions.length === 0 ? (
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "0.85rem",
              }}
            >
              No questions saved for this test.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {questions.map((q, idx) => {
                const review = reviews[idx];
                const hasReview = review !== null;
                return (
                  <div
                    key={q.id}
                    className={`test-question-card ${
                      hasReview
                        ? review!.isCorrect
                          ? "review-correct"
                          : "review-wrong"
                        : ""
                    }`}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "6px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          color: "var(--accent-color)",
                          textTransform: "uppercase",
                        }}
                      >
                        {q.type}
                      </span>
                      <div>
                        {q.score != null && (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              color: "var(--text-secondary)",
                              marginRight: "8px",
                            }}
                          >
                            Score: {q.score}
                          </span>
                        )}
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          Q{idx + 1}
                        </span>
                      </div>
                    </div>
                    <div style={{ color: "var(--text-primary)", fontSize: "0.9rem" }}>
                      {q.question}
                    </div>
                    {q.options && q.options.length > 0 && !showReviewMode && (
                      <ul
                        style={{
                          margin: "6px 0 0 20px",
                          padding: 0,
                          fontSize: "0.85rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {q.options.map((o: string, i: number) => (
                          <li key={i}>{o}</li>
                        ))}
                      </ul>
                    )}

                    {showReviewMode && (
                      <div style={{ marginTop: "10px" }}>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                            marginBottom: "4px",
                          }}
                        >
                          Your answer:
                        </div>
                        {q.type === "multiple-choice" && q.options && q.options.length > 0 ? (
                          <select
                            className="form-input"
                            value={userAnswers[idx]}
                            onChange={(e) => handleAnswerChange(idx, e.target.value)}
                            disabled={reviewing}
                          >
                            <option value="">— Select an option —</option>
                            {q.options.map((o: string, i: number) => (
                              <option key={i} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        ) : q.type === "true-false" ? (
                          <select
                            className="form-input"
                            value={userAnswers[idx]}
                            onChange={(e) => handleAnswerChange(idx, e.target.value)}
                            disabled={reviewing}
                          >
                            <option value="">— Select —</option>
                            <option value="true">True</option>
                            <option value="false">False</option>
                          </select>
                        ) : (
                          <textarea
                            className="form-input"
                            value={userAnswers[idx]}
                            onChange={(e) => handleAnswerChange(idx, e.target.value)}
                            rows={2}
                            placeholder="Type your answer…"
                            disabled={reviewing}
                          />
                        )}
                      </div>
                    )}

                    {!showReviewMode && q.user_answer && (
                      <div
                        style={{
                          marginTop: "6px",
                          fontSize: "0.85rem",
                          color: "var(--text-primary)",
                          backgroundColor: "var(--bg-secondary)",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          display: "inline-block",
                        }}
                      >
                        <strong>Your answer:</strong> {q.user_answer}
                      </div>
                    )}

                    {(q.math_work || q.type === "maths") && (
                      <div
                        style={{
                          marginTop: "8px",
                          padding: "10px 14px",
                          backgroundColor: "var(--bg-secondary)",
                          borderRadius: "6px",
                          border: "1px solid var(--border-color)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "var(--accent-color)",
                            marginBottom: "4px",
                          }}
                        >
                          🧮 Math Work & Steps Shown
                        </div>
                        {q.math_work ? (
                          <MathText
                            style={{
                              fontSize: "0.9rem",
                              color: "var(--text-primary)",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {q.math_work}
                          </MathText>
                        ) : (
                          <span
                            style={{
                              fontSize: "0.8rem",
                              color: "var(--text-muted)",
                              fontStyle: "italic",
                            }}
                          >
                            No math working out recorded for this question.
                          </span>
                        )}
                      </div>
                    )}

                    {!showReviewMode && q.correct_answer && (
                      <div
                        style={{
                          marginTop: "4px",
                          fontSize: "0.8rem",
                          color: "var(--success-color)",
                        }}
                      >
                        ✓ Correct answer: {q.correct_answer}
                      </div>
                    )}

                    {hasReview && (
                      <div className="test-review-feedback">
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            marginBottom: "6px",
                          }}
                        >
                          {review!.isCorrect ? (
                            <CheckCircle2 size={16} style={{ color: "var(--success-color)" }} />
                          ) : (
                            <XCircle size={16} style={{ color: "var(--danger-color)" }} />
                          )}
                          <span
                            style={{
                              fontWeight: 600,
                              fontSize: "0.82rem",
                              color: review!.isCorrect
                                ? "var(--success-color)"
                                : "var(--danger-color)",
                            }}
                          >
                            {review!.isCorrect ? "Correct" : "Incorrect"}
                          </span>
                        </div>
                        {review!.correctAnswer && (
                          <div
                            style={{
                              fontSize: "0.8rem",
                              color: "var(--text-secondary)",
                              marginBottom: "4px",
                            }}
                          >
                            <strong>Correct answer:</strong> {review!.correctAnswer}
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: "0.85rem",
                            color: "var(--text-primary)",
                            lineHeight: 1.5,
                          }}
                        >
                          {review!.feedback}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
