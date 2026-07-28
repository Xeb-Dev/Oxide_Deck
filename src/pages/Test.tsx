import { useEffect, useState } from "react";
import {
  Plus, Trash2, Edit3, Loader2, Sparkles, Image as ImageIcon,
  Type, FileUp, ClipboardList, ChevronLeft, BarChart3, Eye,
  CheckCircle2, XCircle, MessageSquare, X, Clock,
} from "lucide-react";
import {
  getSubjects, getTestsBySubject, getTestQuestions, createTest,
  updateTest, deleteTest, bulkCreateTestQuestions, deleteTestQuestions,
  getSubjectTestTrend, saveTestAnalysis,
  Subject, Test, TestQuestion, TestQuestionType, TestTrendPoint,
} from "../services/db";
import {
  scanTextForTestQuestions, scanPdfForTestQuestions, scanImageForTestQuestions,
  reviewTestAnswers, TestQuestionReview, analyzeTestMetadata, autoFillAndGradeTestForm,
  analyzeTestWithAI, FullTestAnalysisResult, ExtractedTestQuestion,
} from "../services/llm";
import { extractStructuredTextFromPDF, buildPdfPromptText, PdfExtractionResult } from "../services/pdf";
import StatusBanner, { StatusVariant } from "../components/StatusBanner";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine } from "recharts";

import MathText from "../components/MathText";

interface Props {
  currentNav: { subjectId?: string };
  setCurrentNav: (nav: any) => void;
}

type View = "list" | "edit" | "detail";
type ScanTab = "text" | "pdf" | "image" | "manual";

interface EditableQuestion {
  type: TestQuestionType;
  question: string;
  options: string[];
  correctAnswer: string;
  userAnswer: string;
  score: string;
  mathWork: string;
}

const QUESTION_TYPES: TestQuestionType[] = ["multiple-choice", "short-answer", "long-answer", "true-false", "maths"];

function emptyQuestion(): EditableQuestion {
  return { type: "short-answer", question: "", options: [], correctAnswer: "", userAnswer: "", score: "", mathWork: "" };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function TestPage({ currentNav, setCurrentNav: _setCurrentNav }: Props) {
  const [view, setView] = useState<View>("list");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [testsBySubject, setTestsBySubject] = useState<Record<string, Test[]>>({});
  const [trendBySubject, setTrendBySubject] = useState<Record<string, TestTrendPoint[]>>({});
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const [status, setStatus] = useState<{ message: string; variant: StatusVariant } | null>(null);
  const [loading, setLoading] = useState(true);

  // AI Analysis Modal state
  const [analyzingTestId, setAnalyzingTestId] = useState<string | null>(null);
  const [analysisModalData, setAnalysisModalData] = useState<{ test: Test; result: FullTestAnalysisResult } | null>(null);

  const [editingTest, setEditingTest] = useState<Test | null>(null);
  const [editSubjectId, setEditSubjectId] = useState<string>("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editScore, setEditScore] = useState<string>("");
  const [editMaxScore, setEditMaxScore] = useState<string>("100");
  const [editTestDate, setEditTestDate] = useState<string>("");
  const [editTimeLimit, setEditTimeLimit] = useState<string>("");
  const [scanTab, setScanTab] = useState<ScanTab>("text");
  const [scanText, setScanText] = useState("");
  const [pdfExtraction, setPdfExtraction] = useState<PdfExtractionResult | null>(null);
  const [pdfFileData, setPdfFileData] = useState<Uint8Array | null>(null);
  const [images, setImages] = useState<{ dataUrl: string; base64: string; mime: string; name: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [extractedQuestions, setExtractedQuestions] = useState<EditableQuestion[]>([]);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);

  const [detailTest, setDetailTest] = useState<Test | null>(null);
  const [detailQuestions, setDetailQuestions] = useState<TestQuestion[]>([]);
  const [detailSubject, setDetailSubject] = useState<Subject | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const subs = await getSubjects();
      setSubjects(subs);
      const bySub: Record<string, Test[]> = {};
      for (const s of subs) {
        bySub[s.id] = await getTestsBySubject(s.id);
      }
      setTestsBySubject(bySub);
    } catch (e) {
      console.error(e);
      setStatus({ message: "Failed to load tests.", variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (currentNav.subjectId && view === "list") {
      setExpandedSubject(currentNav.subjectId);
    }
  }, [currentNav.subjectId]);

  const loadTrend = async (subjectId: string) => {
    try {
      const trend = await getSubjectTestTrend(subjectId);
      setTrendBySubject((prev) => ({ ...prev, [subjectId]: trend }));
    } catch (e) { console.error(e); }
  };

  const toggleSubject = (subjectId: string) => {
    setExpandedSubject((prev) => (prev === subjectId ? null : subjectId));
    if (expandedSubject !== subjectId) loadTrend(subjectId);
  };

  const startAddTest = (subjectId: string) => {
    setEditingTest(null);
    setEditSubjectId(subjectId);
    setEditName("");
    setEditDescription("");
    setEditScore("");
    setEditMaxScore("100");
    setEditTestDate(new Date().toISOString().slice(0, 10));
    setEditTimeLimit("");
    setScanTab("text");
    setScanText("");
    setPdfExtraction(null);
    setPdfFileData(null);
    setImages([]);
    setExtractedQuestions([]);
    setView("edit");
  };

  const startEditTest = async (test: Test) => {
    setEditingTest(test);
    setEditSubjectId(test.subject_id);
    setEditName(test.name);
    setEditDescription(test.description || "");
    setEditScore(test.score != null ? String(test.score) : "");
    setEditMaxScore(String(test.max_score));
    setEditTestDate(test.test_date ? test.test_date.slice(0, 10) : "");
    setEditTimeLimit(test.time_limit_minutes != null ? String(test.time_limit_minutes) : "");
    setScanTab("text");
    setScanText("");
    setPdfExtraction(null);
    setPdfFileData(null);
    setImages([]);
    setScanning(true);
    setView("edit");
    try {
      const qs = await getTestQuestions(test.id);
      setExtractedQuestions(qs.map((q) => ({
        type: q.type, question: q.question, options: q.options ?? [], correctAnswer: q.correct_answer ?? "", userAnswer: q.user_answer ?? "", score: q.score != null ? String(q.score) : "", mathWork: q.math_work ?? "",
      })));
    } catch (e) { console.error(e); setExtractedQuestions([]); }
    finally { setScanning(false); }
  };

  const openDetail = async (test: Test) => {
    try {
      setDetailTest(test);
      setDetailQuestions(await getTestQuestions(test.id));
      setDetailSubject(subjects.find((s) => s.id === test.subject_id) ?? null);
      setView("detail");
    } catch (e) { console.error(e); setStatus({ message: "Failed to load test details.", variant: "error" }); }
  };

  const handleAnalyseTestWithAI = async (targetTest: Test, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setAnalyzingTestId(targetTest.id);
    try {
      const qs = await getTestQuestions(targetTest.id);
      const subject = subjects.find((s) => s.id === targetTest.subject_id);
      const subjectName = subject ? subject.name : "Subject";

      const analysisResult = await analyzeTestWithAI(
        targetTest.name,
        subjectName,
        qs.map((q) => ({
          id: q.id,
          type: q.type,
          question: q.question,
          options: q.options,
          correctAnswer: q.correct_answer,
          userAnswer: q.user_answer,
          score: q.score,
          mathWork: q.math_work,
        }))
      );

      // Save analysis summary & error records into database
      await saveTestAnalysis(
        targetTest.id,
        targetTest.subject_id,
        analysisResult.summary,
        analysisResult.strengths,
        analysisResult.weaknesses,
        analysisResult.recommendations,
        analysisResult.errors
      );

      // Update total test score if calculated by analysis
      if (analysisResult.calculatedScore != null && analysisResult.calculatedScore > 0) {
        await updateTest(
          targetTest.id,
          targetTest.name,
          targetTest.description,
          analysisResult.calculatedScore,
          analysisResult.maxScore || targetTest.max_score || 100,
          targetTest.test_date,
          targetTest.time_limit_minutes
        );
      }

      setAnalysisModalData({ test: targetTest, result: analysisResult });
      await loadData();
      setStatus({ message: `AI Analysis complete! ${analysisResult.errors.length} error(s) logged to Scores tab.`, variant: "success" });
    } catch (err: any) {
      console.error(err);
      setStatus({ message: err?.message || "AI Analysis failed.", variant: "error" });
    } finally {
      setAnalyzingTestId(null);
    }
  };

  // Auto-fill the metadata form (name, description, score, max_score, test_date) from scanned content.
  // Only fills fields that are currently empty/default so it doesn't overwrite user edits.
  const autoFillMetadata = async (sourceText: string, questions: ExtractedTestQuestion[]) => {
    try {
      const meta = await analyzeTestMetadata(sourceText, questions);
      if (!editName.trim() && meta.name) setEditName(meta.name);
      if (!editDescription.trim() && meta.description) setEditDescription(meta.description);

      let computedScore = meta.score;
      let computedMaxScore = meta.maxScore || 100;
      if (computedScore == null && questions.length > 0) {
        const validScores = questions.map((q) => q.score).filter((s): s is number => typeof s === "number");
        if (validScores.length > 0) {
          computedScore = Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length);
        }
      }
      if (computedScore != null) setEditScore(String(computedScore));
      if (computedMaxScore != null) setEditMaxScore(String(computedMaxScore));
      if ((!editTestDate || editTestDate === new Date().toISOString().slice(0, 10)) && meta.testDate) setEditTestDate(meta.testDate);
      if (!editTimeLimit && meta.timeLimitMinutes) setEditTimeLimit(String(meta.timeLimitMinutes));
    } catch (e) {
      console.error("Auto-fill metadata failed:", e);
    }
  };

  const handleAutoFillAllAndGrade = async () => {
    if (extractedQuestions.length === 0 && !scanText.trim()) {
      setStatus({ message: "Please add questions or scan text first.", variant: "warning" });
      return;
    }
    setScanning(true);
    try {
      const formattedQuestions = extractedQuestions.map((q) => ({
        ...q,
        score: q.score.trim() === "" ? null : Number(q.score),
      }));
      const result = await autoFillAndGradeTestForm(formattedQuestions, scanText);
      if (result.name && (!editName.trim() || editName === "")) setEditName(result.name);
      if (result.description && (!editDescription.trim() || editDescription === "")) setEditDescription(result.description);

      const updatedQs = (result.questions && result.questions.length > 0)
        ? result.questions.map((q) => ({
            type: (q.type as TestQuestionType) || "short-answer",
            question: q.question,
            options: q.options ?? [],
            correctAnswer: q.correctAnswer ?? "",
            userAnswer: q.userAnswer ?? "",
            score: q.score != null ? String(q.score) : "",
            mathWork: q.mathWork ?? "",
          }))
        : extractedQuestions;

      if (result.questions && result.questions.length > 0) {
        setExtractedQuestions(updatedQs);
      }

      let totalScore = result.score;
      let totalMaxScore = result.maxScore || 100;
      if (totalScore == null && updatedQs.length > 0) {
        const numScores = updatedQs
          .map((q) => (q.score.trim() !== "" ? Number(q.score) : null))
          .filter((s): s is number => s !== null && !isNaN(s));
        if (numScores.length > 0) {
          totalScore = Math.round(numScores.reduce((a, b) => a + b, 0) / numScores.length);
        }
      }

      if (totalScore != null) setEditScore(String(totalScore));
      if (totalMaxScore != null) setEditMaxScore(String(totalMaxScore));
      if (result.testDate) setEditTestDate(result.testDate);
      if (result.timeLimitMinutes) setEditTimeLimit(String(result.timeLimitMinutes));

      setStatus({ message: "AI auto-filled all fields & calculated total score!", variant: "success" });
    } catch (e: any) {
      console.error(e);
      setStatus({ message: e?.message || "Auto-fill failed.", variant: "error" });
    } finally {
      setScanning(false);
    }
  };

  const handleScanText = async () => {
    if (!scanText.trim()) return;
    setScanning(true);
    try {
      const result = await scanTextForTestQuestions(scanText);
      setExtractedQuestions(result.map((q) => ({
        type: q.type, question: q.question, options: q.options ?? [], correctAnswer: q.correctAnswer ?? "", userAnswer: q.userAnswer ?? "", score: q.score != null ? String(q.score) : "", mathWork: q.mathWork ?? "",
      })));
      await autoFillMetadata(scanText, result);
      setStatus({ message: `Extracted ${result.length} question(s).`, variant: "success" });
    } catch (e: any) { console.error(e); setStatus({ message: e?.message || "Scan failed.", variant: "error" }); }
    finally { setScanning(false); }
  };

  const handlePdfUpload = async (file: File) => {
    try {
      setScanning(true);
      const arrayBuffer = await file.arrayBuffer();
      const extraction = await extractStructuredTextFromPDF(arrayBuffer);
      setPdfExtraction(extraction);
      setPdfFileData(new Uint8Array(arrayBuffer));
      setStatus({ message: "PDF loaded. Click 'Extract Questions' to scan.", variant: "info" });
    } catch (e: any) { console.error(e); setStatus({ message: e?.message || "Failed to load PDF.", variant: "error" }); }
    finally { setScanning(false); }
  };

  const handleScanPdf = async () => {
    if (!pdfExtraction) return;
    setScanning(true);
    try {
      const pdfText = buildPdfPromptText(pdfExtraction);
      const result = await scanPdfForTestQuestions(pdfText);
      setExtractedQuestions(result.map((q) => ({
        type: q.type, question: q.question, options: q.options ?? [], correctAnswer: q.correctAnswer ?? "", userAnswer: q.userAnswer ?? "", score: q.score != null ? String(q.score) : "", mathWork: q.mathWork ?? "",
      })));
      await autoFillMetadata(pdfText, result);
      setStatus({ message: `Extracted ${result.length} question(s) from PDF.`, variant: "success" });
    } catch (e: any) { console.error(e); setStatus({ message: e?.message || "PDF scan failed.", variant: "error" }); }
    finally { setScanning(false); }
  };

  const readFileAsDataUrl = (file: File): Promise<{ dataUrl: string; base64: string; mime: string; name: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve({ dataUrl, base64: dataUrl.split(",")[1] ?? "", mime: file.type, name: file.name });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleImagesAdded = async (fileList: FileList | File[]) => {
    const imageFiles = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    setScanning(true);
    try {
      // Add all images to the gallery first
      const loaded = await Promise.all(imageFiles.map(readFileAsDataUrl));
      setImages((prev) => [...prev, ...loaded]);

      // Scan each image and merge questions
      const allQuestions: ExtractedTestQuestion[] = [];
      for (const img of loaded) {
        try {
          const result = await scanImageForTestQuestions(img.base64, img.mime);
          allQuestions.push(...result);
        } catch (e) { console.error(`Failed to scan ${img.name}:`, e); }
      }
      const editableQuestions: EditableQuestion[] = allQuestions.map((q) => ({
        type: q.type, question: q.question, options: q.options ?? [], correctAnswer: q.correctAnswer ?? "", userAnswer: q.userAnswer ?? "", score: q.score != null ? String(q.score) : "", mathWork: q.mathWork ?? "",
      }));
      if (editableQuestions.length > 0) {
        setExtractedQuestions((prev) => [...prev, ...editableQuestions]);
        // Auto-fill metadata from the extracted questions (no raw text for images)
        await autoFillMetadata(JSON.stringify(allQuestions.map((q) => ({ question: q.question, correctAnswer: q.correctAnswer, userAnswer: q.userAnswer }))), allQuestions);
        setStatus({ message: `Added ${loaded.length} image(s). Extracted ${editableQuestions.length} question(s).`, variant: "success" });
      } else {
        setStatus({ message: `Added ${loaded.length} image(s), but no questions could be extracted.`, variant: "warning" });
      }
    } catch (e: any) { console.error(e); setStatus({ message: e?.message || "Image upload failed.", variant: "error" }); }
    finally { setScanning(false); }
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleImagesAdded(e.dataTransfer.files);
  };

  const addManualQuestion = () => setExtractedQuestions((prev) => [...prev, emptyQuestion()]);
  const updateQuestion = (idx: number, patch: Partial<EditableQuestion>) =>
    setExtractedQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  const deleteQuestion = (idx: number) =>
    setExtractedQuestions((prev) => prev.filter((_, i) => i !== idx));

  const handleSaveTest = async () => {
    if (!editSubjectId) { setStatus({ message: "Please select a subject.", variant: "error" }); return; }
    if (!editName.trim()) { setStatus({ message: "Please enter a test name.", variant: "error" }); return; }
    setSaving(true);
    try {
      const scoreNum = editScore.trim() === "" ? null : Number(editScore);
      const maxNum = Number(editMaxScore) || 100;
      const testDate = editTestDate || null;
      const timeLimitNum = editTimeLimit.trim() === "" ? null : Number(editTimeLimit);

      let sourceType: Test["source_type"] = "manual";
      let sourceData: string | null = null;
      if (scanTab === "text" && scanText.trim()) { sourceType = "text"; sourceData = scanText; }
      else if (scanTab === "pdf" && pdfFileData) { sourceType = "pdf"; sourceData = btoa(String.fromCharCode(...pdfFileData)); }
      else if (scanTab === "image" && images.length > 0) {
        sourceType = "image";
        sourceData = JSON.stringify(images.map((img) => img.dataUrl));
      }

      let testId: string;
      if (editingTest) {
        await updateTest(editingTest.id, editName, editDescription || null, scoreNum, maxNum, testDate, timeLimitNum);
        await deleteTestQuestions(editingTest.id);
        testId = editingTest.id;
      } else {
        const created = await createTest(editSubjectId, editName, editDescription || null, sourceType, sourceData, scoreNum, maxNum, testDate, timeLimitNum);
        testId = created.id;
      }

      await bulkCreateTestQuestions(testId, extractedQuestions.map((q) => ({
        type: q.type, question: q.question,
        options: q.type === "multiple-choice" ? q.options : null,
        correctAnswer: q.correctAnswer || null,
        userAnswer: q.userAnswer || null,
        score: q.score.trim() === "" ? null : Number(q.score),
        mathWork: q.mathWork || null,
        sourcePage: null,
      })));

      setStatus({ message: `Test "${editName}" saved.`, variant: "success" });
      await loadData();
      setView("list");
    } catch (e: any) { console.error(e); setStatus({ message: e?.message || "Failed to save test.", variant: "error" }); }
    finally { setSaving(false); }
  };

  const handleDeleteTest = async (test: Test) => {
    if (!confirm(`Delete test "${test.name}"? This cannot be undone.`)) return;
    try {
      await deleteTest(test.id);
      setStatus({ message: "Test deleted.", variant: "success" });
      await loadData();
    } catch (e: any) { console.error(e); setStatus({ message: e?.message || "Failed to delete test.", variant: "error" }); }
  };

  const scorePct = (t: Test) => (t.max_score > 0 && t.score != null ? Math.round((t.score / t.max_score) * 100) : null);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}>
        <Loader2 size={28} style={{ animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  if (view === "edit") {
    return (
      <EditView
        editingTest={editingTest} subjects={subjects} editSubjectId={editSubjectId} setEditSubjectId={setEditSubjectId}
        editName={editName} setEditName={setEditName} editDescription={editDescription} setEditDescription={setEditDescription}
        editScore={editScore} setEditScore={setEditScore} editMaxScore={editMaxScore} setEditMaxScore={setEditMaxScore}
        editTestDate={editTestDate} setEditTestDate={setEditTestDate} editTimeLimit={editTimeLimit} setEditTimeLimit={setEditTimeLimit}
        scanTab={scanTab} setScanTab={setScanTab}
        scanText={scanText} setScanText={setScanText} onScanText={handleScanText} onPdfUpload={handlePdfUpload}
        onScanPdf={handleScanPdf} pdfExtraction={pdfExtraction} onImagesAdded={handleImagesAdded}
        onRemoveImage={removeImage} onDrop={handleDrop} dragOver={dragOver} setDragOver={setDragOver}
        images={images} extractedQuestions={extractedQuestions} addManualQuestion={addManualQuestion}
        updateQuestion={updateQuestion} deleteQuestion={deleteQuestion} scanning={scanning} saving={saving}
        onAutoFillAllAndGrade={handleAutoFillAllAndGrade}
        onSave={handleSaveTest} onCancel={() => setView("list")} status={status} setStatus={setStatus}
      />
    );
  }

  if (view === "detail" && detailTest) {
    return (
      <DetailView test={detailTest} questions={detailQuestions} subject={detailSubject}
        onBack={() => setView("list")} onEdit={() => startEditTest(detailTest)} onDelete={() => handleDeleteTest(detailTest)}
        onAnalyse={() => handleAnalyseTestWithAI(detailTest)} analyzing={analyzingTestId === detailTest.id} />
    );
  }

  return (
    <>
      <div>
        <span className="page-emoji">📝</span>
        <h1 className="page-title">Tests</h1>
        <p className="sub-description">
          Save real-life subject exams you've taken. Scan a paper to extract questions, record your score, and track improvement over time.
        </p>
      </div>
      <div className="divider" />

      {status && (
        <StatusBanner message={status.message} variant={status.variant}
          onDismiss={status.variant === "error" ? () => setStatus(null) : undefined} />
      )}

      {subjects.length === 0 ? (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
          No subjects yet. Create a subject first (in Folders & Decks) to start saving tests.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "900px" }}>
          {subjects.map((subject) => {
            const tests = testsBySubject[subject.id] ?? [];
            const trend = trendBySubject[subject.id] ?? [];
            const isOpen = expandedSubject === subject.id;
            return (
              <div key={subject.id} className="test-subject-section">
                <div className="test-subject-header" onClick={() => toggleSubject(subject.id)} style={{ cursor: "pointer" }}>
                  <span style={{ fontSize: "1.3rem" }}>{subject.icon || "📚"}</span>
                  <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-primary)" }}>{subject.name}</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {tests.length} test{tests.length === 1 ? "" : "s"}
                  </span>
                  <ChevronLeft size={16} style={{
                    marginLeft: "auto", transform: "rotate(-90deg)", transition: "transform 0.15s", color: "var(--text-muted)",
                  }} />
                </div>

                {isOpen && (
                  <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button className="notion-btn secondary" onClick={() => startAddTest(subject.id)}>
                        <Plus size={14} /> Add Test
                      </button>
                    </div>

                    {tests.length === 0 ? (
                      <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                        No tests saved for this subject yet.
                      </div>
                    ) : (
                      <>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {tests.map((t) => {
                            const pct = scorePct(t);
                            const isBeingAnalyzed = analyzingTestId === t.id;
                            return (
                              <div key={t.id} className="test-card" onClick={() => openDetail(t)} style={{ cursor: "pointer" }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t.name}</div>
                                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "2px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                    <span>{t.test_date ? new Date(t.test_date).toLocaleDateString() : "No date"}</span>
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
                                    <div className={`test-score-badge ${pct >= 80 ? "good" : pct >= 50 ? "ok" : "low"}`}>{pct}%</div>
                                  )}
                                  <button
                                    className="notion-btn secondary"
                                    style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                                    onClick={(e) => handleAnalyseTestWithAI(t, e)}
                                    disabled={isBeingAnalyzed}
                                    title="Run AI diagnostic analysis and log errors to Scores tab"
                                  >
                                    {isBeingAnalyzed ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={13} />}
                                    Analyse using AI
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {trend.length >= 2 && (
                          <div className="test-trend-chart">
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                              <BarChart3 size={16} style={{ color: "var(--accent-color)" }} />
                              <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>Score Trend</span>
                            </div>
                            <ResponsiveContainer width="100%" height={220}>
                              <LineChart data={trend} margin={{ top: 10, right: 20, bottom: 10, left: -10 }}>
                                <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" />
                                <XAxis dataKey="test_date"
                                  tickFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                  tick={{ fill: "var(--text-secondary)", fontSize: 11 }} stroke="var(--border-color)" />
                                <YAxis domain={[0, 100]} tick={{ fill: "var(--text-secondary)", fontSize: 11 }} stroke="var(--border-color)" />
                                <Tooltip contentStyle={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)", borderRadius: "6px", fontSize: "0.8rem" }}
                                  labelFormatter={(d) => new Date(String(d)).toLocaleDateString()}
                                  formatter={(value: any, _name: any, props: any) => [`${value}%`, props.payload.testName]} />
                                <ReferenceLine y={50} stroke="var(--text-muted)" strokeDasharray="2 2" />
                                <Line type="monotone" dataKey="scorePct" stroke="var(--accent-color)" strokeWidth={2}
                                  dot={{ r: 4, fill: "var(--accent-color)" }} activeDot={{ r: 6 }} />
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
      )}

      {/* AI ANALYSIS BREAKDOWN MODAL */}
      {analysisModalData && (
        <div className="notion-modal-overlay" style={{ zIndex: 1000, padding: "20px" }}>
          <div className="notion-modal" style={{ width: "90vw", maxWidth: "900px", maxHeight: "88vh", overflowY: "auto", padding: "24px", borderRadius: "12px" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid var(--border-color)" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: "1.2rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Sparkles size={20} style={{ color: "var(--accent-color)" }} />
                  AI Test Breakdown: {analysisModalData.test.name}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  Diagnostic evaluation & error recording
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {analysisModalData.result.calculatedScore != null && (
                  <div style={{ padding: "4px 12px", borderRadius: "20px", backgroundColor: "var(--bg-secondary)", fontWeight: 700, fontSize: "0.9rem", color: "var(--accent-color)", border: "1px solid var(--border-color)" }}>
                    Score: {analysisModalData.result.calculatedScore} / {analysisModalData.result.maxScore} ({Math.round((analysisModalData.result.calculatedScore / (analysisModalData.result.maxScore || 100)) * 100)}%)
                  </div>
                )}
                <button className="theme-toggle-btn" onClick={() => setAnalysisModalData(null)} style={{ padding: "6px" }}>
                  <X size={18} />
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Summary */}
              <div style={{ padding: "16px", backgroundColor: "var(--bg-secondary)", borderRadius: "10px", borderLeft: "4px solid var(--accent-color)" }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-color)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Diagnostic Summary
                </div>
                <div style={{ fontSize: "0.92rem", color: "var(--text-primary)", marginTop: "6px", lineHeight: 1.6 }}>
                  {analysisModalData.result.summary}
                </div>
              </div>

              {/* Strengths & Weaknesses */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }}>
                {analysisModalData.result.strengths && (
                  <div style={{ padding: "16px", backgroundColor: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "10px" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--success-color)", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                      💪 Concepts Mastered
                    </div>
                    <div style={{ fontSize: "0.88rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                      {analysisModalData.result.strengths}
                    </div>
                  </div>
                )}

                {analysisModalData.result.weaknesses && (
                  <div style={{ padding: "16px", backgroundColor: "rgba(225, 29, 72, 0.06)", border: "1px solid rgba(225, 29, 72, 0.25)", borderRadius: "10px" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--danger-color)", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                      ⚠️ Topic Gaps / Misconceptions
                    </div>
                    <div style={{ fontSize: "0.88rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                      {analysisModalData.result.weaknesses}
                    </div>
                  </div>
                )}
              </div>

              {/* Recommendations */}
              {analysisModalData.result.recommendations && (
                <div style={{ padding: "16px", backgroundColor: "var(--bg-secondary)", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "6px" }}>
                    📌 Study Advice & Next Steps
                  </div>
                  <div style={{ fontSize: "0.88rem", color: "var(--text-primary)", lineHeight: 1.6 }}>
                    {analysisModalData.result.recommendations}
                  </div>
                </div>
              )}

              {/* Recorded Errors list */}
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", marginBottom: "12px" }}>
                  Logged Mistakes ({analysisModalData.result.errors.length}) — recorded to Scores tab:
                </div>
                {analysisModalData.result.errors.length === 0 ? (
                  <div style={{ padding: "16px", textAlign: "center", color: "var(--success-color)", fontSize: "0.9rem", backgroundColor: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "8px" }}>
                    🎉 Perfect score! No errors were recorded for this test.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    {analysisModalData.result.errors.map((err, i) => (
                      <div key={i} style={{ border: "1px solid var(--border-color)", borderRadius: "8px", padding: "14px", backgroundColor: "var(--bg-primary)", display: "flex", flexDirection: "column", gap: "8px" }}>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                          <MathText>{err.questionText}</MathText>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "4px" }}>
                          <div style={{ padding: "8px 10px", backgroundColor: "rgba(225, 29, 72, 0.05)", border: "1px solid rgba(225, 29, 72, 0.2)", borderRadius: "6px" }}>
                            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--danger-color)", marginBottom: "2px" }}>Your answer:</div>
                            <div style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>{err.userAnswer ? <MathText>{err.userAnswer}</MathText> : <span style={{ fontStyle: "italic", opacity: 0.7 }}>(Blank)</span>}</div>
                          </div>
                          <div style={{ padding: "8px 10px", backgroundColor: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "6px" }}>
                            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--success-color)", marginBottom: "2px" }}>Correct answer:</div>
                            <div style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>{err.correctAnswer ? <MathText>{err.correctAnswer}</MathText> : <span style={{ fontStyle: "italic", opacity: 0.7 }}>(N/A)</span>}</div>
                          </div>
                        </div>
                        <div style={{ marginTop: "4px", padding: "10px", backgroundColor: "var(--bg-secondary)", borderRadius: "6px", borderLeft: "3px solid var(--accent-color)" }}>
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

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px", paddingTop: "12px", borderTop: "1px solid var(--border-color)" }}>
              <button className="notion-btn secondary" onClick={() => setAnalysisModalData(null)} style={{ padding: "8px 16px" }}>
                Close
              </button>
              <button
                className="notion-btn primary"
                onClick={() => {
                  setAnalysisModalData(null);
                  _setCurrentNav({ page: "scores" });
                }}
                style={{ padding: "8px 16px" }}
              >
                Go to Scores Tab
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface EditViewProps {
  editingTest: Test | null;
  subjects: Subject[];
  editSubjectId: string; setEditSubjectId: (v: string) => void;
  editName: string; setEditName: (v: string) => void;
  editDescription: string; setEditDescription: (v: string) => void;
  editScore: string; setEditScore: (v: string) => void;
  editMaxScore: string; setEditMaxScore: (v: string) => void;
  editTestDate: string; setEditTestDate: (v: string) => void;
  editTimeLimit: string; setEditTimeLimit: (v: string) => void;
  scanTab: ScanTab; setScanTab: (v: ScanTab) => void;
  scanText: string; setScanText: (v: string) => void;
  onScanText: () => void;
  onPdfUpload: (file: File) => void;
  onScanPdf: () => void;
  pdfExtraction: PdfExtractionResult | null;
  onImagesAdded: (files: FileList | File[]) => void;
  onRemoveImage: (idx: number) => void;
  onDrop: (e: React.DragEvent) => void;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  images: { dataUrl: string; base64: string; mime: string; name: string }[];
  extractedQuestions: EditableQuestion[];
  addManualQuestion: () => void;
  updateQuestion: (idx: number, patch: Partial<EditableQuestion>) => void;
  deleteQuestion: (idx: number) => void;
  scanning: boolean; saving: boolean;
  onAutoFillAllAndGrade: () => void;
  onSave: () => void; onCancel: () => void;
  status: { message: string; variant: StatusVariant } | null;
  setStatus: (s: { message: string; variant: StatusVariant } | null) => void;
}

function EditView(props: EditViewProps) {
  const {
    editingTest, subjects, editSubjectId, setEditSubjectId, editName, setEditName,
    editDescription, setEditDescription, editScore, setEditScore, editMaxScore,
    setEditMaxScore, editTestDate, setEditTestDate, editTimeLimit, setEditTimeLimit,
    scanTab, setScanTab, scanText, setScanText, onScanText, onPdfUpload, onScanPdf,
    pdfExtraction, onImagesAdded, onRemoveImage, onDrop, dragOver, setDragOver,
    images, extractedQuestions, addManualQuestion, updateQuestion, deleteQuestion,
    scanning, saving, onAutoFillAllAndGrade, onSave, onCancel, status, setStatus,
  } = props;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button className="notion-btn secondary" onClick={onCancel} style={{ padding: "6px 10px" }}>
          <ChevronLeft size={16} />
        </button>
        <h1 className="page-title" style={{ margin: 0 }}>{editingTest ? "Edit Test" : "Add Test"}</h1>
      </div>
      <div className="divider" />

      {status && (
        <StatusBanner message={status.message} variant={status.variant}
          onDismiss={status.variant === "error" ? () => setStatus(null) : undefined} />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "700px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <label className="form-label">
            Subject
            <select className="form-input" value={editSubjectId} onChange={(e) => setEditSubjectId(e.target.value)} disabled={!!editingTest}>
              <option value="">Select a subject…</option>
              {subjects.map((s) => (<option key={s.id} value={s.id}>{s.icon || "📚"} {s.name}</option>))}
            </select>
          </label>
          <label className="form-label">
            Test name
            <input className="form-input" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="e.g. Midterm Exam 1" />
          </label>
          <label className="form-label">
            Description (optional)
            <textarea className="form-input" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} placeholder="Notes about this test…" />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px" }}>
            <label className="form-label">
              Score
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>Points earned</div>
              <input className="form-input" type="number" value={editScore} onChange={(e) => setEditScore(e.target.value)} placeholder="e.g. 85" />
            </label>
            <label className="form-label">
              Max score
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>Total possible points</div>
              <input className="form-input" type="number" value={editMaxScore} onChange={(e) => setEditMaxScore(e.target.value)} placeholder="100" />
            </label>
            <label className="form-label">
              Test date
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>Date exam taken</div>
              <input className="form-input" type="date" value={editTestDate} onChange={(e) => setEditTestDate(e.target.value)} />
            </label>
            <label className="form-label">
              Time allowed (mins)
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>Duration/time limit</div>
              <input className="form-input" type="number" value={editTimeLimit} onChange={(e) => setEditTimeLimit(e.target.value)} placeholder="e.g. 60" />
            </label>
          </div>
        </div>

        <div className="divider" />

        <div>
          <div style={{ fontWeight: 600, marginBottom: "10px", color: "var(--text-primary)" }}>
            <Sparkles size={16} style={{ verticalAlign: "middle", marginRight: "6px" }} />
            Scan test paper (optional)
          </div>
          <div className="test-scan-tabs">
            <button className={scanTab === "text" ? "active" : ""} onClick={() => setScanTab("text")}><Type size={14} /> Text</button>
            <button className={scanTab === "pdf" ? "active" : ""} onClick={() => setScanTab("pdf")}><FileUp size={14} /> PDF</button>
            <button className={scanTab === "image" ? "active" : ""} onClick={() => setScanTab("image")}><ImageIcon size={14} /> Image</button>
            <button className={scanTab === "manual" ? "active" : ""} onClick={() => setScanTab("manual")}><ClipboardList size={14} /> Manual</button>
          </div>

          <div style={{ marginTop: "12px" }}>
            {scanTab === "text" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <textarea className="form-input" value={scanText} onChange={(e) => setScanText(e.target.value)} rows={6} placeholder="Paste the test questions text here…" />
                <button className="notion-btn primary" onClick={onScanText} disabled={scanning || !scanText.trim()}>
                  {scanning ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={14} />}
                  Extract Questions
                </button>
              </div>
            )}
            {scanTab === "pdf" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <input type="file" accept="application/pdf"
                  onChange={(e) => e.target.files?.[0] && onPdfUpload(e.target.files[0])} style={{ fontSize: "0.85rem" }} />
                {pdfExtraction && (
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    PDF loaded ({pdfExtraction.fullText.length} chars). Has selectable text: {pdfExtraction.hasSelectableText ? "yes" : "no"}
                  </div>
                )}
                <button className="notion-btn primary" onClick={onScanPdf} disabled={scanning || !pdfExtraction}>
                  {scanning ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={14} />}
                  Extract Questions
                </button>
              </div>
            )}
            {scanTab === "image" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div
                  className={`test-image-dropzone ${dragOver ? "drag-over" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => document.getElementById("test-image-input")?.click()}
                >
                  <ImageIcon size={28} style={{ color: "var(--text-muted)" }} />
                  <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.9rem" }}>
                    Drag & drop images here
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    or click to browse · multiple images supported
                  </div>
                  <input
                    id="test-image-input"
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => { if (e.target.files && e.target.files.length > 0) onImagesAdded(e.target.files); e.target.value = ""; }}
                  />
                </div>

                {images.length > 0 && (
                  <div className="test-image-gallery">
                    {images.map((img, idx) => (
                      <div key={idx} className="test-image-thumb">
                        <img src={img.dataUrl} alt={img.name} />
                        <button
                          className="test-image-remove"
                          onClick={(e) => { e.stopPropagation(); onRemoveImage(idx); }}
                          title="Remove image"
                        >
                          <X size={12} />
                        </button>
                        <span className="test-image-name">{img.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {scanning && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Scanning {images.length} image(s)…
                  </div>
                )}
              </div>
            )}
            {scanTab === "manual" && (
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Add questions manually using the list below.</div>
            )}
          </div>
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Questions ({extractedQuestions.length})</span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="notion-btn secondary" onClick={onAutoFillAllAndGrade} disabled={scanning} title="AI will fill missing correct answers, evaluate user answers, and calculate total score">
                {scanning ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={14} />}
                Auto-fill & Calculate Score
              </button>
              <button className="notion-btn secondary" onClick={addManualQuestion}><Plus size={14} /> Add Question</button>
            </div>
          </div>
          {extractedQuestions.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem", border: "1px dashed var(--border-color)", borderRadius: "8px" }}>
              No questions yet. Scan a paper or add manually.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {extractedQuestions.map((q, idx) => (
                <div key={idx} className="test-question-card" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <div>
                      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Question {idx + 1} Type</div>
                      <select className="form-input" style={{ width: "180px", marginTop: "4px" }} value={q.type}
                        onChange={(e) => updateQuestion(idx, { type: e.target.value as TestQuestionType })}>
                        {QUESTION_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                      </select>
                    </div>
                    <button className="notion-btn danger" style={{ padding: "4px 8px" }} onClick={() => deleteQuestion(idx)} title="Delete question">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div>
                    <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)" }}>Question Text</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>Enter the question or prompt as presented on the test paper</div>
                    <textarea className="form-input" value={q.question} onChange={(e) => updateQuestion(idx, { question: e.target.value })} rows={2} placeholder="e.g. What is the capital of France?" />
                  </div>

                  {q.type === "multiple-choice" && (
                    <div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)" }}>Multiple Choice Options</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>Enter choices, one per line</div>
                      <textarea className="form-input" value={q.options.join("\n")}
                        onChange={(e) => updateQuestion(idx, { options: e.target.value.split("\n") })} rows={4}
                        placeholder={"Option A\nOption B\nOption C\nOption D"} />
                    </div>
                  )}

                  {(q.type === "maths" || q.mathWork.trim().length > 0) && (
                    <div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)" }}>Math Work / Steps Shown</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>Step-by-step mathematical working out, calculations, or derivations</div>
                      <textarea className="form-input" value={q.mathWork}
                        onChange={(e) => updateQuestion(idx, { mathWork: e.target.value })} rows={4}
                        placeholder={"Step 1: 2x + 5 = 15\nStep 2: 2x = 10\nStep 3: x = 5"} />
                      {q.mathWork.trim() && (
                        <div style={{ marginTop: "6px", padding: "8px 12px", backgroundColor: "var(--bg-secondary)", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                          <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "4px" }}>Math Preview:</div>
                          <MathText style={{ fontSize: "0.9rem", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{q.mathWork}</MathText>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 110px", gap: "10px", marginTop: "2px" }}>
                    <div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)" }}>Correct Answer</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>Official correct answer</div>
                      <input className="form-input" value={q.correctAnswer}
                        onChange={(e) => updateQuestion(idx, { correctAnswer: e.target.value })} placeholder="e.g. Paris" />
                    </div>
                    <div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)" }}>What's Your Answer?</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>Student's response on test</div>
                      <input className="form-input" value={q.userAnswer}
                        onChange={(e) => updateQuestion(idx, { userAnswer: e.target.value })} placeholder="e.g. Paris" />
                    </div>
                    <div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)" }}>Score</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>Points earned</div>
                      <input className="form-input" type="number" value={q.score}
                        onChange={(e) => updateQuestion(idx, { score: e.target.value })} placeholder="100" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
          <button className="notion-btn secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="notion-btn primary" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={14} />}
            {editingTest ? "Save Changes" : "Save Test"}
          </button>
        </div>
      </div>
    </>
  );
}

interface DetailViewProps {
  test: Test; questions: TestQuestion[]; subject: Subject | null;
  onBack: () => void; onEdit: () => void; onDelete: () => void;
  onAnalyse: () => void; analyzing: boolean;
}

function DetailView({ test, questions, subject, onBack, onEdit, onDelete, onAnalyse, analyzing }: DetailViewProps) {
  const pct = test.max_score > 0 && test.score != null ? Math.round((test.score / test.max_score) * 100) : null;

  // Answer-entry + AI review state
  const [userAnswers, setUserAnswers] = useState<string[]>(() => questions.map((q) => q.user_answer ?? ""));
  const [reviews, setReviews] = useState<(TestQuestionReview | null)[]>(() => questions.map(() => null));
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
        userAnswers,
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
        <button className="notion-btn secondary" onClick={onBack} style={{ padding: "6px 10px" }}><ChevronLeft size={16} /></button>
        <h1 className="page-title" style={{ margin: 0, flex: 1 }}>{test.name}</h1>
        {!showReviewMode && (
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className="notion-btn primary"
              onClick={onAnalyse}
              disabled={analyzing}
            >
              {analyzing ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={14} />}
              Analyse using AI
            </button>
            <button className="notion-btn secondary" onClick={onEdit}><Edit3 size={14} /> Edit</button>
            <button className="notion-btn danger" onClick={onDelete}><Trash2 size={14} /> Delete</button>
          </div>
        )}
        {showReviewMode && (
          <button className="notion-btn secondary" onClick={handleExitReview}>Exit Review</button>
        )}
      </div>
      <div className="divider" />

      <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "700px" }}>
        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
          {subject && (
            <div className="test-meta-item"><div className="test-meta-label">Subject</div><div>{subject.icon || "📚"} {subject.name}</div></div>
          )}
          {test.test_date && (
            <div className="test-meta-item"><div className="test-meta-label">Date</div><div>{new Date(test.test_date).toLocaleDateString()}</div></div>
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
                  <span className={`test-score-badge ${pct >= 80 ? "good" : pct >= 50 ? "ok" : "low"}`} style={{ marginLeft: "8px" }}>{pct}%</span>
                )}
              </div>
            </div>
          )}
          {test.source_type !== "manual" && (
            <div className="test-meta-item"><div className="test-meta-label">Source</div><div>{test.source_type}</div></div>
          )}
        </div>

        {test.description && (
          <div>
            <div className="test-meta-label">Description</div>
            <div style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "4px" }}>{test.description}</div>
          </div>
        )}

        {/* AI Review banner */}
        {!showReviewMode && questions.length > 0 && (
          <div className="test-review-cta">
            <div>
              <div style={{ fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                <MessageSquare size={16} style={{ color: "var(--accent-color)" }} /> AI Answer Review
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                Enter the answers you wrote on this test and let AI comment on each question — especially the ones you got wrong.
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
                <>AI reviewed <strong>{reviewedCount}</strong> of {questions.length} questions · <strong style={{ color: "var(--success-color)" }}>{correctCount} correct</strong></>
              ) : (
                <>Enter your answers below, then click "Run AI Review".</>
              )}
            </div>
            <button className="notion-btn primary" onClick={handleRunAIReview} disabled={reviewing}>
              {reviewing ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={14} />}
              Run AI Review
            </button>
          </div>
        )}

        {reviewError && (
          <div style={{ padding: "10px 12px", border: "1px solid var(--danger-color)", borderRadius: "8px", backgroundColor: "var(--danger-light)", color: "var(--danger-color)", fontSize: "0.85rem" }}>
            {reviewError}
          </div>
        )}

        {test.source_data && !showReviewMode && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
              <Eye size={16} style={{ color: "var(--accent-color)" }} />
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Original Source</span>
            </div>
            {test.source_type === "text" && (<pre className="test-source-text">{test.source_data}</pre>)}
            {test.source_type === "image" && (() => {
              let urls: string[] = [];
              try {
                const parsed = JSON.parse(test.source_data);
                if (Array.isArray(parsed)) urls = parsed;
                else urls = [test.source_data]; // legacy single-image format
              } catch { urls = [test.source_data]; }
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
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", padding: "12px", border: "1px dashed var(--border-color)", borderRadius: "8px" }}>
                PDF source stored ({Math.round(test.source_data.length / 1024)} KB base64). PDF preview in detail view is deferred.
              </div>
            )}
          </div>
        )}

        <div>
          <div style={{ fontWeight: 600, marginBottom: "10px", color: "var(--text-primary)" }}>
            Questions ({questions.length}){showReviewMode && " — enter your answers"}
          </div>
          {questions.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
              No questions saved for this test.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {questions.map((q, idx) => {
                const review = reviews[idx];
                const hasReview = review !== null;
                return (
                  <div key={q.id} className={`test-question-card ${hasReview ? (review!.isCorrect ? "review-correct" : "review-wrong") : ""}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--accent-color)", textTransform: "uppercase" }}>{q.type}</span>
                      <div>
                        {q.score != null && (
                          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginRight: "8px" }}>Score: {q.score}</span>
                        )}
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Q{idx + 1}</span>
                      </div>
                    </div>
                    <div style={{ color: "var(--text-primary)", fontSize: "0.9rem" }}>{q.question}</div>
                    {q.options && q.options.length > 0 && !showReviewMode && (
                      <ul style={{ margin: "6px 0 0 20px", padding: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        {q.options.map((o, i) => (<li key={i}>{o}</li>))}
                      </ul>
                    )}

                    {showReviewMode && (
                      <div style={{ marginTop: "10px" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "4px" }}>Your answer:</div>
                        {q.type === "multiple-choice" && q.options && q.options.length > 0 ? (
                          <select
                            className="form-input"
                            value={userAnswers[idx]}
                            onChange={(e) => handleAnswerChange(idx, e.target.value)}
                            disabled={reviewing}
                          >
                            <option value="">— Select an option —</option>
                            {q.options.map((o, i) => (<option key={i} value={o}>{o}</option>))}
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
                      <div style={{ marginTop: "6px", fontSize: "0.85rem", color: "var(--text-primary)", backgroundColor: "var(--bg-secondary)", padding: "4px 8px", borderRadius: "4px", display: "inline-block" }}>
                        <strong>Your answer:</strong> {q.user_answer}
                      </div>
                    )}

                    {(q.math_work || q.type === "maths") && (
                      <div style={{ marginTop: "8px", padding: "10px 14px", backgroundColor: "var(--bg-secondary)", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent-color)", marginBottom: "4px" }}>
                          🧮 Math Work & Steps Shown
                        </div>
                        {q.math_work ? (
                          <MathText style={{ fontSize: "0.9rem", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{q.math_work}</MathText>
                        ) : (
                          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" }}>No math working out recorded for this question.</span>
                        )}
                      </div>
                    )}

                    {!showReviewMode && q.correct_answer && (
                      <div style={{ marginTop: "4px", fontSize: "0.8rem", color: "var(--success-color)" }}>✓ Correct answer: {q.correct_answer}</div>
                    )}

                    {hasReview && (
                      <div className="test-review-feedback">
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                          {review!.isCorrect ? (
                            <CheckCircle2 size={16} style={{ color: "var(--success-color)" }} />
                          ) : (
                            <XCircle size={16} style={{ color: "var(--danger-color)" }} />
                          )}
                          <span style={{ fontWeight: 600, fontSize: "0.82rem", color: review!.isCorrect ? "var(--success-color)" : "var(--danger-color)" }}>
                            {review!.isCorrect ? "Correct" : "Incorrect"}
                          </span>
                        </div>
                        {review!.correctAnswer && (
                          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
                            <strong>Correct answer:</strong> {review!.correctAnswer}
                          </div>
                        )}
                        <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
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
