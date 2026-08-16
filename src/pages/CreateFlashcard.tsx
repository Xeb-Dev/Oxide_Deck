import React, { useState, useRef } from "react";

import { invoke } from "@tauri-apps/api/core";

import { getDecks, createFlashcard, createDeck, getFolders, Deck, Folder } from "../services/db";

import {
  scanTextForFlashcards,
  scanImageForFlashcards,
  scanPdfTextForFlashcards,
  smartScanPdfForFlashcards,
  extractDiagramWithAI,
  extractDiagramFromPdfWithAI,
  GeneratedFlashcard,
  PdfGeneratedFlashcard,
} from "../services/llm";
import { convertToWebP } from "../utils/image";

import {
  extractStructuredTextFromPDF,
  buildPdfPromptText,
  findPdfHighlightMatches,
  buildPdfHighlightMap,
  PdfExtractionResult,
} from "../services/pdf";

import { 
  Sparkles, Globe, Camera, Plus, Play, Trash, X, Zap, Image as ImageIcon, Loader2
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



  const [manualFront, setManualFront] = useState("");
  const [manualBack, setManualBack] = useState("");
  const [manualTags, setManualTags] = useState("");
  const [frontImageUrl, setFrontImageUrl] = useState<string | null>(null);
  const [backImageUrl, setBackImageUrl] = useState<string | null>(null);
  const [diagramQuery, setDiagramQuery] = useState("");
  const [extractingDiagram, setExtractingDiagram] = useState(false);
  const [isDraggingOverFront, setIsDraggingOverFront] = useState(false);
  const [isDraggingOverBack, setIsDraggingOverBack] = useState(false);
  const [showAiDiagramPrompt, setShowAiDiagramPrompt] = useState(false);
  const [targetAiSide, setTargetAiSide] = useState<'front' | 'back'>('back');

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
  const [pdfDiagramPrompt, setPdfDiagramPrompt] = useState("");



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
      const d = await getDecks();
      setDecks(d);
      setSelectedDeckId(created.id);
      setShowNewDeckModal(false);
      if (onSidebarRefresh) {
        onSidebarRefresh();
      }
    } catch (err) {
      console.error(err);
      showStatus("Failed to create deck: " + (err instanceof Error ? err.message : String(err)), "error");
    }
  };

  const handleExtractDiagram = async (side: 'front' | 'back' = targetAiSide) => {
    if (!diagramQuery.trim()) {
      showStatus("Please type what diagram you want extracted (e.g., Krebs Cycle, Heart Anatomy).", "warning");
      return;
    }
    try {
      setExtractingDiagram(true);
      showStatus("AI is generating/extracting diagram into WebP image...", "info");
      const webpUrl = await extractDiagramWithAI(diagramQuery, `${manualFront}\n${manualBack}`);
      if (side === 'front') {
        setFrontImageUrl(webpUrl);
      } else {
        setBackImageUrl(webpUrl);
      }
      showStatus(`Diagram attached to ${side.toUpperCase()} as WebP image!`, "success", 3000);
    } catch (err: any) {
      console.error(err);
      showStatus(err.message || "Failed to extract diagram.", "error");
    } finally {
      setExtractingDiagram(false);
    }
  };

  const processImageFile = async (file: File, side: 'front' | 'back') => {
    try {
      setLoading(true);
      showStatus(`Converting image to WebP format for ${side.toUpperCase()}...`, "info");
      const webpUrl = await convertToWebP(file);
      if (side === 'front') {
        setFrontImageUrl(webpUrl);
        showStatus("Image attached to FRONT face (WebP format)!", "success", 3000);
      } else {
        setBackImageUrl(webpUrl);
        showStatus("Image attached to BACK face (WebP format)!", "success", 3000);
      }
    } catch (err: any) {
      console.error(err);
      showStatus("Failed to process image into WebP format.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDropSide = async (e: React.DragEvent, side: 'front' | 'back') => {
    e.preventDefault();
    if (side === 'front') setIsDraggingOverFront(false);
    else setIsDraggingOverBack(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find((f) => f.type.startsWith("image/"));
    if (imageFile) {
      await processImageFile(imageFile, side);
    } else {
      showStatus("Please drop an image file (PNG, JPG, WebP).", "warning", 3000);
    }
  };

  const handlePasteSide = async (e: React.ClipboardEvent, side: 'front' | 'back') => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        e.preventDefault();
        await processImageFile(file, side);
      }
    }
  };

  // MANUAL CREATION SUBMIT
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualFront.trim() && !frontImageUrl) {
      showStatus("Please provide text or an image for the Front side.", "warning");
      return;
    }
    if (!manualBack.trim() && !backImageUrl) {
      showStatus("Please provide text or an image for the Back side.", "warning");
      return;
    }

    if (!selectedDeckId) {
      showStatus("Please create a deck first before adding flashcards.", "warning");
      return;
    }

    try {
      setLoading(true);
      await createFlashcard(selectedDeckId, manualFront || "(Image)", manualBack || "(Image)", manualTags, null, frontImageUrl, backImageUrl);
      setManualFront("");
      setManualBack("");
      setManualTags("");
      setFrontImageUrl(null);
      setBackImageUrl(null);
      setDiagramQuery("");
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

  const handleExtractPdfDiagram = async () => {
    if (!pdfFileData || !pdfExtraction || !pdfDiagramPrompt.trim()) return;

    try {
      setLoading(true);
      showStatus("AI Vision is analyzing PDF pages to extract your requested diagram...", "info");

      const card = await extractDiagramFromPdfWithAI(pdfFileData.buffer as ArrayBuffer, pdfDiagramPrompt.trim(), pdfExtraction);

      setPdfSourceCards((prev) => [...prev, card]);
      setExtractedCards((prev) => {
        const next = [...prev, card];
        setSelectedCardIndexes(buildSelectedCardMap(next));
        return next;
      });
      setPdfDiagramPrompt("");
      showStatus(`Diagram flashcard created successfully with WebP graphic attached! Review below.`, "success");
    } catch (e: any) {
      console.error(e);
      showStatus(e.message || "Failed to extract diagram from PDF. Verify Vision model config in Settings.", "error");
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

        await createFlashcard(

          selectedDeckId,

          card.front,

          card.back,

          card.tags || "",

          card.image_url || card.front_image_url || null,

          card.front_image_url || null,

          card.back_image_url || null

        );

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
            
            {/* Action Bar Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem", color: "var(--text-secondary)", flexWrap: "wrap", gap: "8px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <ImageIcon size={14} color="var(--accent-color)" /> Drag & drop or paste an image onto either text box to attach it (saved as WebP)
              </span>
              <button
                type="button"
                className="notion-btn secondary"
                style={{ padding: "4px 10px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "4px" }}
                onClick={() => setShowAiDiagramPrompt(!showAiDiagramPrompt)}
              >
                <Sparkles size={13} color="var(--accent-color)" /> AI Diagram Extractor
              </button>
            </div>

            {/* Inline AI Diagram Generator */}
            {showAiDiagramPrompt && (
              <div style={{ display: "flex", gap: "8px", alignItems: "center", padding: "10px 12px", border: "1px solid var(--border-color)", borderRadius: "8px", backgroundColor: "var(--bg-secondary)" }}>
                <Sparkles size={16} color="var(--accent-color)" />
                <input
                  type="text"
                  className="notion-input"
                  style={{ fontSize: "0.82rem", flex: 1 }}
                  value={diagramQuery}
                  onChange={(e) => setDiagramQuery(e.target.value)}
                  placeholder="Type diagram topic (e.g. Krebs Cycle, Heart Anatomy, Refraction)..."
                  autoFocus
                />
                <select
                  className="notion-input"
                  style={{ width: "90px", fontSize: "0.78rem" }}
                  value={targetAiSide}
                  onChange={(e) => setTargetAiSide(e.target.value as 'front' | 'back')}
                >
                  <option value="back">Back</option>
                  <option value="front">Front</option>
                </select>
                <button
                  type="button"
                  className="notion-btn primary"
                  style={{ padding: "6px 12px", fontSize: "0.78rem" }}
                  onClick={async () => {
                    await handleExtractDiagram(targetAiSide);
                    setShowAiDiagramPrompt(false);
                  }}
                  disabled={extractingDiagram}
                >
                  {extractingDiagram ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : "Generate"}
                </button>
                <button type="button" className="theme-toggle-btn" onClick={() => setShowAiDiagramPrompt(false)}>
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Front Text Area with Drag & Drop */}
            <div className="notion-input-group">
              <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Front (Term / Question)</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: "normal" }}>📷 Drop / Paste Image here for Front</span>
              </label>
              <textarea 
                className="notion-input" 
                rows={3} 
                value={manualFront}
                onChange={(e) => setManualFront(e.target.value)}
                onDragOver={(e) => { e.preventDefault(); setIsDraggingOverFront(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDraggingOverFront(false); }}
                onDrop={(e) => handleDropSide(e, 'front')}
                onPaste={(e) => handlePasteSide(e, 'front')}
                placeholder="Write front question/term... (or drop image here to set Front image)"
                style={{
                  border: isDraggingOverFront ? "2px dashed var(--accent-color)" : undefined,
                  backgroundColor: isDraggingOverFront ? "rgba(99, 102, 241, 0.08)" : undefined,
                  transition: "all 0.15s ease",
                }}
              />
              {/* Front Image Attached Preview */}
              {frontImageUrl && (
                <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", border: "1px solid var(--accent-color)", borderRadius: "6px", backgroundColor: "var(--bg-secondary)" }}>
                  <img src={frontImageUrl} alt="Front WebP" style={{ maxWidth: "80px", maxHeight: "60px", objectFit: "contain", borderRadius: "4px", border: "1px solid var(--border-color)", backgroundColor: "#fff" }} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-color)" }}>📷 Front Image Attached (Replaces Front Face)</span>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Renders prominently on Front side of card</span>
                  </div>
                  <button type="button" className="notion-btn secondary" style={{ padding: "3px 8px", fontSize: "0.72rem", color: "#e11d48" }} onClick={() => setFrontImageUrl(null)}>
                    Remove
                  </button>
                </div>
              )}
            </div>

            {/* Back Text Area with Drag & Drop */}
            <div className="notion-input-group">
              <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Back (Definition / Answer)</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: "normal" }}>📷 Drop / Paste Image here for Back</span>
              </label>
              <textarea 
                className="notion-input" 
                rows={4} 
                value={manualBack}
                onChange={(e) => setManualBack(e.target.value)}
                onDragOver={(e) => { e.preventDefault(); setIsDraggingOverBack(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDraggingOverBack(false); }}
                onDrop={(e) => handleDropSide(e, 'back')}
                onPaste={(e) => handlePasteSide(e, 'back')}
                placeholder="Write back answer/definition... (or drop image here to set Back image)"
                style={{
                  border: isDraggingOverBack ? "2px dashed var(--accent-color)" : undefined,
                  backgroundColor: isDraggingOverBack ? "rgba(99, 102, 241, 0.08)" : undefined,
                  transition: "all 0.15s ease",
                }}
              />
              {/* Back Image Attached Preview */}
              {backImageUrl && (
                <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", border: "1px solid var(--accent-color)", borderRadius: "6px", backgroundColor: "var(--bg-secondary)" }}>
                  <img src={backImageUrl} alt="Back WebP" style={{ maxWidth: "80px", maxHeight: "60px", objectFit: "contain", borderRadius: "4px", border: "1px solid var(--border-color)", backgroundColor: "#fff" }} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-color)" }}>📷 Back Image Attached (Replaces Back Face)</span>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Renders prominently on Back side of card</span>
                  </div>
                  <button type="button" className="notion-btn secondary" style={{ padding: "3px 8px", fontSize: "0.72rem", color: "#e11d48" }} onClick={() => setBackImageUrl(null)}>
                    Remove
                  </button>
                </div>
              )}
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
              type="button"
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

            {/* AI Diagram Extraction Prompt */}
            {pdfFileData && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  padding: "16px",
                  border: "1px solid var(--accent-color)",
                  borderRadius: "10px",
                  backgroundColor: "var(--bg-secondary)",
                  boxShadow: "0 2px 8px rgba(99, 102, 241, 0.05)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <ImageIcon size={18} color="var(--accent-color)" />
                  <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Find Specific Diagram in PDF</span>
                </div>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  Prompt the AI to scan PDF page graphics for specific diagrams (e.g. <i>"Find the heart anatomy diagram on page 2"</i> or <i>"Find the photosynthesis process diagram"</i>).
                </p>
                <div style={{ display: "flex", gap: "10px" }}>
                  <input
                    type="text"
                    className="notion-input"
                    value={pdfDiagramPrompt}
                    onChange={(e) => setPdfDiagramPrompt(e.target.value)}
                    placeholder="e.g. Find the carbon cycle diagram and explain its stages..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && pdfDiagramPrompt.trim() && !loading) {
                        e.preventDefault();
                        handleExtractPdfDiagram();
                      }
                    }}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="notion-btn"
                    onClick={handleExtractPdfDiagram}
                    disabled={loading || !pdfDiagramPrompt.trim()}
                    style={{ display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}
                  >
                    <Sparkles size={15} /> Extract Diagram Flashcard
                  </button>
                </div>
              </div>
            )}

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

                    {/* Attached WebP Diagram Image Preview */}
                    {card.back_image_url && (
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--accent-color)", backgroundColor: "var(--bg-primary)" }}>
                        <img 
                          src={card.back_image_url} 
                          alt="Diagram Graphic" 
                          style={{ maxWidth: "140px", maxHeight: "90px", objectFit: "contain", borderRadius: "4px", border: "1px solid var(--border-color)", backgroundColor: "#fff" }} 
                        />
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-color)" }}>📷 Extracted WebP Diagram Picture Attached (Back Face Only)</span>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Will display exclusively on Back face of flashcard during study & revision</span>
                        </div>
                      </div>
                    )}

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

