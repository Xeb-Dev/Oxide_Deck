import React, { useEffect, useState, useRef } from "react";
import { Loader2 } from "lucide-react";
import {
  getSubjects,
  getTestsBySubject,
  getTestQuestions,
  createTest,
  updateTest,
  deleteTest,
  bulkCreateTestQuestions,
  deleteTestQuestions,
  getSubjectTestTrend,
  saveTestAnalysis,
  getAllTestAnalyses,
  getTestAnalysisByTestId,
  getTestErrorsByTestId,
  Subject,
  Test,
  TestQuestion,
  TestTrendPoint,
  TestAnalysis,
} from "../services/db";
import {
  scanTextForTestQuestions,
  scanPdfForTestQuestions,
  scanImageForTestQuestions,
  analyzeTestMetadata,
  analyzeTestWithAI,
  FullTestAnalysisResult,
  ExtractedTestQuestion,
  is503Error,
} from "../services/llm";
import {
  extractStructuredTextFromPDF,
  buildPdfPromptText,
  PdfExtractionResult,
} from "../services/pdf";
import StatusBanner, { StatusVariant } from "../components/StatusBanner";
import {
  View,
  ScanTab,
  EditableQuestion,
  emptyQuestion,
  SERVICE_UNAVAILABLE_MSG,
} from "./test/types";
import TestListView from "./test/TestListView";
import TestEditView from "./test/TestEditView";
import TestDetailView from "./test/TestDetailView";
import TestAnalysisModal from "./test/TestAnalysisModal";

interface Props {
  currentNav: { subjectId?: string };
  setCurrentNav: (nav: any) => void;
}

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
  const [analysisModalData, setAnalysisModalData] = useState<{
    test: Test;
    result: FullTestAnalysisResult;
  } | null>(null);
  const [analyzedTestMap, setAnalyzedTestMap] = useState<Record<string, TestAnalysis>>({});

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
  const abortControllerRef = useRef<AbortController | null>(null);

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

      const analyses = await getAllTestAnalyses();
      const map: Record<string, TestAnalysis> = {};
      for (const a of analyses) {
        map[a.test_id] = a;
      }
      setAnalyzedTestMap(map);
    } catch (e) {
      console.error(e);
      setStatus({ message: "Failed to load tests.", variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleReviewTestAnalysis = async (targetTest: Test, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const analysis = await getTestAnalysisByTestId(targetTest.id);
      if (!analysis) {
        setStatus({ message: "No saved analysis found for this test.", variant: "warning" });
        return;
      }
      const errors = await getTestErrorsByTestId(targetTest.id);
      const analysisResult: FullTestAnalysisResult = {
        summary: analysis.summary,
        strengths: analysis.strengths || "",
        weaknesses: analysis.weaknesses || "",
        recommendations: analysis.recommendations || "",
        calculatedScore: targetTest.score || 0,
        maxScore: targetTest.max_score || 100,
        errors: errors.map((err) => ({
          questionId: err.question_id ?? undefined,
          questionText: err.question_text,
          userAnswer: err.user_answer ?? "",
          correctAnswer: err.correct_answer ?? "",
          errorReason: err.error_reason,
          score: err.score ?? 0,
        })),
      };
      setAnalysisModalData({ test: targetTest, result: analysisResult });
    } catch (err: any) {
      console.error(err);
      setStatus({ message: "Failed to load test analysis.", variant: "error" });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (currentNav.subjectId && view === "list") {
      setExpandedSubject(currentNav.subjectId);
    }
  }, [currentNav.subjectId]);

  const loadTrend = async (subjectId: string) => {
    try {
      const trend = await getSubjectTestTrend(subjectId);
      setTrendBySubject((prev) => ({ ...prev, [subjectId]: trend }));
    } catch (e) {
      console.error(e);
    }
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
      setExtractedQuestions(
        qs.map((q) => ({
          type: q.type,
          question: q.question,
          options: q.options ?? [],
          correctAnswer: q.correct_answer ?? "",
          userAnswer: q.user_answer ?? "",
          score: q.score != null ? String(q.score) : "",
          mathWork: q.math_work ?? "",
        }))
      );
    } catch (e) {
      console.error(e);
      setExtractedQuestions([]);
    } finally {
      setScanning(false);
    }
  };

  const openDetail = async (test: Test) => {
    try {
      setDetailTest(test);
      setDetailQuestions(await getTestQuestions(test.id));
      setDetailSubject(subjects.find((s) => s.id === test.subject_id) ?? null);
      setView("detail");
    } catch (e) {
      console.error(e);
      setStatus({ message: "Failed to load test details.", variant: "error" });
    }
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

      await saveTestAnalysis(
        targetTest.id,
        targetTest.subject_id,
        analysisResult.summary,
        analysisResult.strengths,
        analysisResult.weaknesses,
        analysisResult.recommendations,
        analysisResult.errors
      );

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
      setStatus({
        message: `AI Analysis complete! ${analysisResult.errors.length} error(s) logged to Scores tab.`,
        variant: "success",
      });
    } catch (err: any) {
      console.error(err);
      if (is503Error(err)) {
        setStatus({ message: SERVICE_UNAVAILABLE_MSG, variant: "error" });
      } else {
        setStatus({ message: err?.message || "AI Analysis failed.", variant: "error" });
      }
    } finally {
      setAnalyzingTestId(null);
    }
  };

  const stopScanning = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setScanning(false);
    setStatus({ message: "Operation stopped.", variant: "info" });
  };

  const autoFillMetadata = async (
    sourceText: string,
    questions: ExtractedTestQuestion[],
    signal?: AbortSignal
  ) => {
    try {
      const meta = await analyzeTestMetadata(sourceText, questions, signal);
      if (signal?.aborted) return;
      if (!editName.trim() && meta.name) setEditName(meta.name);
      if (!editDescription.trim() && meta.description) setEditDescription(meta.description);

      let computedScore = meta.score;
      let computedMaxScore = meta.maxScore || 100;
      if (computedScore == null && questions.length > 0) {
        const validScores = questions
          .map((q) => q.score)
          .filter((s): s is number => typeof s === "number");
        if (validScores.length > 0) {
          computedScore = Math.round(
            validScores.reduce((a, b) => a + b, 0) / validScores.length
          );
        }
      }
      if (computedScore != null) setEditScore(String(computedScore));
      if (computedMaxScore != null) setEditMaxScore(String(computedMaxScore));
      if (
        (!editTestDate || editTestDate === new Date().toISOString().slice(0, 10)) &&
        meta.testDate
      )
        setEditTestDate(meta.testDate);
      if (!editTimeLimit && meta.timeLimitMinutes)
        setEditTimeLimit(String(meta.timeLimitMinutes));
    } catch (e: any) {
      if (e?.name !== "AbortError" && !signal?.aborted) {
        console.error("Auto-fill metadata failed:", e);
      }
    }
  };

  const handleScanText = async () => {
    if (scanning) {
      stopScanning();
      return;
    }
    if (!scanText.trim()) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setScanning(true);
    try {
      const result = await scanTextForTestQuestions(scanText, controller.signal);
      if (controller.signal.aborted) return;
      setExtractedQuestions(
        result.map((q) => ({
          type: q.type,
          question: q.question,
          options: q.options ?? [],
          correctAnswer: q.correctAnswer ?? "",
          userAnswer: q.userAnswer ?? "",
          score: q.score != null ? String(q.score) : "",
          mathWork: q.mathWork ?? "",
        }))
      );
      await autoFillMetadata(scanText, result, controller.signal);
      if (!controller.signal.aborted) {
        setStatus({ message: `Extracted ${result.length} question(s).`, variant: "success" });
      }
    } catch (e: any) {
      if (controller.signal.aborted || e?.name === "AbortError") {
        setStatus({ message: "Scan stopped.", variant: "info" });
      } else if (is503Error(e)) {
        setStatus({ message: SERVICE_UNAVAILABLE_MSG, variant: "error" });
      } else {
        console.error(e);
        setStatus({ message: e?.message || "Scan failed.", variant: "error" });
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setScanning(false);
    }
  };

  const handlePdfUpload = async (file: File) => {
    try {
      setScanning(true);
      const arrayBuffer = await file.arrayBuffer();
      const extraction = await extractStructuredTextFromPDF(arrayBuffer);
      setPdfExtraction(extraction);
      setPdfFileData(new Uint8Array(arrayBuffer));
      setStatus({
        message: "PDF loaded. Click 'Extract Questions' to scan.",
        variant: "info",
      });
    } catch (e: any) {
      console.error(e);
      setStatus({ message: e?.message || "Failed to load PDF.", variant: "error" });
    } finally {
      setScanning(false);
    }
  };

  const handleScanPdf = async () => {
    if (scanning) {
      stopScanning();
      return;
    }
    if (!pdfExtraction) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setScanning(true);
    try {
      const pdfText = buildPdfPromptText(pdfExtraction);
      const result = await scanPdfForTestQuestions(pdfText, controller.signal);
      if (controller.signal.aborted) return;
      setExtractedQuestions(
        result.map((q) => ({
          type: q.type,
          question: q.question,
          options: q.options ?? [],
          correctAnswer: q.correctAnswer ?? "",
          userAnswer: q.userAnswer ?? "",
          score: q.score != null ? String(q.score) : "",
          mathWork: q.mathWork ?? "",
        }))
      );
      await autoFillMetadata(pdfText, result, controller.signal);
      if (!controller.signal.aborted) {
        setStatus({
          message: `Extracted ${result.length} question(s) from PDF.`,
          variant: "success",
        });
      }
    } catch (e: any) {
      if (controller.signal.aborted || e?.name === "AbortError") {
        setStatus({ message: "Scan stopped.", variant: "info" });
      } else if (is503Error(e)) {
        setStatus({ message: SERVICE_UNAVAILABLE_MSG, variant: "error" });
      } else {
        console.error(e);
        setStatus({ message: e?.message || "PDF scan failed.", variant: "error" });
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setScanning(false);
    }
  };

  const readFileAsDataUrl = (
    file: File
  ): Promise<{ dataUrl: string; base64: string; mime: string; name: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve({
          dataUrl,
          base64: dataUrl.split(",")[1] ?? "",
          mime: file.type,
          name: file.name,
        });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleImagesAdded = async (fileList: FileList | File[]) => {
    const imageFiles = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    try {
      const loaded = await Promise.all(imageFiles.map(readFileAsDataUrl));
      setImages((prev) => [...prev, ...loaded]);
      setStatus({
        message: `Added ${loaded.length} image(s). Click 'Extract Questions' to scan.`,
        variant: "info",
      });
    } catch (e: any) {
      console.error(e);
      setStatus({ message: e?.message || "Image upload failed.", variant: "error" });
    }
  };

  const handleScanImages = async () => {
    if (scanning) {
      stopScanning();
      return;
    }
    if (images.length === 0) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setScanning(true);
    let errorOccurred: any = null;
    try {
      const allQuestions: ExtractedTestQuestion[] = [];
      for (const img of images) {
        if (controller.signal.aborted) break;
        try {
          const result = await scanImageForTestQuestions(img.base64, img.mime, controller.signal);
          allQuestions.push(...result);
        } catch (e: any) {
          if (controller.signal.aborted || e?.name === "AbortError") break;
          console.error(`Failed to scan ${img.name}:`, e);
          errorOccurred = e;
        }
      }
      if (controller.signal.aborted) return;
      const editableQuestions: EditableQuestion[] = allQuestions.map((q) => ({
        type: q.type,
        question: q.question,
        options: q.options ?? [],
        correctAnswer: q.correctAnswer ?? "",
        userAnswer: q.userAnswer ?? "",
        score: q.score != null ? String(q.score) : "",
        mathWork: q.mathWork ?? "",
      }));
      if (editableQuestions.length > 0) {
        setExtractedQuestions((prev) => [...prev, ...editableQuestions]);
        await autoFillMetadata(
          JSON.stringify(
            allQuestions.map((q) => ({
              question: q.question,
              correctAnswer: q.correctAnswer,
              userAnswer: q.userAnswer,
            }))
          ),
          allQuestions,
          controller.signal
        );
        if (!controller.signal.aborted) {
          setStatus({
            message: `Added ${images.length} image(s). Extracted ${editableQuestions.length} question(s).`,
            variant: "success",
          });
        }
      } else if (errorOccurred && is503Error(errorOccurred)) {
        setStatus({ message: SERVICE_UNAVAILABLE_MSG, variant: "error" });
      } else {
        setStatus({
          message: `Added ${images.length} image(s), but no questions could be extracted.`,
          variant: "warning",
        });
      }
    } catch (e: any) {
      if (controller.signal.aborted || e?.name === "AbortError") {
        setStatus({ message: "Scan stopped.", variant: "info" });
      } else if (is503Error(e)) {
        setStatus({ message: SERVICE_UNAVAILABLE_MSG, variant: "error" });
      } else {
        console.error(e);
        setStatus({ message: e?.message || "Image scan failed.", variant: "error" });
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setScanning(false);
    }
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
    if (!editSubjectId) {
      setStatus({ message: "Please select a subject.", variant: "error" });
      return;
    }
    if (!editName.trim()) {
      setStatus({ message: "Please enter a test name.", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      const scoreNum = editScore.trim() === "" ? null : Number(editScore);
      const maxNum = Number(editMaxScore) || 100;
      const testDate = editTestDate || null;
      const timeLimitNum = editTimeLimit.trim() === "" ? null : Number(editTimeLimit);

      let sourceType: Test["source_type"] = "manual";
      let sourceData: string | null = null;
      if (scanTab === "text" && scanText.trim()) {
        sourceType = "text";
        sourceData = scanText;
      } else if (scanTab === "pdf" && pdfFileData) {
        sourceType = "pdf";
        sourceData = btoa(String.fromCharCode(...pdfFileData));
      } else if (scanTab === "image" && images.length > 0) {
        sourceType = "image";
        sourceData = JSON.stringify(images.map((img) => img.dataUrl));
      }

      let testId: string;
      if (editingTest) {
        await updateTest(
          editingTest.id,
          editName,
          editDescription || null,
          scoreNum,
          maxNum,
          testDate,
          timeLimitNum
        );
        await deleteTestQuestions(editingTest.id);
        testId = editingTest.id;
      } else {
        const created = await createTest(
          editSubjectId,
          editName,
          editDescription || null,
          sourceType,
          sourceData,
          scoreNum,
          maxNum,
          testDate,
          timeLimitNum
        );
        testId = created.id;
      }

      await bulkCreateTestQuestions(
        testId,
        extractedQuestions.map((q) => ({
          type: q.type,
          question: q.question,
          options: q.type === "multiple-choice" ? q.options : null,
          correctAnswer: q.correctAnswer || null,
          userAnswer: q.userAnswer || null,
          score: q.score.trim() === "" ? null : Number(q.score),
          mathWork: q.mathWork || null,
          sourcePage: null,
        }))
      );

      setStatus({ message: `Test "${editName}" saved.`, variant: "success" });
      await loadData();
      setView("list");
    } catch (e: any) {
      console.error(e);
      setStatus({ message: e?.message || "Failed to save test.", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTest = async (test: Test) => {
    if (!confirm(`Delete test "${test.name}"? This cannot be undone.`)) return;
    try {
      await deleteTest(test.id);
      setStatus({ message: "Test deleted.", variant: "success" });
      await loadData();
    } catch (e: any) {
      console.error(e);
      setStatus({ message: e?.message || "Failed to delete test.", variant: "error" });
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}>
        <Loader2 size={28} style={{ animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  if (view === "edit") {
    return (
      <TestEditView
        editingTest={editingTest}
        subjects={subjects}
        editSubjectId={editSubjectId}
        setEditSubjectId={setEditSubjectId}
        editName={editName}
        setEditName={setEditName}
        editDescription={editDescription}
        setEditDescription={setEditDescription}
        editScore={editScore}
        setEditScore={setEditScore}
        editMaxScore={editMaxScore}
        setEditMaxScore={setEditMaxScore}
        editTestDate={editTestDate}
        setEditTestDate={setEditTestDate}
        editTimeLimit={editTimeLimit}
        setEditTimeLimit={setEditTimeLimit}
        scanTab={scanTab}
        setScanTab={setScanTab}
        scanText={scanText}
        setScanText={setScanText}
        onScanText={handleScanText}
        onPdfUpload={handlePdfUpload}
        onScanPdf={handleScanPdf}
        pdfExtraction={pdfExtraction}
        onImagesAdded={handleImagesAdded}
        onScanImages={handleScanImages}
        onRemoveImage={removeImage}
        onDrop={handleDrop}
        dragOver={dragOver}
        setDragOver={setDragOver}
        images={images}
        extractedQuestions={extractedQuestions}
        addManualQuestion={addManualQuestion}
        updateQuestion={updateQuestion}
        deleteQuestion={deleteQuestion}
        scanning={scanning}
        saving={saving}
        onSave={handleSaveTest}
        onCancel={() => setView("list")}
        status={status}
        setStatus={setStatus}
      />
    );
  }

  if (view === "detail" && detailTest) {
    return (
      <TestDetailView
        test={detailTest}
        questions={detailQuestions}
        subject={detailSubject}
        onBack={() => setView("list")}
        onEdit={() => startEditTest(detailTest)}
        onDelete={() => handleDeleteTest(detailTest)}
        onAnalyse={() => handleAnalyseTestWithAI(detailTest)}
        analyzing={analyzingTestId === detailTest.id}
        hasAnalysis={!!analyzedTestMap[detailTest.id]}
        onReviewAnalysis={() => handleReviewTestAnalysis(detailTest)}
      />
    );
  }

  return (
    <>
      <div>
        <span className="page-emoji">📝</span>
        <h1 className="page-title">Tests</h1>
        <p className="sub-description">
          Save real-life subject exams you've taken. Scan a paper to extract questions, record your
          score, and track improvement over time.
        </p>
      </div>
      <div className="divider" />

      {status && (
        <StatusBanner
          message={status.message}
          variant={status.variant}
          onDismiss={status.variant === "error" ? () => setStatus(null) : undefined}
        />
      )}

      <TestListView
        subjects={subjects}
        testsBySubject={testsBySubject}
        trendBySubject={trendBySubject}
        expandedSubject={expandedSubject}
        toggleSubject={toggleSubject}
        startAddTest={startAddTest}
        openDetail={openDetail}
        analyzingTestId={analyzingTestId}
        analyzedTestMap={analyzedTestMap}
        handleReviewTestAnalysis={handleReviewTestAnalysis}
        handleAnalyseTestWithAI={handleAnalyseTestWithAI}
      />

      <TestAnalysisModal
        data={analysisModalData}
        onClose={() => setAnalysisModalData(null)}
        onReanalyze={handleAnalyseTestWithAI}
        onGoToScores={() => _setCurrentNav({ page: "scores" })}
      />
    </>
  );
}
