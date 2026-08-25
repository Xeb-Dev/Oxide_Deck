import React from "react";
import {
  ChevronLeft,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  Image as ImageIcon,
  ImagePlus,
  Type,
  FileUp,
  ClipboardList,
  X,
} from "lucide-react";
import StatusBanner, { StatusVariant } from "../../components/StatusBanner";
import MathText from "../../components/MathText";
import type { Subject, Test, TestQuestionType } from "../../services/db";
import type { PdfExtractionResult } from "../../services/pdf";
import { ScanTab, EditableQuestion, QUESTION_TYPES } from "./types";

interface EditViewProps {
  editingTest: Test | null;
  subjects: Subject[];
  editSubjectId: string;
  setEditSubjectId: (v: string) => void;
  editName: string;
  setEditName: (v: string) => void;
  editDescription: string;
  setEditDescription: (v: string) => void;
  editScore: string;
  setEditScore: (v: string) => void;
  editMaxScore: string;
  setEditMaxScore: (v: string) => void;
  editTestDate: string;
  setEditTestDate: (v: string) => void;
  editTimeLimit: string;
  setEditTimeLimit: (v: string) => void;
  scanTab: ScanTab;
  setScanTab: (v: ScanTab) => void;
  scanText: string;
  setScanText: (v: string) => void;
  onScanText: () => void;
  onPdfUpload: (file: File) => void;
  onScanPdf: () => void;
  pdfExtraction: PdfExtractionResult | null;
  onImagesAdded: (files: FileList | File[]) => void;
  onScanImages: () => void;
  onRemoveImage: (idx: number) => void;
  onDrop: (e: React.DragEvent) => void;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  images: { dataUrl: string; base64: string; mime: string; name: string }[];
  extractedQuestions: EditableQuestion[];
  addManualQuestion: () => void;
  updateQuestion: (idx: number, patch: Partial<EditableQuestion>) => void;
  deleteQuestion: (idx: number) => void;
  scanning: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  status: { message: string; variant: StatusVariant } | null;
  setStatus: (s: { message: string; variant: StatusVariant } | null) => void;
}

export default function TestEditView(props: EditViewProps) {
  const {
    editingTest,
    subjects,
    editSubjectId,
    setEditSubjectId,
    editName,
    setEditName,
    editDescription,
    setEditDescription,
    editScore,
    setEditScore,
    editMaxScore,
    setEditMaxScore,
    editTestDate,
    setEditTestDate,
    editTimeLimit,
    setEditTimeLimit,
    scanTab,
    setScanTab,
    scanText,
    setScanText,
    onScanText,
    onPdfUpload,
    onScanPdf,
    pdfExtraction,
    onImagesAdded,
    onScanImages,
    onRemoveImage,
    onDrop,
    dragOver,
    setDragOver,
    images,
    extractedQuestions,
    addManualQuestion,
    updateQuestion,
    deleteQuestion,
    scanning,
    saving,
    onSave,
    onCancel,
    status,
    setStatus,
  } = props;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          className="notion-btn secondary"
          onClick={onCancel}
          style={{ padding: "6px 10px" }}
        >
          <ChevronLeft size={16} />
        </button>
        <h1 className="page-title" style={{ margin: 0 }}>
          {editingTest ? "Edit Test" : "Add Test"}
        </h1>
      </div>
      <div className="divider" />

      {status && (
        <StatusBanner
          message={status.message}
          variant={status.variant}
          onDismiss={status.variant === "error" ? () => setStatus(null) : undefined}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "700px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <label className="form-label">
            Subject
            <select
              className="form-input"
              value={editSubjectId}
              onChange={(e) => setEditSubjectId(e.target.value)}
              disabled={!!editingTest}
            >
              <option value="">Select a subject…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon || "📚"} {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Test name
            <input
              className="form-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="e.g. Midterm Exam 1"
            />
          </label>
          <label className="form-label">
            Description (optional)
            <textarea
              className="form-input"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={2}
              placeholder="Notes about this test…"
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px" }}>
            <label className="form-label">
              Score
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                Points earned
              </div>
              <input
                className="form-input"
                type="number"
                value={editScore}
                onChange={(e) => setEditScore(e.target.value)}
                placeholder="e.g. 85"
              />
            </label>
            <label className="form-label">
              Max score
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                Total possible points
              </div>
              <input
                className="form-input"
                type="number"
                value={editMaxScore}
                onChange={(e) => setEditMaxScore(e.target.value)}
                placeholder="100"
              />
            </label>
            <label className="form-label">
              Test date
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                Date exam taken
              </div>
              <input
                className="form-input"
                type="date"
                value={editTestDate}
                onChange={(e) => setEditTestDate(e.target.value)}
              />
            </label>
            <label className="form-label">
              Time allowed (mins)
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                Duration/time limit
              </div>
              <input
                className="form-input"
                type="number"
                value={editTimeLimit}
                onChange={(e) => setEditTimeLimit(e.target.value)}
                placeholder="e.g. 60"
              />
            </label>
          </div>
        </div>

        <div className="divider" />

        <div>
          <div
            style={{
              fontWeight: 600,
              marginBottom: "10px",
              color: "var(--text-primary)",
            }}
          >
            <Sparkles size={16} style={{ verticalAlign: "middle", marginRight: "6px" }} />
            Scan test paper (optional)
          </div>
          <div className="test-scan-tabs">
            <button
              className={scanTab === "text" ? "active" : ""}
              onClick={() => setScanTab("text")}
            >
              <Type size={14} /> Text
            </button>
            <button
              className={scanTab === "pdf" ? "active" : ""}
              onClick={() => setScanTab("pdf")}
            >
              <FileUp size={14} /> PDF
            </button>
            <button
              className={scanTab === "image" ? "active" : ""}
              onClick={() => setScanTab("image")}
            >
              <ImageIcon size={14} /> Image
            </button>
            <button
              className={scanTab === "manual" ? "active" : ""}
              onClick={() => setScanTab("manual")}
            >
              <ClipboardList size={14} /> Manual
            </button>
          </div>

          <div style={{ marginTop: "12px" }}>
            {scanTab === "text" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <textarea
                  className="form-input"
                  value={scanText}
                  onChange={(e) => setScanText(e.target.value)}
                  rows={6}
                  placeholder="Paste the test questions text here…"
                />
                <button
                  className="notion-btn primary"
                  onClick={onScanText}
                  disabled={!scanning && !scanText.trim()}
                >
                  {scanning ? (
                    <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  {scanning ? "Stop Extracting" : "Extract Questions"}
                </button>
              </div>
            )}
            {scanTab === "pdf" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => e.target.files?.[0] && onPdfUpload(e.target.files[0])}
                  style={{ fontSize: "0.85rem" }}
                />
                {pdfExtraction && (
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    PDF loaded ({pdfExtraction.fullText.length} chars). Has selectable text:{" "}
                    {pdfExtraction.hasSelectableText ? "yes" : "no"}
                  </div>
                )}
                <button
                  className="notion-btn primary"
                  onClick={onScanPdf}
                  disabled={!scanning && !pdfExtraction}
                >
                  {scanning ? (
                    <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  {scanning ? "Stop Extracting" : "Extract Questions"}
                </button>
              </div>
            )}
            {scanTab === "image" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div
                  className={`test-image-dropzone ${dragOver ? "drag-over" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => document.getElementById("test-image-input")?.click()}
                >
                  <ImageIcon size={28} style={{ color: "var(--text-muted)" }} />
                  <div
                    style={{
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      fontSize: "0.9rem",
                    }}
                  >
                    <span className="desktop-drop-hint">Drag & drop images here</span>
                    <span
                      className="phone-add-picture-btn"
                      style={{ fontSize: "0.85rem", padding: "6px 14px", gap: "6px" }}
                    >
                      <ImagePlus size={15} /> Add Pictures
                    </span>
                  </div>
                  <div
                    className="desktop-drop-hint"
                    style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}
                  >
                    or click to browse · multiple images supported
                  </div>
                  <input
                    id="test-image-input"
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0)
                        onImagesAdded(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>

                {images.length > 0 && (
                  <>
                    <div className="test-image-gallery">
                      {images.map((img, idx) => (
                        <div key={idx} className="test-image-thumb">
                          <img src={img.dataUrl} alt={img.name} />
                          <button
                            className="test-image-remove"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveImage(idx);
                            }}
                            title="Remove image"
                          >
                            <X size={12} />
                          </button>
                          <span className="test-image-name">{img.name}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      className="notion-btn primary"
                      onClick={onScanImages}
                      disabled={!scanning && images.length === 0}
                    >
                      {scanning ? (
                        <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      {scanning ? "Stop Extracting" : "Extract Questions"}
                    </button>
                  </>
                )}

                {scanning && images.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "0.85rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Scanning{" "}
                    {images.length} image(s)…
                  </div>
                )}
              </div>
            )}
            {scanTab === "manual" && (
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Add questions manually using the list below.
              </div>
            )}
          </div>
        </div>

        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "10px",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
              Questions ({extractedQuestions.length})
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="notion-btn secondary" onClick={addManualQuestion}>
                <Plus size={14} /> Add Question
              </button>
            </div>
          </div>
          {extractedQuestions.length === 0 ? (
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "0.85rem",
                border: "1px dashed var(--border-color)",
                borderRadius: "8px",
              }}
            >
              No questions yet. Scan a paper or add manually.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {extractedQuestions.map((q, idx) => (
                <div
                  key={idx}
                  className="test-question-card"
                  style={{ display: "flex", flexDirection: "column", gap: "8px" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-end",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        Question {idx + 1} Type
                      </div>
                      <select
                        className="form-input"
                        style={{ width: "180px", marginTop: "4px" }}
                        value={q.type}
                        onChange={(e) =>
                          updateQuestion(idx, { type: e.target.value as TestQuestionType })
                        }
                      >
                        {QUESTION_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      className="notion-btn danger"
                      style={{ padding: "4px 8px" }}
                      onClick={() => deleteQuestion(idx)}
                      title="Delete question"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      Question Text
                    </div>
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--text-muted)",
                        marginBottom: "4px",
                      }}
                    >
                      Enter the question or prompt as presented on the test paper
                    </div>
                    <textarea
                      className="form-input"
                      value={q.question}
                      onChange={(e) => updateQuestion(idx, { question: e.target.value })}
                      rows={2}
                      placeholder="e.g. What is the capital of France?"
                    />
                  </div>

                  {q.type === "multiple-choice" && (
                    <div>
                      <div
                        style={{
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        Multiple Choice Options
                      </div>
                      <div
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--text-muted)",
                          marginBottom: "4px",
                        }}
                      >
                        Enter choices, one per line
                      </div>
                      <textarea
                        className="form-input"
                        value={q.options.join("\n")}
                        onChange={(e) =>
                          updateQuestion(idx, { options: e.target.value.split("\n") })
                        }
                        rows={4}
                        placeholder={"Option A\nOption B\nOption C\nOption D"}
                      />
                    </div>
                  )}

                  {(q.type === "maths" || q.mathWork.trim().length > 0) && (
                    <div>
                      <div
                        style={{
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        Math Work / Steps Shown
                      </div>
                      <div
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--text-muted)",
                          marginBottom: "4px",
                        }}
                      >
                        Step-by-step mathematical working out, calculations, or derivations
                      </div>
                      <textarea
                        className="form-input"
                        value={q.mathWork}
                        onChange={(e) => updateQuestion(idx, { mathWork: e.target.value })}
                        rows={4}
                        placeholder={"Step 1: 2x + 5 = 15\nStep 2: 2x = 10\nStep 3: x = 5"}
                      />
                      {q.mathWork.trim() && (
                        <div
                          style={{
                            marginTop: "6px",
                            padding: "8px 12px",
                            backgroundColor: "var(--bg-secondary)",
                            borderRadius: "6px",
                            border: "1px solid var(--border-color)",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              color: "var(--text-muted)",
                              marginBottom: "4px",
                            }}
                          >
                            Math Preview:
                          </div>
                          <MathText
                            style={{
                              fontSize: "0.9rem",
                              color: "var(--text-primary)",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {q.mathWork}
                          </MathText>
                        </div>
                      )}
                    </div>
                  )}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 110px",
                      gap: "10px",
                      marginTop: "2px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        Correct Answer
                      </div>
                      <div
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--text-muted)",
                          marginBottom: "4px",
                        }}
                      >
                        Official correct answer
                      </div>
                      <input
                        className="form-input"
                        value={q.correctAnswer}
                        onChange={(e) => updateQuestion(idx, { correctAnswer: e.target.value })}
                        placeholder="e.g. Paris"
                      />
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        What's Your Answer?
                      </div>
                      <div
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--text-muted)",
                          marginBottom: "4px",
                        }}
                      >
                        Student's response on test
                      </div>
                      <input
                        className="form-input"
                        value={q.userAnswer}
                        onChange={(e) => updateQuestion(idx, { userAnswer: e.target.value })}
                        placeholder="e.g. Paris"
                      />
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        Score
                      </div>
                      <div
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--text-muted)",
                          marginBottom: "4px",
                        }}
                      >
                        Points earned
                      </div>
                      <input
                        className="form-input"
                        type="number"
                        value={q.score}
                        onChange={(e) => updateQuestion(idx, { score: e.target.value })}
                        placeholder="100"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            justifyContent: "flex-end",
            marginTop: "8px",
          }}
        >
          <button className="notion-btn secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="notion-btn primary" onClick={onSave} disabled={saving}>
            {saving ? (
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <Plus size={14} />
            )}
            {editingTest ? "Save Changes" : "Save Test"}
          </button>
        </div>
      </div>
    </>
  );
}
