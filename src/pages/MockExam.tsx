import { useEffect, useState, useMemo } from "react";
import {
  getSubjects, getDecks, getFolders, getTestsBySubject, getTestQuestions,
  getFlashcards, saveTestAnalysis, addRevisionHistory,
  Subject, Deck, Folder, Test
} from "../services/db";
import {
  generateVariableVariationTest, generateFlashcardMimicMock, analyzeTestWithAI,
  FullTestAnalysisResult, GeneratedMockQuestion
} from "../services/llm";
import {
  Clock, Loader2, Play, CheckCircle2
} from "lucide-react";
import MathText from "../components/MathText";
import StatusBanner, { StatusVariant } from "../components/StatusBanner";

interface MockExamProps {
  currentNav: {
    subjectId?: string;
    deckId?: string;
  };
  setCurrentNav: (nav: any) => void;
}

export default function MockExamPage({ currentNav, setCurrentNav }: MockExamProps) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(currentNav.subjectId || "");
  const [selectedDeckId, setSelectedDeckId] = useState<string>(currentNav.deckId || "");

  // Compute folder and deck sets filtered by selectedSubjectId
  const subjectFolderIds = useMemo(() => {
    if (!selectedSubjectId) return new Set<string>();
    const map = new Map<string, string | null>();
    folders.forEach((f) => {
      if (f.subject_id) map.set(f.id, f.subject_id);
    });
    let changed = true;
    while (changed) {
      changed = false;
      folders.forEach((f) => {
        if (!map.has(f.id) && f.parent_folder_id && map.has(f.parent_folder_id)) {
          map.set(f.id, map.get(f.parent_folder_id)!);
          changed = true;
        }
      });
    }
    return new Set(folders.filter((f) => map.get(f.id) === selectedSubjectId).map((f) => f.id));
  }, [selectedSubjectId, folders]);

  const subjectDecks = useMemo(() => {
    if (!selectedSubjectId) return [];
    return decks.filter((d) => d.folder_id && subjectFolderIds.has(d.folder_id));
  }, [selectedSubjectId, decks, subjectFolderIds]);

  const [mockOption, setMockOption] = useState<'retake' | 'variation' | 'flashcard_mimic'>('retake');
  const [subjectTests, setSubjectTests] = useState<Test[]>([]);
  const [selectedPastTestId, setSelectedPastTestId] = useState<string>("");
  const [topicFocus, setTopicFocus] = useState<string>("");
  const [timerMinutes, setTimerMinutes] = useState<number>(60);

  const [mockQuestions, setMockQuestions] = useState<GeneratedMockQuestion[]>([]);
  const [mockUserAnswers, setMockUserAnswers] = useState<string[]>([]);
  const [mockMathWork, setMockMathWork] = useState<string[]>([]);
  const [mockExamTitle, setMockExamTitle] = useState<string>("Mock Exam");

  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number | null>(null);
  const [timerActive, setTimerActive] = useState<boolean>(false);
  const [generating, setGenerating] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<FullTestAnalysisResult | null>(null);

  const [status, setStatus] = useState<{ message: string; variant: StatusVariant } | null>(null);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);

  // Load initial dropdown options
  useEffect(() => {
    const init = async () => {
      try {
        setLoadingInitial(true);
        const [subs, dks, fldrs] = await Promise.all([getSubjects(), getDecks(), getFolders()]);
        setSubjects(subs);
        setDecks(dks);
        setFolders(fldrs);

        let initialSubId = currentNav.subjectId || (subs.length > 0 ? subs[0].id : "");
        if (!initialSubId && currentNav.deckId) {
          const dk = dks.find((d) => d.id === currentNav.deckId);
          if (dk) {
            const fld = fldrs.find((f) => f.id === dk.folder_id);
            if (fld?.subject_id) initialSubId = fld.subject_id;
          }
        }
        if (initialSubId) {
          setSelectedSubjectId(initialSubId);
          const tests = await getTestsBySubject(initialSubId);
          setSubjectTests(tests);
          if (tests.length > 0) {
            setSelectedPastTestId(tests[0].id);
            if (tests[0].time_limit_minutes) setTimerMinutes(tests[0].time_limit_minutes);
          }
        }
      } catch (e) {
        console.error(e);
        setStatus({ message: "Failed to load subjects and tests.", variant: "error" });
      } finally {
        setLoadingInitial(false);
      }
    };
    init();
  }, []);

  // Handle subject change
  const handleSubjectChange = async (subId: string) => {
    setSelectedSubjectId(subId);
    setSelectedDeckId("");
    try {
      const tests = await getTestsBySubject(subId);
      setSubjectTests(tests);
      if (tests.length > 0) {
        setSelectedPastTestId(tests[0].id);
        if (tests[0].time_limit_minutes) setTimerMinutes(tests[0].time_limit_minutes);
      } else {
        setSelectedPastTestId("");
      }
      const subObj = subjects.find((s) => s.id === subId);
      if (subObj) setTopicFocus(subObj.name);
    } catch (e) {
      console.error(e);
    }
  };

  // Timer countdown effect
  useEffect(() => {
    if (!timerActive || timeRemainingSeconds === null) return;
    if (timeRemainingSeconds <= 0) {
      setTimerActive(false);
      alert("⏰ Time is up! Submitting your exam now.");
      handleSubmitExam();
      return;
    }
    const interval = setInterval(() => {
      setTimeRemainingSeconds((prev) => (prev != null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [timerActive, timeRemainingSeconds]);

  // Start exam handler
  const handleStartExam = async () => {
    setGenerating(true);
    setStatus(null);
    try {
      let title = "Mock Exam";
      let questionsToUse: GeneratedMockQuestion[] = [];
      const subObj = subjects.find((s) => s.id === selectedSubjectId);
      const subjectName = subObj ? subObj.name : "Subject";

      if (mockOption === "retake") {
        const targetTest = subjectTests.find((t) => t.id === selectedPastTestId) || subjectTests[0];
        if (!targetTest) {
          throw new Error("No saved test paper found in this subject to retake. Create or scan a test first, or choose Flashcard AI Mock.");
        }
        title = `Retake: ${targetTest.name}`;
        const qs = await getTestQuestions(targetTest.id);
        questionsToUse = qs.map((q) => ({
          type: q.type,
          question: q.question,
          options: q.options || undefined,
          correctAnswer: q.correct_answer || "",
        }));
      } else if (mockOption === "variation") {
        const targetTest = subjectTests.find((t) => t.id === selectedPastTestId) || subjectTests[0];
        if (!targetTest) {
          throw new Error("No saved test paper found in this subject for variable variation. Create or scan a test first, or choose Flashcard AI Mock.");
        }
        const qs = await getTestQuestions(targetTest.id);
        const generated = await generateVariableVariationTest(
          targetTest.name,
          subjectName,
          qs.map((q) => ({
            type: q.type,
            question: q.question,
            options: q.options,
            correctAnswer: q.correct_answer,
          })),
          topicFocus
        );
        title = generated.title;
        questionsToUse = generated.questions;
      } else {
        // Flashcard Mimic
        let cards: { front: string; back: string }[] = [];
        if (selectedDeckId) {
          const rawCards = await getFlashcards(selectedDeckId);
          cards = rawCards.map((c) => ({ front: c.front, back: c.back }));
        } else {
          // Collect cards across decks in this subject
          const matchingFolders = folders.filter((f) => f.subject_id === selectedSubjectId);
          const matchingFolderIds = new Set(matchingFolders.map((f) => f.id));
          const matchingDecks = decks.filter((d) => d.folder_id && matchingFolderIds.has(d.folder_id));
          for (const d of matchingDecks) {
            const rawCards = await getFlashcards(d.id);
            cards.push(...rawCards.map((c) => ({ front: c.front, back: c.back })));
          }
        }

        if (cards.length === 0) {
          throw new Error("No flashcards found in this subject/deck to build a mock exam. Create some flashcards or choose Retake Past Test!");
        }

        let exemplarQuestions: { type: string; question: string }[] = [];
        if (subjectTests.length > 0) {
          const sampleQs = await getTestQuestions(subjectTests[0].id);
          exemplarQuestions = sampleQs.map((q) => ({ type: q.type, question: q.question }));
        }

        const generated = await generateFlashcardMimicMock(
          subjectName,
          topicFocus || subjectName,
          cards,
          exemplarQuestions
        );
        title = generated.title;
        questionsToUse = generated.questions;
      }

      setMockExamTitle(title);
      setMockQuestions(questionsToUse);
      setMockUserAnswers(new Array(questionsToUse.length).fill(""));
      setMockMathWork(new Array(questionsToUse.length).fill(""));
      setSubmitted(false);
      setAnalysisResult(null);

      // Start Countdown Timer
      const totalSecs = (timerMinutes || 60) * 60;
      setTimeRemainingSeconds(totalSecs);
      setTimerActive(true);
    } catch (e: any) {
      console.error(e);
      setStatus({ message: e?.message || "Failed to launch Mock Exam.", variant: "error" });
    } finally {
      setGenerating(false);
    }
  };

  // Submit exam handler
  const handleSubmitExam = async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    setTimerActive(false);
    try {
      const subObj = subjects.find((s) => s.id === selectedSubjectId);
      const subjectName = subObj ? subObj.name : "Subject";

      const result = await analyzeTestWithAI(
        mockExamTitle,
        subjectName,
        mockQuestions.map((q, idx) => ({
          type: q.type,
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          userAnswer: mockUserAnswers[idx] || "",
          mathWork: mockMathWork[idx] || "",
        }))
      );

      if (selectedSubjectId) {
        const tempTestId = `mock_${Date.now()}`;
        await saveTestAnalysis(
          tempTestId,
          selectedSubjectId,
          result.summary,
          result.strengths,
          result.weaknesses,
          result.recommendations,
          result.errors
        );
      }

      const scorePct = result.maxScore > 0
        ? Math.round((result.calculatedScore / result.maxScore) * 100)
        : 0;

      await addRevisionHistory(null, 'mock', scorePct);

      setAnalysisResult(result);
      setSubmitted(true);
      setStatus({ message: `Mock Exam graded! ${result.errors.length} error(s) logged to Scores & Analytics tab.`, variant: "success" });
    } catch (e: any) {
      console.error(e);
      setStatus({ message: e?.message || "Failed to grade Mock Exam.", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimerDisplay = (seconds: number | null) => {
    if (seconds == null) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  if (loadingInitial) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>Loading Mock Exam Arena...</div>;
  }

  return (
    <>
      {status && (
        <StatusBanner
          message={status.message}
          variant={status.variant}
          onDismiss={() => setStatus(null)}
        />
      )}

      {/* SETUP / LAUNCHER SCREEN */}
      {mockQuestions.length === 0 && (
        <div style={{ maxWidth: "720px", margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <span className="page-emoji">🎯</span>
            <h1 className="page-title">Mock Exam Arena</h1>
            <p className="sub-description">
              Practice under timed exam conditions with retakes, mutated variable test papers, or AI mock exams based on your flashcards.
            </p>
          </div>

          <div className="divider" />

          {/* Subject Selection */}
          <label className="form-label">
            Subject:
            <select
              className="notion-input"
              value={selectedSubjectId}
              onChange={(e) => handleSubjectChange(e.target.value)}
              style={{ marginTop: "6px", width: "100%" }}
            >
              <option value="">Select a subject...</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon || "📚"} {s.name}
                </option>
              ))}
            </select>
          </label>

          {/* Mode Option Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Select Mock Exam Mode:
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "12px" }}>
              <div
                onClick={() => setMockOption('retake')}
                style={{
                  padding: "16px",
                  border: mockOption === 'retake' ? "2px solid var(--accent-color)" : "1px solid var(--border-color)",
                  backgroundColor: mockOption === 'retake' ? "var(--accent-light)" : "var(--bg-secondary)",
                  borderRadius: "10px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                  🔄 Retake Past Test
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px", lineHeight: 1.4 }}>
                  Retake a saved exam paper in this subject under timed conditions.
                </div>
              </div>

              <div
                onClick={() => setMockOption('variation')}
                style={{
                  padding: "16px",
                  border: mockOption === 'variation' ? "2px solid var(--accent-color)" : "1px solid var(--border-color)",
                  backgroundColor: mockOption === 'variation' ? "var(--accent-light)" : "var(--bg-secondary)",
                  borderRadius: "10px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                  🎲 Variable Variation
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px", lineHeight: 1.4 }}>
                  AI mutates numbers, values & variables of a past test paper.
                </div>
              </div>

              <div
                onClick={() => setMockOption('flashcard_mimic')}
                style={{
                  padding: "16px",
                  border: mockOption === 'flashcard_mimic' ? "2px solid var(--accent-color)" : "1px solid var(--border-color)",
                  backgroundColor: mockOption === 'flashcard_mimic' ? "var(--accent-light)" : "var(--bg-secondary)",
                  borderRadius: "10px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                  ✨ Flashcard AI Mock
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px", lineHeight: 1.4 }}>
                  AI builds a mock test from deck flashcards, mimicking past test formats.
                </div>
              </div>
            </div>
          </div>

          {/* Optional Deck Selection (Only for Flashcard AI Mock) */}
          {mockOption === 'flashcard_mimic' && (
            <label className="form-label">
              Deck (Optional for Flashcard AI Mock):
              <select
                className="notion-input"
                value={selectedDeckId}
                onChange={(e) => setSelectedDeckId(e.target.value)}
                style={{ marginTop: "6px", width: "100%" }}
              >
                <option value="">All Decks in Subject ({subjectDecks.length})</option>
                {subjectDecks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.icon || "🎴"} {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Select past test dropdown if retake or variation */}
          {(mockOption === 'retake' || mockOption === 'variation') && (
            <label className="form-label">
              Select Past Test Paper:
              {subjectTests.length === 0 ? (
                <div style={{ fontSize: "0.82rem", color: "#e11d48", marginTop: "4px" }}>
                  No saved tests found in this subject. Scan or create a test paper in the Tests tab first, or switch to <strong>Flashcard AI Mock</strong> above!
                </div>
              ) : (
                <select
                  className="notion-input"
                  value={selectedPastTestId}
                  onChange={(e) => {
                    setSelectedPastTestId(e.target.value);
                    const selectedT = subjectTests.find(t => t.id === e.target.value);
                    if (selectedT?.time_limit_minutes) setTimerMinutes(selectedT.time_limit_minutes);
                  }}
                  style={{ marginTop: "6px", width: "100%" }}
                >
                  {subjectTests.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.time_limit_minutes ? `${t.time_limit_minutes} mins` : 'No timer set'})
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}

          {/* Topic Focus Input (Only for Flashcard AI Mock) */}
          {mockOption === 'flashcard_mimic' && (
            <label className="form-label">
              Topic / Concept Focus (Optional):
              <input
                className="form-input"
                type="text"
                value={topicFocus}
                onChange={(e) => setTopicFocus(e.target.value)}
                placeholder="e.g. Linear Algebra, Thermodynamics, Cell Biology..."
                style={{ marginTop: "6px" }}
              />
            </label>
          )}

          {/* Timer Minutes Input */}
          <label className="form-label">
            Allocated Exam Timer (Minutes):
            <input
              className="form-input"
              type="number"
              value={timerMinutes}
              onChange={(e) => setTimerMinutes(Number(e.target.value) || 30)}
              placeholder="60"
              style={{ marginTop: "6px" }}
            />
          </label>

          <button
            className="notion-btn primary"
            onClick={handleStartExam}
            disabled={generating || !selectedSubjectId || (mockOption !== 'flashcard_mimic' && subjectTests.length === 0)}
            style={{ padding: "12px 20px", fontSize: "1rem", marginTop: "10px" }}
          >
            {generating ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> : <Play size={18} />}
            {generating ? "Generating Timed Mock Exam..." : "Start Timed Mock Exam"}
          </button>
        </div>
      )}

      {/* ACTIVE EXAM INTERFACE */}
      {mockQuestions.length > 0 && !submitted && (
        <div style={{ maxWidth: "820px", margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Sticky Header with Timer */}
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 100,
              backgroundColor: "var(--bg-primary)",
              padding: "16px 20px",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
              boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text-primary)" }}>
                {mockExamTitle}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "2px" }}>
                {mockQuestions.length} Questions · Timed Examination
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "1rem",
                  fontWeight: 800,
                  padding: "6px 16px",
                  borderRadius: "20px",
                  backgroundColor: (timeRemainingSeconds != null && timeRemainingSeconds < 300) ? "rgba(225, 29, 72, 0.1)" : "var(--bg-secondary)",
                  color: (timeRemainingSeconds != null && timeRemainingSeconds < 300) ? "#e11d48" : "var(--accent-color)",
                  border: "1px solid var(--border-color)",
                }}
              >
                <Clock size={18} />
                <span>{formatTimerDisplay(timeRemainingSeconds)}</span>
              </div>

              <button
                className="notion-btn primary"
                onClick={handleSubmitExam}
                disabled={submitting}
              >
                {submitting ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={16} />}
                Submit Exam
              </button>
            </div>
          </div>

          {/* Question Paper */}
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {mockQuestions.map((q, idx) => (
              <div key={idx} className="quiz-card" style={{ padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-color)", textTransform: "uppercase" }}>
                    Question {idx + 1} of {mockQuestions.length} ({q.type})
                  </span>
                </div>

                <div style={{ fontWeight: 600, fontSize: "0.98rem", color: "var(--text-primary)", marginBottom: "12px", lineHeight: 1.5 }}>
                  <MathText>{q.question}</MathText>
                </div>

                {/* Multiple Choice Options */}
                {q.type === 'multiple-choice' && q.options && q.options.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                    {q.options.map((opt, optIdx) => (
                      <label
                        key={optIdx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "10px 14px",
                          backgroundColor: mockUserAnswers[idx] === opt ? "var(--accent-light)" : "var(--bg-secondary)",
                          border: "1px solid var(--border-color)",
                          borderRadius: "8px",
                          cursor: "pointer",
                          fontSize: "0.9rem",
                        }}
                      >
                        <input
                          type="radio"
                          name={`mock-q-${idx}`}
                          checked={mockUserAnswers[idx] === opt}
                          onChange={() => {
                            const updated = [...mockUserAnswers];
                            updated[idx] = opt;
                            setMockUserAnswers(updated);
                          }}
                        />
                        <MathText>{opt}</MathText>
                      </label>
                    ))}
                  </div>
                )}

                {/* Short / Long / Maths Answer Input */}
                {q.type !== 'multiple-choice' && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
                    <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                      Your Answer:
                    </label>
                    <textarea
                      className="form-input"
                      rows={2}
                      value={mockUserAnswers[idx]}
                      onChange={(e) => {
                        const updated = [...mockUserAnswers];
                        updated[idx] = e.target.value;
                        setMockUserAnswers(updated);
                      }}
                      placeholder="Write your answer here..."
                    />

                    {/* Math Working Out field */}
                    {q.type === 'maths' && (
                      <div style={{ marginTop: "6px" }}>
                        <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--accent-color)" }}>
                          🔢 Math Working Out / Derivation (Optional):
                        </label>
                        <textarea
                          className="form-input"
                          rows={3}
                          value={mockMathWork[idx]}
                          onChange={(e) => {
                            const updated = [...mockMathWork];
                            updated[idx] = e.target.value;
                            setMockMathWork(updated);
                          }}
                          placeholder="Show step-by-step mathematical working out..."
                          style={{ marginTop: "4px" }}
                        />
                        {mockMathWork[idx].trim() !== "" && (
                          <div style={{ marginTop: "6px", padding: "10px", backgroundColor: "var(--bg-secondary)", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "2px" }}>Math Preview:</div>
                            <MathText>{mockMathWork[idx]}</MathText>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
            <button
              className="notion-btn primary"
              onClick={handleSubmitExam}
              disabled={submitting}
              style={{ padding: "12px 28px", fontSize: "1rem" }}
            >
              {submitting ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={16} />}
              Submit & Grade Mock Exam
            </button>
          </div>
        </div>
      )}

      {/* POST-EXAM RESULTS SCREEN */}
      {submitted && analysisResult && (
        <div style={{ maxWidth: "820px", margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ border: "1px solid var(--border-color)", borderRadius: "12px", padding: "24px", backgroundColor: "var(--bg-secondary)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <span className="page-emoji">🎉</span>
                <h1 className="page-title" style={{ margin: 0 }}>Mock Exam Complete!</h1>
                <p className="sub-description" style={{ margin: 0, marginTop: "4px" }}>
                  {mockExamTitle}
                </p>
              </div>

              <div style={{ padding: "8px 18px", borderRadius: "20px", backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-color)", fontWeight: 800, fontSize: "1.25rem", color: "var(--accent-color)" }}>
                {analysisResult.calculatedScore} / {analysisResult.maxScore} ({Math.round((analysisResult.calculatedScore / (analysisResult.maxScore || 100)) * 100)}%)
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Summary */}
              <div style={{ padding: "16px", backgroundColor: "var(--bg-primary)", borderRadius: "8px", borderLeft: "4px solid var(--accent-color)" }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-color)", textTransform: "uppercase" }}>
                  Diagnostic Performance Overview
                </div>
                <div style={{ fontSize: "0.92rem", color: "var(--text-primary)", marginTop: "4px", lineHeight: 1.6 }}>
                  {analysisResult.summary}
                </div>
              </div>

              {/* Strengths & Weaknesses */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                {analysisResult.strengths && (
                  <div style={{ padding: "16px", backgroundColor: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "8px" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--success-color)", marginBottom: "4px" }}>
                      💪 Concepts Mastered
                    </div>
                    <div style={{ fontSize: "0.88rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                      {analysisResult.strengths}
                    </div>
                  </div>
                )}

                {analysisResult.weaknesses && (
                  <div style={{ padding: "16px", backgroundColor: "rgba(139, 92, 246, 0.06)", border: "1px solid rgba(139, 92, 246, 0.2)", borderRadius: "8px" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#8b5cf6", marginBottom: "4px" }}>
                      🎯 Study Focus Points
                    </div>
                    <div style={{ fontSize: "0.88rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                      {analysisResult.weaknesses}
                    </div>
                  </div>
                )}
              </div>

              {/* Recommendations */}
              {analysisResult.recommendations && (
                <div style={{ padding: "16px", backgroundColor: "var(--bg-primary)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px" }}>
                    📌 Study Advice & Next Steps
                  </div>
                  <div style={{ fontSize: "0.88rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                    {analysisResult.recommendations}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
              <button
                className="notion-btn secondary"
                onClick={() => {
                  setMockQuestions([]);
                  setSubmitted(false);
                }}
              >
                Take Another Mock Exam
              </button>
              <button
                className="notion-btn primary"
                onClick={() => setCurrentNav({ page: "scores" })}
              >
                View Scores & Analytics Tab
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
