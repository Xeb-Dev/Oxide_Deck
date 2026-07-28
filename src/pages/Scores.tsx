import { useEffect, useState } from "react";
import { getSubjects, getTests, getTestErrors, Subject, Test, TestError } from "../services/db";
import { TrendingUp, BookOpen, Loader2, Search, CheckCircle2, ChevronDown, ChevronUp, Target } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import MathText from "../components/MathText";

interface Props {
  setCurrentNav: (nav: any) => void;
}

export default function ScoresPage({ setCurrentNav: _setCurrentNav }: Props) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("all");
  const [tests, setTests] = useState<Test[]>([]);
  const [errors, setErrors] = useState<TestError[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadScoresData();
  }, []);

  const loadScoresData = async () => {
    try {
      setLoading(true);
      const [sList, tList, errList] = await Promise.all([
        getSubjects(),
        getTests(),
        getTestErrors("all"),
      ]);
      setSubjects(sList);
      setTests(tList);
      setErrors(errList);

      // Initialize all subjects expanded by default
      const initialExpanded: Record<string, boolean> = {};
      sList.forEach((s) => { initialExpanded[s.id] = true; });
      setExpandedSubjects(initialExpanded);
    } catch (e) {
      console.error("Failed to load scores data:", e);
    } finally {
      setLoading(false);
    }
  };

  const toggleSubjectExpanded = (subId: string) => {
    setExpandedSubjects((prev) => ({ ...prev, [subId]: !prev[subId] }));
  };

  // Scored tests overall
  const scoredTests = tests.filter((t) => t.score != null && t.max_score > 0);
  const avgOverallScore = scoredTests.length > 0
    ? Math.round(scoredTests.reduce((acc, t) => acc + ((t.score ?? 0) / t.max_score) * 100, 0) / scoredTests.length)
    : null;

  // Filter subjects based on selection
  const subjectsToDisplay = selectedSubjectId === "all"
    ? subjects
    : subjects.filter((s) => s.id === selectedSubjectId);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <span className="page-emoji">📈</span>
          <h1 className="page-title">Scores & Error Analytics</h1>
          <p className="sub-description">
            Subject-by-subject grade progression charts and study focus recommendations.
          </p>
        </div>

        {/* Top Controls: Subject Filter & Search */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {/* Search box */}
          <div className="notion-input-group" style={{ width: "220px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Search size={14} style={{ color: "var(--text-muted)", marginLeft: "8px" }} />
              <input
                className="notion-input"
                type="text"
                placeholder="Search study points..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ padding: "6px 8px", fontSize: "0.82rem" }}
              />
            </div>
          </div>

          {/* Subject selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)" }}>Subject:</label>
            <select
              className="notion-input"
              style={{ width: "180px", padding: "6px 10px", fontSize: "0.85rem" }}
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
            >
              <option value="all">All Subjects ({subjects.length})</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon || "📚"} {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="divider" />

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}>
          <Loader2 size={28} style={{ animation: "spin 1s linear infinite" }} />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* OVERALL STAT CARDS */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
            <div className="test-card" style={{ padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--accent-color)", fontWeight: 600, fontSize: "0.85rem" }}>
                <TrendingUp size={18} /> Overall Average Grade
              </div>
              <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "8px" }}>
                {avgOverallScore != null ? `${avgOverallScore}%` : "N/A"}
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
                Across {scoredTests.length} evaluated test(s)
              </div>
            </div>

            <div className="test-card" style={{ padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#8b5cf6", fontWeight: 600, fontSize: "0.85rem" }}>
                <Target size={18} /> Study Focus Points
              </div>
              <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "8px" }}>
                {errors.length}
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
                Key review opportunities identified
              </div>
            </div>

            <div className="test-card" style={{ padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.85rem" }}>
                <BookOpen size={18} /> Total Saved Tests
              </div>
              <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "8px" }}>
                {tests.length}
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
                Across {subjects.length} subject(s)
              </div>
            </div>
          </div>

          {/* PER-SUBJECT SECTION CARDS */}
          {subjectsToDisplay.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem", border: "1px dashed var(--border-color)", borderRadius: "8px" }}>
              No subjects found. Create a subject in Folders & Decks to get started.
            </div>
          ) : (
            subjectsToDisplay.map((sub) => {
              const subTests = tests.filter((t) => t.subject_id === sub.id);
              const subScoredTests = subTests.filter((t) => t.score != null && t.max_score > 0 && t.test_date != null);
              
              // Sort tests chronologically for subject line chart
              const subTrendData = [...subScoredTests]
                .sort((a, b) => new Date(a.test_date!).getTime() - new Date(b.test_date!).getTime())
                .map((t) => ({
                  test_date: t.test_date!.slice(0, 10),
                  scorePct: Math.round(((t.score ?? 0) / t.max_score) * 100),
                  testName: t.name,
                }));

              // Subject Average Grade %
              const subAvgGrade = subScoredTests.length > 0
                ? Math.round(subScoredTests.reduce((acc, t) => acc + ((t.score ?? 0) / t.max_score) * 100, 0) / subScoredTests.length)
                : null;

              // Subject Errors filtered by search
              const subErrors = errors.filter((err) => {
                if (err.subject_id !== sub.id) return false;
                if (!searchQuery.trim()) return true;
                const q = searchQuery.toLowerCase();
                return (
                  err.question_text.toLowerCase().includes(q) ||
                  (err.user_answer && err.user_answer.toLowerCase().includes(q)) ||
                  (err.correct_answer && err.correct_answer.toLowerCase().includes(q)) ||
                  err.error_reason.toLowerCase().includes(q) ||
                  (err.test_name && err.test_name.toLowerCase().includes(q))
                );
              });

              const isExpanded = expandedSubjects[sub.id] ?? true;

              return (
                <div
                  key={sub.id}
                  style={{
                    border: "1px solid var(--border-color)",
                    borderRadius: "10px",
                    backgroundColor: "var(--bg-secondary)",
                    overflow: "hidden",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                  }}
                >
                  {/* Subject Card Header */}
                  <div
                    onClick={() => toggleSubjectExpanded(sub.id)}
                    style={{
                      padding: "16px 20px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                      backgroundColor: "var(--bg-primary)",
                      borderBottom: isExpanded ? "1px solid var(--border-color)" : "none",
                      userSelect: "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "1.4rem" }}>{sub.icon || "📚"}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-primary)" }}>
                          {sub.name}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "2px" }}>
                          {subTests.length} test(s) saved · {subErrors.length} study focus point(s)
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      {subAvgGrade != null && (
                        <div
                          className={`test-score-badge ${subAvgGrade >= 80 ? "good" : subAvgGrade >= 50 ? "ok" : "low"}`}
                          style={{ padding: "4px 10px", fontSize: "0.85rem", fontWeight: 700 }}
                        >
                          Avg: {subAvgGrade}%
                        </div>
                      )}
                      {isExpanded ? <ChevronUp size={18} style={{ color: "var(--text-muted)" }} /> : <ChevronDown size={18} style={{ color: "var(--text-muted)" }} />}
                    </div>
                  </div>

                  {/* Subject Body */}
                  {isExpanded && (
                    <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
                      {/* GRAPH & METRICS GRID */}
                      <div style={{ border: "1px solid var(--border-color)", borderRadius: "8px", padding: "16px", backgroundColor: "var(--bg-primary)" }}>
                        <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)", marginBottom: "2px", display: "flex", alignItems: "center", gap: "6px" }}>
                          <TrendingUp size={16} style={{ color: "var(--accent-color)" }} />
                          {sub.name} — Grade Progression Over Time
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "14px" }}>
                          Chronological score trend for {sub.name} tests
                        </div>

                        {subTrendData.length >= 2 ? (
                          <div style={{ width: "100%", height: 220 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={subTrendData}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                <XAxis dataKey="test_date" stroke="var(--text-muted)" fontSize={11} />
                                <YAxis domain={[0, 100]} stroke="var(--text-muted)" fontSize={11} unit="%" />
                                <Tooltip
                                  contentStyle={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border-color)", borderRadius: "8px", fontSize: "0.8rem" }}
                                  formatter={(value: any, _name: any, props: any) => [`${value}%`, props.payload.testName]}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="scorePct"
                                  stroke="var(--accent-color)"
                                  strokeWidth={2.5}
                                  dot={{ r: 5, fill: "var(--accent-color)" }}
                                  activeDot={{ r: 7 }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <div style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem", border: "1px dashed var(--border-color)", borderRadius: "6px" }}>
                            {subScoredTests.length === 1
                              ? `1 scored test recorded (${subTrendData[0]?.scorePct}% on ${subTrendData[0]?.test_date}). Add at least 1 more scored test to plot line charts.`
                              : "No scored tests recorded yet for this subject. Complete tests to view grade progression charts."}
                          </div>
                        )}
                      </div>

                      {/* MISTAKES & ERROR LOG FOR THIS SUBJECT */}
                      <div style={{ border: "1px solid var(--border-color)", borderRadius: "8px", padding: "16px", backgroundColor: "var(--bg-primary)" }}>
                        <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)", marginBottom: "2px", display: "flex", alignItems: "center", gap: "6px" }}>
                          <Target size={16} style={{ color: "#8b5cf6" }} />
                          Study Focus Points & AI Insights ({subErrors.length})
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "14px" }}>
                          Review key concepts, AI feedback, and official solutions in {sub.name}
                        </div>

                        {subErrors.length === 0 ? (
                          <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem", border: "1px dashed var(--border-color)", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                            <CheckCircle2 size={16} style={{ color: "var(--success-color)" }} />
                            {errors.filter((e) => e.subject_id === sub.id).length === 0
                              ? `All clear! No study focus points recorded for ${sub.name}. Run 'Analyse using AI' on tests to record diagnostic insights.`
                              : "No study focus points matching your search filter."}
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            {subErrors.map((err) => (
                              <div
                                key={err.id}
                                style={{
                                  border: "1px solid var(--border-color)",
                                  borderRadius: "8px",
                                  padding: "14px",
                                  backgroundColor: "var(--bg-secondary)",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "8px",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                                    📄 {err.test_name || "Test"}
                                  </span>
                                  {err.score != null && (
                                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#8b5cf6", backgroundColor: "rgba(139, 92, 246, 0.1)", padding: "2px 8px", borderRadius: "4px" }}>
                                      Points: {err.score}
                                    </span>
                                  )}
                                </div>

                                <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                                  <MathText>{err.question_text}</MathText>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "2px" }}>
                                  <div style={{ padding: "8px 10px", backgroundColor: "rgba(139, 92, 246, 0.05)", border: "1px solid rgba(139, 92, 246, 0.2)", borderRadius: "6px" }}>
                                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#8b5cf6", marginBottom: "2px" }}>
                                      Your Answer:
                                    </div>
                                    <div style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>
                                      {err.user_answer ? <MathText>{err.user_answer}</MathText> : <span style={{ fontStyle: "italic", opacity: 0.7 }}>(Blank)</span>}
                                    </div>
                                  </div>

                                  <div style={{ padding: "8px 10px", backgroundColor: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "6px" }}>
                                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--success-color)", marginBottom: "2px" }}>
                                      Correct Answer:
                                    </div>
                                    <div style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>
                                      {err.correct_answer ? <MathText>{err.correct_answer}</MathText> : <span style={{ fontStyle: "italic", opacity: 0.7 }}>(N/A)</span>}
                                    </div>
                                  </div>
                                </div>

                                <div style={{ marginTop: "2px", padding: "10px", backgroundColor: "var(--bg-primary)", borderRadius: "6px", borderLeft: "3px solid #8b5cf6" }}>
                                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#8b5cf6", marginBottom: "2px" }}>
                                    💡 AI Explanation & Study Tip:
                                  </div>
                                  <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                                    <MathText>{err.error_reason}</MathText>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </>
  );
}
