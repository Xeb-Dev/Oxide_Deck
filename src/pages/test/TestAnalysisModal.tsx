import React from "react";
import { Sparkles, X } from "lucide-react";
import MathText from "../../components/MathText";
import type { FullTestAnalysisResult } from "../../services/llm";
import type { Test } from "../../services/db";

interface TestAnalysisModalProps {
  data: { test: Test; result: FullTestAnalysisResult } | null;
  onClose: () => void;
  onReanalyze: (test: Test, e?: React.MouseEvent) => void;
  onGoToScores: () => void;
}

export default function TestAnalysisModal({
  data,
  onClose,
  onReanalyze,
  onGoToScores,
}: TestAnalysisModalProps) {
  if (!data) return null;
  const { test, result } = data;

  return (
    <div className="notion-modal-overlay" style={{ zIndex: 1000, padding: "20px" }}>
      <div
        className="notion-modal"
        style={{
          width: "90vw",
          maxWidth: "900px",
          maxHeight: "88vh",
          overflowY: "auto",
          padding: "24px",
          borderRadius: "12px",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            paddingBottom: "12px",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: "1.2rem",
                color: "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Sparkles size={20} style={{ color: "var(--accent-color)" }} />
              AI Test Breakdown: {test.name}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "2px" }}>
              Diagnostic evaluation & error recording
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {result.calculatedScore != null && (
              <div
                style={{
                  padding: "4px 12px",
                  borderRadius: "20px",
                  backgroundColor: "var(--bg-secondary)",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  color: "var(--accent-color)",
                  border: "1px solid var(--border-color)",
                }}
              >
                Score: {result.calculatedScore} / {result.maxScore} (
                {Math.round(
                  (result.calculatedScore / (result.maxScore || 100)) * 100
                )}
                %)
              </div>
            )}
            <button
              className="theme-toggle-btn"
              onClick={onClose}
              style={{ padding: "6px" }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Summary */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--bg-secondary)",
              borderRadius: "10px",
              borderLeft: "4px solid var(--accent-color)",
            }}
          >
            <div
              style={{
                fontSize: "0.78rem",
                fontWeight: 700,
                color: "var(--accent-color)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Diagnostic Summary
            </div>
            <div
              style={{
                fontSize: "0.92rem",
                color: "var(--text-primary)",
                marginTop: "6px",
                lineHeight: 1.6,
              }}
            >
              {result.summary}
            </div>
          </div>

          {/* Strengths & Weaknesses */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "16px",
            }}
          >
            {result.strengths && (
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "rgba(16, 185, 129, 0.06)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: "10px",
                }}
              >
                <div
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    color: "var(--success-color)",
                    marginBottom: "6px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  💪 Concepts Mastered
                </div>
                <div style={{ fontSize: "0.88rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                  {result.strengths}
                </div>
              </div>
            )}

            {result.weaknesses && (
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "rgba(225, 29, 72, 0.06)",
                  border: "1px solid rgba(225, 29, 72, 0.25)",
                  borderRadius: "10px",
                }}
              >
                <div
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    color: "var(--danger-color)",
                    marginBottom: "6px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  ⚠️ Topic Gaps / Misconceptions
                </div>
                <div style={{ fontSize: "0.88rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                  {result.weaknesses}
                </div>
              </div>
            )}
          </div>

          {/* Recommendations */}
          {result.recommendations && (
            <div
              style={{
                padding: "16px",
                backgroundColor: "var(--bg-secondary)",
                borderRadius: "10px",
                border: "1px solid var(--border-color)",
              }}
            >
              <div
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  marginBottom: "6px",
                }}
              >
                📌 Study Advice & Next Steps
              </div>
              <div style={{ fontSize: "0.88rem", color: "var(--text-primary)", lineHeight: 1.6 }}>
                {result.recommendations}
              </div>
            </div>
          )}

          {/* Recorded Errors list */}
          <div>
            <div
              style={{
                fontWeight: 700,
                fontSize: "0.95rem",
                color: "var(--text-primary)",
                marginBottom: "12px",
              }}
            >
              Logged Mistakes ({result.errors.length}) — recorded to Scores tab:
            </div>
            {result.errors.length === 0 ? (
              <div
                style={{
                  padding: "16px",
                  textAlign: "center",
                  color: "var(--success-color)",
                  fontSize: "0.9rem",
                  backgroundColor: "rgba(16, 185, 129, 0.06)",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                  borderRadius: "8px",
                }}
              >
                🎉 Perfect score! No errors were recorded for this test.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {result.errors.map((err, i) => (
                  <div
                    key={i}
                    style={{
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                      padding: "14px",
                      backgroundColor: "var(--bg-primary)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                      <MathText>{err.questionText}</MathText>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "4px" }}>
                      <div
                        style={{
                          padding: "8px 10px",
                          backgroundColor: "rgba(225, 29, 72, 0.05)",
                          border: "1px solid rgba(225, 29, 72, 0.2)",
                          borderRadius: "6px",
                        }}
                      >
                        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--danger-color)", marginBottom: "2px" }}>
                          Your answer:
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>
                          {err.userAnswer ? (
                            <MathText>{err.userAnswer}</MathText>
                          ) : (
                            <span style={{ fontStyle: "italic", opacity: 0.7 }}>(Blank)</span>
                          )}
                        </div>
                      </div>
                      <div
                        style={{
                          padding: "8px 10px",
                          backgroundColor: "rgba(16, 185, 129, 0.05)",
                          border: "1px solid rgba(16, 185, 129, 0.2)",
                          borderRadius: "6px",
                        }}
                      >
                        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--success-color)", marginBottom: "2px" }}>
                          Correct answer:
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>
                          {err.correctAnswer ? (
                            <MathText>{err.correctAnswer}</MathText>
                          ) : (
                            <span style={{ fontStyle: "italic", opacity: 0.7 }}>(N/A)</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        marginTop: "4px",
                        padding: "10px",
                        backgroundColor: "var(--bg-secondary)",
                        borderRadius: "6px",
                        borderLeft: "3px solid var(--accent-color)",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent-color)", marginBottom: "2px" }}>
                        💡 AI Explanation & Study Tip:
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                        <MathText>{err.errorReason}</MathText>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "20px",
            paddingTop: "12px",
            borderTop: "1px solid var(--border-color)",
          }}
        >
          <button
            className="notion-btn secondary"
            onClick={(e) => {
              const t = test;
              onClose();
              onReanalyze(t, e);
            }}
            style={{ padding: "8px 14px", fontSize: "0.85rem" }}
            title="Re-run AI diagnostic analysis on this test"
          >
            <Sparkles size={14} /> Re-analyze with AI
          </button>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              className="notion-btn secondary"
              onClick={onClose}
              style={{ padding: "8px 16px" }}
            >
              Close
            </button>
            <button
              className="notion-btn primary"
              onClick={() => {
                onClose();
                onGoToScores();
              }}
              style={{ padding: "8px 16px" }}
            >
              Go to Scores Tab
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
