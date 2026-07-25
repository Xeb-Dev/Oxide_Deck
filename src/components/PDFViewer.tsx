import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import { Plus, Layers, Sparkles, X } from "lucide-react";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

export interface PdfSnippet {
  id: string;
  text: string;
  pageNumber: number;
}

export interface PdfViewerProps {
  fileData: Uint8Array | null;
  fileName?: string;
  highlightMap?: Record<number, number[]>;
  highlightTerms?: string[];
  busy?: boolean;
  onExtractSelection?: (selectedText: string, pageNumber: number) => void | Promise<void>;
  onExtractBatch?: (snippets: PdfSnippet[]) => void | Promise<void>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function PdfViewer({
  fileData,
  fileName = "",
  highlightMap = {},
  highlightTerms = [],
  busy = false,
  onExtractSelection,
  onExtractBatch,
}: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [selectedText, setSelectedText] = useState("");
  const [batchSnippets, setBatchSnippets] = useState<PdfSnippet[]>([]);
  const [floatingPos, setFloatingPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPageNumber(1);
    setSelectedText("");
    setBatchSnippets([]);
    setFloatingPos(null);
  }, [fileData, fileName]);

  const pdfFile = useMemo(() => {
    if (!fileData) return null;
    // Copy the data so pdfjs worker transfer doesn't detach the original
    return { data: fileData.slice() };
  }, [fileData]);

  useEffect(() => {
    const updateSelection = () => {
      const selection = window.getSelection();
      const container = containerRef.current;

      if (!selection || !container || selection.isCollapsed || selection.rangeCount === 0) {
        setSelectedText("");
        setFloatingPos(null);
        return;
      }

      const text = selection.toString().replace(/\s+/g, " ").trim();
      if (!text || text.length < 2) {
        setSelectedText("");
        setFloatingPos(null);
        return;
      }

      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;

      const isInsideViewer =
        !!anchorNode &&
        !!focusNode &&
        container.contains(anchorNode) &&
        container.contains(focusNode);

      if (!isInsideViewer) {
        setSelectedText("");
        setFloatingPos(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      if (rect.width > 0 && rect.height > 0) {
        // Calculate position relative to container
        const top = rect.top - containerRect.top - 46; // Position 46px above the top of the selection
        const left = rect.left - containerRect.left + rect.width / 2; // Center horizontally above selection

        setFloatingPos({
          top: Math.max(12, top),
          left: Math.max(100, Math.min(left, containerRect.width - 120)),
        });
        setSelectedText(text);
      } else {
        setSelectedText("");
        setFloatingPos(null);
      }
    };

    const handleMouseUp = () => {
      // Delay slightly to let browser complete selection bounds
      setTimeout(updateSelection, 10);
    };

    const handleMouseDown = (e: MouseEvent) => {
      // If clicking outside the floating tooltip, reset floating tooltip
      const target = e.target as HTMLElement;
      if (!target.closest('.pdf-floating-tooltip')) {
        // Allow user to click anywhere without losing selection mid-drag
      }
    };

    const containerEl = containerRef.current;
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keyup", handleMouseUp);
    if (containerEl) {
      containerEl.addEventListener("mousedown", handleMouseDown);
    }

    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keyup", handleMouseUp);
      if (containerEl) {
        containerEl.removeEventListener("mousedown", handleMouseDown);
      }
    };
  }, []);

  const onDocumentLoadSuccess = ({ numPages: nextNumPages }: { numPages: number }) => {
    setNumPages(nextNumPages);
    setPageNumber((prev) => Math.min(prev, nextNumPages || 1));
  };

  const highlightedIndexes = useMemo(
    () => new Set(highlightMap[pageNumber] || []),
    [highlightMap, pageNumber],
  );

  const pageBatchTerms = useMemo(() => {
    return batchSnippets
      .filter((s) => s.pageNumber === pageNumber)
      .map((s) => s.text.toLowerCase());
  }, [batchSnippets, pageNumber]);


  const renderHighlightedText = useCallback(({ str, itemIndex }: { str: string; itemIndex: number }) => {
    const safeText = escapeHtml(str);
    const cleanStr = str.trim().toLowerCase();

    if (highlightedIndexes.has(itemIndex)) {
      return `<mark class="pdf-viewer-highlight">${safeText}</mark>`;
    }

    if (cleanStr.length > 0 && pageBatchTerms.some((term) => term.includes(cleanStr))) {
      return `<mark class="pdf-viewer-batch-highlight">${safeText}</mark>`;
    }

    return safeText;
  }, [highlightedIndexes, pageBatchTerms]);

  const handleExtractSelection = async () => {
    if (!selectedText || !onExtractSelection) {
      return;
    }

    await onExtractSelection(selectedText, pageNumber);
    window.getSelection()?.removeAllRanges();
    setSelectedText("");
    setFloatingPos(null);
  };

  const handleAddToBatch = () => {
    if (!selectedText) return;
    const snippet: PdfSnippet = {
      id: crypto.randomUUID(),
      text: selectedText,
      pageNumber,
    };
    setBatchSnippets((prev) => [...prev, snippet]);
    window.getSelection()?.removeAllRanges();
    setSelectedText("");
    setFloatingPos(null);
  };

  const handleRemoveFromBatch = (id: string) => {
    setBatchSnippets((prev) => prev.filter((s) => s.id !== id));
  };

  const handleClearBatch = () => {
    setBatchSnippets([]);
  };

  const handleExtractBatch = async () => {
    if (batchSnippets.length === 0 || !onExtractBatch) return;
    await onExtractBatch(batchSnippets);
    setBatchSnippets([]);
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        minHeight: "680px",
        width: "95%",
        margin: "0 auto",
        border: "1px solid var(--border-color)",
        borderRadius: "12px",
        overflow: "hidden",
        background: "var(--bg-secondary)",
      }}
    >
      <style>
        {`
          .pdf-viewer-ui,
          .pdf-viewer-toolbar,
          .pdf-viewer-selection-bar,
          .pdf-floating-tooltip,
          .pdf-batch-queue {
            user-select: none !important;
            -webkit-user-select: none !important;
          }
          .react-pdf__Page__textContent,
          .textLayer {
            user-select: text !important;
            -webkit-user-select: text !important;
          }
          .react-pdf__Page__textContent span,
          .textLayer span {
            user-select: text !important;
            -webkit-user-select: text !important;
          }
          .react-pdf__Page__textContent ::selection,
          .textLayer ::selection {
            background: rgba(99, 102, 241, 0.35) !important;
            color: transparent !important;
          }
          .pdf-viewer-highlight {
            background-color: rgba(250, 204, 21, 0.5) !important;
            color: transparent !important;
            border-radius: 3px;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.4);
          }
          .pdf-viewer-batch-highlight {
            background-color: rgba(99, 102, 241, 0.45) !important;
            color: transparent !important;
            border-radius: 3px;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.5);
          }
        `}
      </style>

      {/* FLOATING ACTION TOOLTIP RIGHT BESIDE SELECTION */}
      {floatingPos && selectedText && (
        <div
          className="pdf-floating-tooltip"
          style={{
            position: "absolute",
            top: `${floatingPos.top}px`,
            left: `${floatingPos.left}px`,
            transform: "translateX(-50%)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "5px 10px",
            borderRadius: "20px",
            background: "var(--bg-primary, #1e1e2e)",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px var(--border-color, rgba(255, 255, 255, 0.15))",
            whiteSpace: "nowrap",
            pointerEvents: "auto",
          }}
        >
          <button
            className="notion-btn"
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleAddToBatch}
            style={{
              padding: "4px 10px",
              fontSize: "0.78rem",
              borderRadius: "14px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "var(--accent-color, #6366f1)",
              color: "#fff",
            }}
          >
            <Plus size={13} /> Add to Batch
          </button>

          <button
            className="notion-btn secondary"
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            disabled={busy || !onExtractSelection}
            onClick={handleExtractSelection}
            style={{
              padding: "4px 10px",
              fontSize: "0.78rem",
              borderRadius: "14px",
            }}
          >
            Extract Now
          </button>
        </div>
      )}

      <div
        className="pdf-viewer-toolbar"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          alignItems: "center",
          padding: "14px 16px",
          background: "var(--bg-primary)",
          borderBottom: "1px solid var(--border-color)",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontWeight: 700 }}>{fileName || "PDF Viewer"}</span>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            {highlightTerms.length > 0
              ? `${highlightTerms.length} highlighted terms`
              : "Load a PDF and extract definitions to see highlights"}
          </span>
        </div>

        {fileData && (
          <>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                className="notion-btn secondary"
                type="button"
                disabled={pageNumber <= 1}
                onClick={() => setPageNumber((prev) => Math.max(prev - 1, 1))}
              >
                Prev
              </button>
              <span style={{ minWidth: "110px", textAlign: "center" }}>
                Page {pageNumber} of {numPages}
              </span>
              <button
                className="notion-btn secondary"
                type="button"
                disabled={pageNumber >= numPages}
                onClick={() => setPageNumber((prev) => Math.min(prev + 1, numPages))}
              >
                Next
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                className="notion-btn secondary"
                type="button"
                onClick={() => setScale((prev) => Math.max(prev - 0.2, 0.5))}
              >
                -
              </button>
              <span style={{ minWidth: "54px", textAlign: "center" }}>{Math.round(scale * 100)}%</span>
              <button
                className="notion-btn secondary"
                type="button"
                onClick={() => setScale((prev) => Math.min(prev + 0.2, 3))}
              >
                +
              </button>
            </div>
          </>
        )}
      </div>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "24px",
          background: "#11111b",
        }}
      >
        {pdfFile ? (
          <Document
            file={pdfFile}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={<div style={{ color: "#fff" }}>Loading PDF document...</div>}
          >
            <Page
              key={`${pageNumber}-${scale}-${(highlightMap[pageNumber] || []).join(",")}`}
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer
              renderAnnotationLayer
              customTextRenderer={renderHighlightedText}
            />
          </Document>
        ) : (
          <div style={{ color: "#888", marginTop: "40px", textAlign: "center" }}>
            No PDF loaded yet. Upload a PDF in the PDF tab to start extracting and highlighting terms.
          </div>
        )}
      </div>

      {/* BOTTOM BATCH QUEUE ACTION PANEL */}
      {fileData && batchSnippets.length > 0 && (
        <div
          className="pdf-batch-queue"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            padding: "14px 16px",
            background: "var(--bg-primary)",
            borderTop: "1px solid var(--border-color)",
            userSelect: "none",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <span style={{ fontSize: "0.86rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
              <Layers size={15} /> Queued PDF Selections ({batchSnippets.length})
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                type="button"
                onClick={handleClearBatch}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Clear All
              </button>

              <button
                className="notion-btn"
                type="button"
                style={{
                  background: "var(--accent-color, #6366f1)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                disabled={busy || !onExtractBatch}
                onClick={handleExtractBatch}
              >
                <Sparkles size={15} /> Extract Definitions From Batch ({batchSnippets.length})
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "150px", overflowY: "auto" }}>
            {batchSnippets.map((snippet) => (
              <div
                key={snippet.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  fontSize: "0.82rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: "rgba(99, 102, 241, 0.15)",
                      color: "var(--accent-color, #6366f1)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Page {snippet.pageNumber}
                  </span>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "var(--text-primary)",
                    }}
                  >
                    {snippet.text}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveFromBatch(snippet.id)}
                  title="Remove selection from batch"
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    padding: "2px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
