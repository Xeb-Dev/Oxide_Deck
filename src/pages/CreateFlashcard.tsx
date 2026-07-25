import React, { useState, useRef } from "react";

import { invoke } from "@tauri-apps/api/core";

import { getDecks, createFlashcard, createDeck, getFolders, Deck, Folder } from "../services/db";

import {
  scanTextForFlashcards,
  scanImageForFlashcards,
  scanPdfTextForFlashcards,
  smartScanPdfForFlashcards,
  GeneratedFlashcard,
  PdfGeneratedFlashcard,
} from "../services/llm";

import {
  extractStructuredTextFromPDF,
  buildPdfPromptText,
  findPdfHighlightMatches,
  buildPdfHighlightMap,
  PdfExtractionResult,
} from "../services/pdf";

import { 
  Sparkles, Globe, Camera, Plus, Play, Trash, X, Zap
} from "lucide-react";

import EmojiPicker from "../components/EmojiPicker";
import { PdfViewer, PdfSnippet } from "../components/PDFViewer";
import StatusBanner, { StatusVariant } from "../components/StatusBanner";

interface StatusState {

  message: string;

  variant: StatusVariant;

}



interface CreateFlashcardProps {

  onSidebarRefresh?: () => void;

}

type ReviewFlashcard = GeneratedFlashcard | PdfGeneratedFlashcard;



export default function CreateFlashcard({ onSidebarRefresh }: CreateFlashcardProps) {

  const [decks, setDecks] = useState<Deck[]>([]);

  const [selectedDeckId, setSelectedDeckId] = useState("");

  const [activeTab, setActiveTab] = useState<'manual' | 'ai-text' | 'ai-url' | 'ai-camera' | 'ai-pdf'>('manual');

  const [loading, setLoading] = useState(false);

  const [status, setStatus] = useState<StatusState | null>(null);



  const showStatus = (message: string, variant: StatusVariant = "info", autoDismissMs?: number) => {

    setStatus({ message, variant });

    if (autoDismissMs) {

      setTimeout(() => setStatus(null), autoDismissMs);

    }

  };



  // Manual Mode Form

  const [manualFront, setManualFront] = useState("");

  const [manualBack, setManualBack] = useState("");

  const [manualTags, setManualTags] = useState("");



  // AI Text input

  const [aiText, setAiText] = useState("");



  // AI URL input

  const [aiUrl, setAiUrl] = useState("");



  // Camera capture states

  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  const [capturedImage, setCapturedImage] = useState<string | null>(null); // base64

  const videoRef = useRef<HTMLVideoElement>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);



  // Extracted Cards for review

  const [extractedCards, setExtractedCards] = useState<ReviewFlashcard[]>([]);

  const [selectedCardIndexes, setSelectedCardIndexes] = useState<Record<number, boolean>>({});

  const [pdfFileData, setPdfFileData] = useState<Uint8Array | null>(null);

  const [pdfFileName, setPdfFileName] = useState("");

  const [pdfExtraction, setPdfExtraction] = useState<PdfExtractionResult | null>(null);

  const [pdfSourceCards, setPdfSourceCards] = useState<PdfGeneratedFlashcard[]>([]);

  const [pdfHighlightMap, setPdfHighlightMap] = useState<Record<number, number[]>>({});



  // New Deck Modal States

  const [showNewDeckModal, setShowNewDeckModal] = useState(false);

  const [newDeckName, setNewDeckName] = useState("");

  const [newDeckIcon, setNewDeckIcon] = useState("🎴");

  const [newDeckDesc, setNewDeckDesc] = useState("");

  const [newDeckFolderId, setNewDeckFolderId] = useState("");

  const [folders, setFolders] = useState<Folder[]>([]);



  React.useEffect(() => {

    loadData();

  }, []);



  const loadData = async () => {

    try {

      const d = await getDecks();

      setDecks(d);

      if (d.length > 0) {

        setSelectedDeckId(d[0].id);

      }

      const f = await getFolders();

      setFolders(f);

      if (f.length > 0) {

        setNewDeckFolderId(f[0].id);

      } else {

        setNewDeckFolderId("none");

      }

    } catch (e) {

      console.error(e);

    }

  };



  const handleCreateNewDeck = async (e: React.FormEvent) => {

    e.preventDefault();

    if (!newDeckName.trim()) return;



    try {

      const folderIdVal = newDeckFolderId === "none" || !newDeckFolderId ? null : newDeckFolderId;

      const created = await createDeck(newDeckName, folderIdVal, newDeckIcon, newDeckDesc);

      

      // Reload decks

      const d = await getDecks();

      setDecks(d);

      

      // Select the newly created deck

      setSelectedDeckId(created.id);

      

      // Close modal

      setShowNewDeckModal(false);

      

      // Refresh sidebar so it updates immediately

      if (onSidebarRefresh) {

        onSidebarRefresh();

      }

    } catch (err) {

      console.error(err);

      showStatus("Failed to create deck: " + (err instanceof Error ? err.message : String(err)), "error");

    }

  };



  // MANUAL CREATION SUBMIT

  const handleManualSubmit = async (e: React.FormEvent) => {

    e.preventDefault();

    if (!manualFront.trim() || !manualBack.trim()) return;

    if (!selectedDeckId) {

      showStatus("Please create a deck first before adding flashcards.", "warning");

      return;

    }



    try {

      setLoading(true);

      await createFlashcard(selectedDeckId, manualFront, manualBack, manualTags);

      setManualFront("");

      setManualBack("");

      setManualTags("");

      showStatus("Flashcard created successfully!", "success", 3000);

    } catch (e) {

      console.error(e);

      showStatus("Failed to save flashcard to database.", "error");

    } finally {

      setLoading(false);

    }

  };



  const buildSelectedCardMap = (cards: ReviewFlashcard[]) => {
    const next: Record<number, boolean> = {};
    cards.forEach((_, idx) => {
      next[idx] = true;
    });
    return next;
  };

  const isPdfReviewCard = (card: ReviewFlashcard): card is PdfGeneratedFlashcard => {
    return "sourceTerm" in card;
  };

  const mergePdfHighlightState = (cards: PdfGeneratedFlashcard[]) => {
    if (!pdfExtraction) {
      setPdfHighlightMap({});
      return;
    }

    const targets = cards
      .filter((card) => Boolean(card.sourceTerm))
      .map((card) => ({
        term: card.sourceTerm,
        sourcePage: card.sourcePage,
      }));

    const matches = findPdfHighlightMatches(pdfExtraction, targets);
    setPdfHighlightMap(buildPdfHighlightMap(matches));
  };

  // PDF FILE UPLOAD & TEXT EXTRACTION
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      showStatus(`Loading PDF: ${file.name}...`, "info");

      const buffer = await file.arrayBuffer();
      const fileBytes = new Uint8Array(buffer.slice(0));
      const extracted = await extractStructuredTextFromPDF(buffer);

      setPdfFileData(fileBytes);
      setPdfFileName(file.name);
      setPdfExtraction(extracted);
      setPdfSourceCards([]);
      setPdfHighlightMap({});

      if (!extracted.hasSelectableText || !extracted.fullText.trim()) {
        showStatus(
          "This PDF does not appear to contain selectable text. For scanned pages, please use Camera / Image Scan instead.",
          "warning",
        );
        return;
      }

      showStatus("PDF loaded successfully. You can scan the whole document or select a region to scan.", "success", 3000);
    } catch (err: any) {
      console.error(err);
      showStatus("Failed to load PDF: " + (err.message || err), "error");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  // AI TEXT PARSER

  const handleScanText = async () => {

    if (!aiText.trim()) return;

    try {

      setLoading(true);

      showStatus("AI is analyzing the text. Please wait...", "info");

      setExtractedCards([]);

      

      const cards = await scanTextForFlashcards(aiText);

      setExtractedCards(cards);

      

      // Auto select all

      const initialSelect: Record<number, boolean> = {};

      cards.forEach((_, idx) => {

        initialSelect[idx] = true;

      });

      setSelectedCardIndexes(initialSelect);

      showStatus(`Successfully extracted ${cards.length} cards! Review below.`, "success");

    } catch (e: any) {

      console.error(e);

      showStatus(e.message || "Failed to scan text. Verify your API keys in Settings.", "error");

      setStatus(null);

    } finally {

      setLoading(false);

    }

  };



  const handleScanPdfDocument = async () => {
    if (!pdfExtraction) return;

    try {
      setLoading(true);
      showStatus("AI is analyzing the loaded PDF. Please wait...", "info");

      const cards = await scanPdfTextForFlashcards(buildPdfPromptText(pdfExtraction), "document");
      setPdfSourceCards(cards);
      mergePdfHighlightState(cards);
      setExtractedCards(cards);
      setSelectedCardIndexes(buildSelectedCardMap(cards));
      showStatus(`Successfully extracted ${cards.length} cards from the PDF. Review below.`, "success");
    } catch (e: any) {
      console.error(e);
      showStatus(e.message || "Failed to scan the PDF. Verify your API keys in Settings.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSmartScanPdf = async () => {
    if (!pdfExtraction) return;

    try {
      setLoading(true);

      const cards = await smartScanPdfForFlashcards(
        buildPdfPromptText(pdfExtraction),
        (_step, message) => showStatus(message, "info"),
      );

      if (cards.length === 0) {
        showStatus("AI could not identify any definable terms in this PDF.", "warning");
        return;
      }

      setPdfSourceCards(cards);
      mergePdfHighlightState(cards);
      setExtractedCards(cards);
      setSelectedCardIndexes(buildSelectedCardMap(cards));
      showStatus(`Smart scan complete! Extracted ${cards.length} definition cards from the PDF.`, "success");
    } catch (e: any) {
      console.error(e);
      showStatus(e.message || "Smart scan failed. Verify your API keys in Settings.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleScanPdfSelection = async (selectedText: string, pageNumber: number) => {
    if (!pdfExtraction) return;

    try {
      setLoading(true);
      showStatus("AI is analyzing the selected PDF text...", "info");

      const cards = await scanPdfTextForFlashcards(selectedText, "selection");
      const cardsWithPage = cards.map((c) => ({ ...c, sourcePage: pageNumber }));
      const nextPdfCards = [...pdfSourceCards, ...cardsWithPage];
      setPdfSourceCards(nextPdfCards);
      mergePdfHighlightState(nextPdfCards);
      setExtractedCards((prev) => {
        const next = [...prev, ...cardsWithPage];
        setSelectedCardIndexes(buildSelectedCardMap(next));
        return next;
      });
      showStatus(`Added ${cards.length} cards from page ${pageNumber} selection.`, "success");
    } catch (e: any) {
      console.error(e);
      showStatus(e.message || "Failed to scan the selected PDF text. Verify your API keys in Settings.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleScanPdfBatch = async (snippets: PdfSnippet[]) => {
    if (!pdfExtraction || snippets.length === 0) return;

    try {
      setLoading(true);
      showStatus(`AI is analyzing ${snippets.length} selected PDF region(s)...`, "info");

      const combinedText = snippets
        .map((s, idx) => `[Selection ${idx + 1} from Page ${s.pageNumber}]:\n${s.text}`)
        .join("\n\n");

      const cards = await scanPdfTextForFlashcards(combinedText, "selection");

      const cardsWithPage = cards.map((c) => {
        const matchedSnippet = snippets.find((s) =>
          s.text.toLowerCase().includes(c.sourceTerm.toLowerCase()) ||
          c.front.toLowerCase().includes(s.text.toLowerCase())
        );
        return {
          ...c,
          sourcePage: matchedSnippet ? matchedSnippet.pageNumber : snippets[0]?.pageNumber,
        };
      });

      const nextPdfCards = [...pdfSourceCards, ...cardsWithPage];
      setPdfSourceCards(nextPdfCards);
      mergePdfHighlightState(nextPdfCards);
      setExtractedCards((prev) => {
        const next = [...prev, ...cardsWithPage];
        setSelectedCardIndexes(buildSelectedCardMap(next));
        return next;
      });
      showStatus(`Added ${cards.length} cards from ${snippets.length} queued PDF selection(s).`, "success");
    } catch (e: any) {
      console.error(e);
      showStatus(e.message || "Failed to scan batch selections. Verify your API keys in Settings.", "error");
    } finally {
      setLoading(false);
    }
  };

  // AI URL PARSER
  const handleScanUrl = async () => {
    if (!aiUrl.trim()) return;

    try {
      setLoading(true);
      showStatus("Scraping webpage content via Tauri...", "info");
      setExtractedCards([]);

      const html: string = await invoke("fetch_url_html", { url: aiUrl });

      showStatus("Parsing text and analyzing with AI...", "info");
      const doc = new DOMParser().parseFromString(html, "text/html");

      const scripts = doc.querySelectorAll("script, style, head, header, footer, nav");
      scripts.forEach((s) => s.remove());
      const rawText = doc.body.innerText || "";
      const cleanedText = rawText.replace(/\s+/g, " ").trim().substring(0, 8000);

      if (cleanedText.length < 50) {
        throw new Error("Could not extract meaningful text from this webpage. Page might be dynamic or require login.");
      }

      const cards = await scanTextForFlashcards(cleanedText);
      setExtractedCards(cards);
      setSelectedCardIndexes(buildSelectedCardMap(cards));
      showStatus(`Extracted ${cards.length} cards from web article! Review below.`, "success");
    } catch (e: any) {
      console.error(e);
      showStatus(e.message || "Failed to scan URL. Verify the webpage is public and your API configuration.", "error");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };



  // CAMERA & MULTIMODAL SCANNING

  const startCamera = async () => {

    try {

      setCapturedImage(null);

      const stream = await navigator.mediaDevices.getUserMedia({

        video: { facingMode: 'environment' } // Prefer rear camera on mobile

      });

      setCameraStream(stream);

      if (videoRef.current) {

        videoRef.current.srcObject = stream;

      }

    } catch (e) {

      console.error("Failed to access camera:", e);

      showStatus("Unable to access device camera. Try uploading an image file instead.", "error");

    }

  };



  const stopCamera = () => {

    if (cameraStream) {

      cameraStream.getTracks().forEach(track => track.stop());

      setCameraStream(null);

    }

  };



  const capturePhoto = () => {

    if (videoRef.current && canvasRef.current) {

      const video = videoRef.current;

      const canvas = canvasRef.current;

      const ctx = canvas.getContext('2d');



      canvas.width = video.videoWidth;

      canvas.height = video.videoHeight;

      if (ctx) {

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/jpeg');

        setCapturedImage(dataUrl);

        stopCamera();

      }

    }

  };



  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {

    const file = e.target.files?.[0];

    if (file) {

      const reader = new FileReader();

      reader.onload = () => {

        if (typeof reader.result === 'string') {

          setCapturedImage(reader.result);

        }

      };

      reader.readAsDataURL(file);

    }

  };



  const handleScanImage = async () => {

    if (!capturedImage) return;

    try {

      setLoading(true);

      showStatus("Multimodal AI is analyzing the page image...", "info");

      setExtractedCards([]);



      // Split base64 meta info

      const base64Data = capturedImage.split(',')[1];

      const mimeType = capturedImage.split(',')[0].split(':')[1].split(';')[0];



      const cards = await scanImageForFlashcards(base64Data, mimeType);

      setExtractedCards(cards);



      // Auto select all

      const initialSelect: Record<number, boolean> = {};

      cards.forEach((_, idx) => {

        initialSelect[idx] = true;

      });

      setSelectedCardIndexes(initialSelect);

      showStatus(`Image scanned successfully! Extracted ${cards.length} cards.`, "success");

    } catch (e: any) {

      console.error(e);

      showStatus(e.message || "Failed to scan image. Ensure the image is clear and you have API credits/keys configured.", "error");

      setStatus(null);

    } finally {

      setLoading(false);

    }

  };



  // BULK IMPORT

  const handleImportSelected = async () => {

    if (!selectedDeckId) {

      showStatus("Please select a target deck first.", "warning");

      return;

    }

    const importList = extractedCards.filter((_, idx) => selectedCardIndexes[idx]);

    if (importList.length === 0) {

      showStatus("No cards selected for import.", "warning");

      return;

    }



    try {

      setLoading(true);

      showStatus(`Importing ${importList.length} cards...`, "info");

      for (const card of importList) {

        await createFlashcard(selectedDeckId, card.front, card.back, card.tags || "");

      }

      setExtractedCards([]);

      setSelectedCardIndexes({});

      setPdfSourceCards([]);

      setPdfHighlightMap({});

      setCapturedImage(null);

      setAiText("");

      setAiUrl("");

      showStatus(`Successfully imported ${importList.length} flashcards to target deck!`, "success", 3000);

    } catch (e) {

      console.error(e);

      showStatus("Import failed during database insertion.", "error");

      setStatus(null);

    } finally {

      setLoading(false);

    }

  };



  const toggleSelectCard = (index: number) => {

    setSelectedCardIndexes(prev => ({

      ...prev,

      [index]: !prev[index]

    }));

  };



  const handleEditExtractedCard = (index: number, field: 'front' | 'back' | 'tags', value: string) => {

    setExtractedCards(prev => {

      const next = [...prev];

      next[index] = {

        ...next[index],

        [field]: value

      };

      return next;

    });

  };



  const handleDeleteExtractedCard = (index: number) => {
    const removedCard = extractedCards[index];
    const nextCards = extractedCards.filter((_, idx) => idx !== index);
    setExtractedCards(nextCards);
    setSelectedCardIndexes(buildSelectedCardMap(nextCards));

    if (removedCard && isPdfReviewCard(removedCard)) {
      const removeIndex = pdfSourceCards.findIndex(
        (card) =>
          card.sourceTerm === removedCard.sourceTerm &&
          card.front === removedCard.front &&
          card.back === removedCard.back &&
          card.sourceMode === removedCard.sourceMode,
      );

      const nextPdfCards =
        removeIndex >= 0 ? pdfSourceCards.filter((_, idx) => idx !== removeIndex) : pdfSourceCards;
      setPdfSourceCards(nextPdfCards);
      mergePdfHighlightState(nextPdfCards);
    }

  };



  return (

    <>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>

        <div className="page-emoji">✨</div>

        <h1 className="page-title">Create Flashcards</h1>

        <p className="sub-description">

          Add flashcards manually or use AI scanning to auto-generate term lists from text, webpages, images, or PDFs.

        </p>

      </div>



      {/* Target Deck selector */}

      <div 

        style={{ 

          border: "1px solid var(--border-color)", 

          borderRadius: "8px", 

          padding: "16px",

          backgroundColor: "var(--bg-secondary)",

          display: "flex",

          alignItems: "center",

          justifyContent: "space-between",

          gap: "16px"

        }}

      >

        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>

          <span style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>Target Deck</span>

          <span style={{ fontSize: "0.88rem", color: "var(--text-secondary)" }}>Where new cards will be saved</span>

        </div>

        <select 

          className="notion-input" 

          style={{ maxWidth: "300px" }}

          value={selectedDeckId}

          onChange={(e) => {

            const val = e.target.value;

            if (val === "create_new_deck_trigger") {

              setNewDeckName("");

              setNewDeckIcon("🎴");

              setNewDeckDesc("");

              if (folders.length > 0) {

                setNewDeckFolderId(folders[0].id);

              } else {

                setNewDeckFolderId("none");

              }

              setShowNewDeckModal(true);

            } else {

              setSelectedDeckId(val);

            }

          }}

        >

          {decks.map(d => (

            <option key={d.id} value={d.id}>{d.icon} {d.name}</option>

          ))}

          <option value="create_new_deck_trigger" style={{ fontWeight: "bold", color: "var(--accent-color)" }}>

            + Create New Deck...

          </option>

        </select>

      </div>



      {/* Tabs */}

      <div className="notion-tabs">

        <div 

          className={`notion-tab ${activeTab === 'manual' ? 'active' : ''}`}

          onClick={() => { setActiveTab('manual'); stopCamera(); }}

        >

          Manual Entry

        </div>

        <div 

          className={`notion-tab ${activeTab === 'ai-text' ? 'active' : ''}`}
          onClick={() => { setActiveTab('ai-text'); stopCamera(); }}
        >

          AI Text Scan

        </div>

        <div 
          className={`notion-tab ${activeTab === 'ai-pdf' ? 'active' : ''}`}
          onClick={() => { setActiveTab('ai-pdf'); stopCamera(); }}
        >

          AI PDF Scan

        </div>

        <div 

          className={`notion-tab ${activeTab === 'ai-url' ? 'active' : ''}`}
          onClick={() => { setActiveTab('ai-url'); stopCamera(); }}
        >

          AI Web Link Scan

        </div>

        <div 

          className={`notion-tab ${activeTab === 'ai-camera' ? 'active' : ''}`}

          onClick={() => { setActiveTab('ai-camera'); }}

        >

          Camera / Image Scan

        </div>

      </div>



      {status && (

        <StatusBanner

          message={status.message}

          variant={status.variant}

          loading={loading && status.variant === "info"}

          onDismiss={

            status.variant === "error" || status.variant === "warning"

              ? () => setStatus(null)

              : undefined

          }

        />

      )}



      {/* Tab Panels */}

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

        

        {/* MANUAL TAB */}

        {activeTab === 'manual' && (

          <form onSubmit={handleManualSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            <div className="notion-input-group">

              <label>Front (Term / Question)</label>

              <textarea 

                className="notion-input" 

                rows={3} 

                value={manualFront}

                onChange={(e) => setManualFront(e.target.value)}

                placeholder="Write the question or concept name..."

                required

              />

            </div>

            

            <div className="notion-input-group">

              <label>Back (Definition / Answer)</label>

              <textarea 

                className="notion-input" 

                rows={4} 

                value={manualBack}

                onChange={(e) => setManualBack(e.target.value)}

                placeholder="Write the reference answer or definition..."

                required

              />

            </div>



            <div className="notion-input-group">

              <label>Tags (Optional, comma separated)</label>

              <input 

                className="notion-input" 

                type="text" 

                value={manualTags}

                onChange={(e) => setManualTags(e.target.value)}

                placeholder="biology, glossary, chapter1"

              />

            </div>



            <button type="submit" className="notion-btn" disabled={loading} style={{ alignSelf: "flex-start" }}>

              <Plus size={16} /> Save Flashcard

            </button>

          </form>

        )}



        {/* AI TEXT TAB */}

        {activeTab === 'ai-text' && (

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            <div className="notion-input-group">
              <label>Paste Chapter Notes, Articles, or Raw Text</label>

              <textarea 

                className="notion-input" 

                rows={10} 

                value={aiText}

                onChange={(e) => setAiText(e.target.value)}

                placeholder="Paste the educational content here. The AI will scan this content, identify core terms, definitions, and categories..."

              />

            </div>

            <button 

              className="notion-btn" 

              onClick={handleScanText}

              disabled={loading || !aiText.trim()}

              style={{ alignSelf: "flex-start" }}

            >

              <Sparkles size={16} /> Extract definitions using AI

            </button>

          </div>

        )}



        {/* AI PDF TAB */}

        {activeTab === 'ai-pdf' && (

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px",
                border: "1px solid var(--border-color)",
                borderRadius: "10px",
                backgroundColor: "var(--bg-secondary)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontWeight: 700 }}>Load a PDF and extract highlighted terms</span>
                <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                  Whole-document scans replace the current review list. Selection scans append into it.
                </span>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                <label className="notion-btn secondary" style={{ cursor: "pointer" }}>
                  <Plus size={14} /> Choose PDF
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handlePdfUpload}
                    style={{ display: "none" }}
                  />
                </label>

                <button
                  className="notion-btn"
                  type="button"
                  onClick={handleScanPdfDocument}
                  disabled={loading || !pdfExtraction || !pdfExtraction.hasSelectableText}
                >
                  <Sparkles size={16} /> Extract Definitions From PDF
                </button>

                <button
                  className="notion-btn"
                  type="button"
                  onClick={handleSmartScanPdf}
                  disabled={loading || !pdfExtraction || !pdfExtraction.hasSelectableText}
                  style={{
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    color: "#fff",
                  }}
                >
                  <Zap size={16} /> Smart Scan (2-Step AI)
                </button>
              </div>
            </div>

            <PdfViewer
              fileData={pdfFileData}
              fileName={pdfFileName}
              highlightMap={pdfHighlightMap}
              highlightTerms={pdfSourceCards.map((card) => card.sourceTerm)}
              busy={loading}
              onExtractSelection={handleScanPdfSelection}
              onExtractBatch={handleScanPdfBatch}
            />
          </div>

        )}



        {/* AI URL TAB */}

        {activeTab === 'ai-url' && (

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            <div className="notion-input-group">

              <label>Webpage URL to Scrape</label>

              <input 

                className="notion-input" 

                type="url" 

                value={aiUrl}

                onChange={(e) => setAiUrl(e.target.value)}

                placeholder="https://wikipedia.org/wiki/Photosynthesis"

              />

            </div>

            <button 

              className="notion-btn" 

              onClick={handleScanUrl}

              disabled={loading || !aiUrl.trim()}

              style={{ alignSelf: "flex-start" }}

            >

              <Globe size={16} /> Download & scan page text

            </button>

          </div>

        )}



        {/* CAMERA / IMAGE TAB */}

        {activeTab === 'ai-camera' && (

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            

            {/* Live Camera vs. Snapshot view */}

            {!cameraStream && !capturedImage ? (

              <div 

                style={{ 

                  border: "2px dashed var(--border-color)", 

                  borderRadius: "8px", 

                  padding: "40px", 

                  textAlign: "center",

                  display: "flex",

                  flexDirection: "column",

                  alignItems: "center",

                  gap: "16px",

                  backgroundColor: "var(--bg-secondary)"

                }}

              >

                <Camera size={36} color="var(--text-muted)" />

                <div>

                  <div style={{ fontWeight: 600 }}>Capture or upload textbook pages</div>

                  <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "4px" }}>

                    Snap a photo using your webcam/camera or choose an image file.

                  </div>

                </div>

                <div style={{ display: "flex", gap: "10px" }}>

                  <button className="notion-btn" onClick={startCamera}>

                    <Play size={14} /> Open Camera

                  </button>

                  <label className="notion-btn secondary" style={{ cursor: "pointer" }}>

                    <Plus size={14} /> Choose Image File

                    <input 

                      type="file" 

                      accept="image/*" 

                      onChange={handleFileUpload} 

                      style={{ display: "none" }} 

                    />

                  </label>

                </div>

              </div>

            ) : cameraStream ? (

              <div className="camera-preview-container">

                <video ref={videoRef} autoPlay playsInline className="camera-video" />

                <div className="camera-controls">

                  <button className="notion-btn" onClick={capturePhoto}>Capture Photo</button>

                  <button className="notion-btn secondary" onClick={stopCamera}>Cancel</button>

                </div>

              </div>

            ) : (

              <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "center" }}>

                <img 

                  src={capturedImage!} 

                  alt="Captured scan" 

                  style={{ maxWidth: "100%", maxHeight: "300px", borderRadius: "8px", border: "1px solid var(--border-strong)" }} 

                />

                <div style={{ display: "flex", gap: "8px" }}>

                  <button className="notion-btn" onClick={handleScanImage} disabled={loading}>

                    <Sparkles size={14} /> AI Scan Image

                  </button>

                  <button className="notion-btn secondary" onClick={() => setCapturedImage(null)}>

                    Discard

                  </button>

                </div>

              </div>

            )}



            <canvas ref={canvasRef} style={{ display: "none" }} />

          </div>

        )}



        {/* REVIEW EXTRACTED CARDS FOR IMPORT */}

        {extractedCards.length > 0 && (

          <div style={{ display: "flex", flexDirection: "column", gap: "16px", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "20px", backgroundColor: "var(--bg-secondary)" }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>

              <div style={{ display: "flex", flexDirection: "column" }}>

                <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>Review Extracted Cards</span>

                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>

                  Make edits, select the cards you want, and save them.

                </span>

              </div>

              <button className="notion-btn" onClick={handleImportSelected} disabled={loading}>

                Save Selected ({Object.values(selectedCardIndexes).filter(Boolean).length})

              </button>

            </div>



            <div className="generated-cards-list">

              {extractedCards.map((card, idx) => {

                const isSelected = !!selectedCardIndexes[idx];

                return (

                  <div key={idx} className="generated-card-item" style={{ opacity: isSelected ? 1 : 0.65 }}>

                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>

                      <input 

                        type="checkbox" 

                        checked={isSelected}

                        onChange={() => toggleSelectCard(idx)}

                        style={{ cursor: "pointer", width: "16px", height: "16px" }}

                      />

                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)" }}>Card #{idx + 1}</span>

                      <button 

                        type="button" 

                        className="theme-toggle-btn"

                        style={{ color: "var(--danger-color)", marginLeft: "auto", padding: "2px" }}

                        onClick={() => handleDeleteExtractedCard(idx)}

                      >

                        <Trash size={12} />

                      </button>

                    </div>



                    <div className="notion-input-group">

                      <label style={{ fontSize: "0.7rem" }}>Front</label>

                      <input 

                        className="notion-input" 

                        type="text" 

                        value={card.front}

                        onChange={(e) => handleEditExtractedCard(idx, 'front', e.target.value)}

                        placeholder="Front term"

                      />

                    </div>

                    <div className="notion-input-group">

                      <label style={{ fontSize: "0.7rem" }}>Back</label>

                      <textarea 

                        className="notion-input" 

                        rows={2}

                        value={card.back}

                        onChange={(e) => handleEditExtractedCard(idx, 'back', e.target.value)}

                        placeholder="Back definition"

                      />

                    </div>

                    <div className="notion-input-group">

                      <label style={{ fontSize: "0.7rem" }}>Tags</label>

                      <input 

                        className="notion-input" 

                        type="text" 

                        value={card.tags || ""}

                        onChange={(e) => handleEditExtractedCard(idx, 'tags', e.target.value)}

                        placeholder="Tags"

                      />

                    </div>

                  </div>

                );

              })}

            </div>

          </div>

        )}



      </div>



      {/* New Deck Modal */}

      {showNewDeckModal && (

        <div className="notion-modal-overlay">

          <div className="notion-modal">

            <div className="notion-modal-header">

              <span className="notion-modal-title">Create Deck</span>

              <button className="theme-toggle-btn" onClick={() => setShowNewDeckModal(false)}><X size={16} /></button>

            </div>

            <form onSubmit={handleCreateNewDeck}>

              <div className="notion-modal-content">

                <div className="notion-input-group">

                  <label>Deck Name</label>

                  <input 

                    className="notion-input"

                    type="text" 

                    value={newDeckName}

                    onChange={(e) => setNewDeckName(e.target.value)}

                    placeholder="e.g. Biology Organelles"

                    required

                    autoFocus

                  />

                </div>

                <EmojiPicker value={newDeckIcon} onChange={setNewDeckIcon} />

                <div className="notion-input-group">

                  <label>Description</label>

                  <textarea 

                    className="notion-input"

                    value={newDeckDesc}

                    onChange={(e) => setNewDeckDesc(e.target.value)}

                    placeholder="Brief description of what cards in this deck are about..."

                    rows={2}

                  />

                </div>

                <div className="notion-input-group">

                  <label>Folder Assignment</label>

                  <select 

                    className="notion-input"

                    value={newDeckFolderId}

                    onChange={(e) => setNewDeckFolderId(e.target.value)}

                  >

                    <option value="none">Uncategorized (No Folder)</option>

                    {folders.map(f => (

                      <option key={f.id} value={f.id}>{f.icon} {f.name}</option>

                    ))}

                  </select>

                </div>

              </div>

              <div className="notion-modal-footer">

                <button type="button" className="notion-btn secondary" onClick={() => setShowNewDeckModal(false)}>Cancel</button>

                <button type="submit" className="notion-btn">Create</button>

              </div>

            </form>

          </div>

        </div>

      )}

    </>

  );

}

