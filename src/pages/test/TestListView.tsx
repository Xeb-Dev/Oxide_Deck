import React from "react";
import {
  ChevronLeft,
  Plus,
  Clock,
  Loader2,
  Sparkles,
  Eye,
  BarChart3,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { Subject, Test, TestTrendPoint, TestAnalysis } from "../../services/db";

interface TestListViewProps {
  subjects: Subject[];
  testsBySubject: Record<string, Test[]>;
  trendBySubject: Record<string, TestTrendPoint[]>;
  expandedSubject: string | null;
  toggleSubject: (subjectId: string) => void;
  startAddTest: (subjectId: string) => void;
  openDetail: (test: Test) => void;
  analyzingTestId: string | null;
  analyzedTestMap: Record<string, TestAnalysis>;
  handleReviewTestAnalysis: (test: Test, e?: React.MouseEvent) => void;
  handleAnalyseTestWithAI: (test: Test, e?: React.MouseEvent) => void;
}

export default function TestListView({
  subjects,
  testsBySubject,
  trendBySubject,
  expandedSubject,
  toggleSubject,
  startAddTest,
  openDetail,
  analyzingTestId,
  analyzedTestMap,
  handleReviewTestAnalysis,
  handleAnalyseTestWithAI,
}: TestListViewProps) {
  const scorePct = (t: Test) =>
    t.max_score > 0 && t.score != null ? Math.round((t.score / t.max_score) * 100) : null;

  if (subjects.length === 0) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
        No subjects yet. Create a subject first (in Folders & Decks) to start saving tests.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "900px" }}>
      {subjects.map((subject) => {
        const tests = testsBySubject[subject.id] ?? [];
        const trend = trendBySubject[subject.id] ?? [];
        const isOpen = expandedSubject === subject.id;
        return (
          <div key={subject.id} className="test-subject-section">
            <div
              className="test-subject-header"
              onClick={() => toggleSubject(subject.id)}
              style={{ cursor: "pointer" }}
            >
              <span style={{ fontSize: "1.3rem" }}>{subject.icon || "📚"}</span>
              <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-primary)" }}>
                {subject.name}
              </span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {tests.length} test{tests.length === 1 ? "" : "s"}
              </span>
              <ChevronLeft
                size={16}
                style={{
                  marginLeft: "auto",
                  transform: isOpen ? "rotate(90deg)" : "rotate(-90deg)",
                  transition: "transform 0.15s",
                  color: "var(--text-muted)",
                }}
              />
            </div>

            {isOpen && (
              <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className="notion-btn secondary" onClick={() => startAddTest(subject.id)}>
                    <Plus size={14} /> Add Test
                  </button>
                </div>

                {tests.length === 0 ? (
                  <div
                    style={{
                      padding: "20px",
                      textAlign: "center",
                      color: "var(--text-muted)",
                      fontSize: "0.85rem",
                    }}
                  >
                    No tests saved for this subject yet.
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {tests.map((t) => {
                        const pct = scorePct(t);
                        const isBeingAnalyzed = analyzingTestId === t.id;
                        return (
                          <div
                            key={t.id}
                            className="test-card"
                            onClick={() => openDetail(t)}
                            style={{ cursor: "pointer" }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                                {t.name}
                              </div>
                              <div
                                style={{
                                  fontSize: "0.78rem",
                                  color: "var(--text-muted)",
                                  marginTop: "2px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  flexWrap: "wrap",
                                }}
                              >
                                <span>
                                  {t.test_date ? new Date(t.test_date).toLocaleDateString() : "No date"}
                                </span>
                                {t.time_limit_minutes != null && (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                                    · <Clock size={11} /> {t.time_limit_minutes} mins allowed
                                  </span>
                                )}
                                {t.source_type !== "manual" && <span>· scanned ({t.source_type})</span>}
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              {pct != null && (
                                <div
                                  className={`test-score-badge ${
                                    pct >= 80 ? "good" : pct >= 50 ? "ok" : "low"
                                  }`}
                                >
                                  {pct}%
                                </div>
                              )}
                              {analyzedTestMap[t.id] ? (
                                <button
                                  className="notion-btn secondary"
                                  style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                                  onClick={(e) => handleReviewTestAnalysis(t, e)}
                                  title="Review saved AI analysis and error breakdown"
                                >
                                  <Eye size={13} />
                                  Review the analysis
                                </button>
                              ) : (
                                <button
                                  className="notion-btn secondary"
                                  style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                                  onClick={(e) => handleAnalyseTestWithAI(t, e)}
                                  disabled={isBeingAnalyzed}
                                  title="Run AI diagnostic analysis and log errors to Scores tab"
                                >
                                  {isBeingAnalyzed ? (
                                    <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                                  ) : (
                                    <Sparkles size={13} />
                                  )}
                                  Analyse using AI
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {trend.length >= 2 && (
                      <div className="test-trend-chart">
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                          <BarChart3 size={16} style={{ color: "var(--accent-color)" }} />
                          <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                            Score Trend
                          </span>
                        </div>
                        <ResponsiveContainer width="100%" height={220}>
                          <LineChart data={trend} margin={{ top: 10, right: 20, bottom: 10, left: -10 }}>
                            <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" />
                            <XAxis
                              dataKey="test_date"
                              tickFormatter={(d) =>
                                new Date(d).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                })
                              }
                              tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                              stroke="var(--border-color)"
                            />
                            <YAxis
                              domain={[0, 100]}
                              tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                              stroke="var(--border-color)"
                            />
                            <Tooltip
                              contentStyle={{
                                background: "var(--bg-primary)",
                                border: "1px solid var(--border-color)",
                                borderRadius: "6px",
                                fontSize: "0.8rem",
                              }}
                              labelFormatter={(d) => new Date(String(d)).toLocaleDateString()}
                              formatter={(value: any, _name: any, tooltipProps: any) => [
                                `${value}%`,
                                tooltipProps.payload.testName,
                              ]}
                            />
                            <ReferenceLine y={50} stroke="var(--text-muted)" strokeDasharray="2 2" />
                            <Line
                              type="monotone"
                              dataKey="scorePct"
                              stroke="var(--accent-color)"
                              strokeWidth={2}
                              dot={{ r: 4, fill: "var(--accent-color)" }}
                              activeDot={{ r: 6 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {trend.length < 2 && tests.some((t) => t.score != null) && (
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "8px" }}>
                        Add at least 2 tests with scores to see the trend graph.
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
