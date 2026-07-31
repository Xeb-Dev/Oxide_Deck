import { pdfjs } from "react-pdf";
import { convertToWebP } from "../utils/image";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export interface PdfTextItem {
  id: string;
  pageNumber: number;
  itemIndex: number;
  text: string;
  normalizedText: string;
}

export interface PdfPageText {
  pageNumber: number;
  textItems: PdfTextItem[];
  text: string;
  normalizedText: string;
}

export interface PdfExtractionResult {
  pageCount: number;
  pages: PdfPageText[];
  fullText: string;
  normalizedFullText: string;
  hasSelectableText: boolean;
}

export interface PdfHighlightMatch {
  term: string;
  normalizedTerm: string;
  pageNumber: number;
  itemIndexes: number[];
}

function normalizePdfText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function getItemText(item: unknown): string {
  if (!item || typeof item !== "object") {
    return "";
  }

  const maybeStr = (item as { str?: unknown }).str;
  return typeof maybeStr === "string" ? maybeStr : "";
}

function joinNormalizedItemTexts(items: PdfTextItem[]): string {
  return normalizePdfText(items.map((item) => item.text).join(" "));
}

export async function extractStructuredTextFromPDF(arrayBuffer: ArrayBuffer): Promise<PdfExtractionResult> {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
  const pdf = await loadingTask.promise;
  const pages: PdfPageText[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const textItems = textContent.items.map((item: unknown, itemIndex: number) => {
      const text = getItemText(item);
      return {
        id: `${pageNumber}:${itemIndex}`,
        pageNumber,
        itemIndex,
        text,
        normalizedText: normalizePdfText(text),
      };
    });

    const pageText = textItems.map((item) => item.text).join(" ");
    pages.push({
      pageNumber,
      textItems,
      text: pageText.trim(),
      normalizedText: normalizePdfText(pageText),
    });
  }

  const fullText = pages
    .map((page) => `Page ${page.pageNumber}\n${page.text}`)
    .join("\n\n")
    .trim();

  return {
    pageCount: pdf.numPages,
    pages,
    fullText,
    normalizedFullText: normalizePdfText(fullText),
    hasSelectableText: pages.some((page) => page.textItems.some((item) => item.normalizedText.length > 0)),
  };
}

export async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
  const result = await extractStructuredTextFromPDF(arrayBuffer);
  return result.fullText;
}

export function buildPdfPromptText(extraction: PdfExtractionResult): string {
  return extraction.pages
    .map((page) => `Page ${page.pageNumber}:\n${page.text}`)
    .join("\n\n")
    .trim();
}

function findTermMatchesInPage(page: PdfPageText, term: string): PdfHighlightMatch[] {
  const normalizedTerm = normalizePdfText(term);
  if (!normalizedTerm) {
    return [];
  }

  const searchableItems = page.textItems.filter((item) => item.normalizedText.length > 0);
  const matches: PdfHighlightMatch[] = [];
  const seen = new Set<string>();

  for (let startIndex = 0; startIndex < searchableItems.length; startIndex += 1) {
    const matchedItems: PdfTextItem[] = [];

    for (let endIndex = startIndex; endIndex < searchableItems.length; endIndex += 1) {
      matchedItems.push(searchableItems[endIndex]);
      const candidate = joinNormalizedItemTexts(matchedItems);

      if (candidate === normalizedTerm) {
        const itemIndexes = matchedItems.map((item) => item.itemIndex);
        const key = `${page.pageNumber}:${itemIndexes.join(",")}:${normalizedTerm}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push({
            term,
            normalizedTerm,
            pageNumber: page.pageNumber,
            itemIndexes,
          });
        }
        break;
      }

      if (candidate.length >= normalizedTerm.length && candidate !== normalizedTerm) {
        break;
      }
    }
  }

  return matches;
}

export interface PdfHighlightTermTarget {
  term: string;
  sourcePage?: number;
}

export function findPdfHighlightMatches(
  extraction: PdfExtractionResult,
  targets: (string | PdfHighlightTermTarget)[],
): PdfHighlightMatch[] {
  const matches: PdfHighlightMatch[] = [];
  const seenMatches = new Set<string>();

  for (const target of targets) {
    const term = typeof target === "string" ? target : target.term;
    const preferredPage = typeof target === "object" ? target.sourcePage : undefined;
    const cleanTerm = term.trim();
    if (!cleanTerm) continue;

    if (preferredPage) {
      const pageObj = extraction.pages.find((p) => p.pageNumber === preferredPage);
      if (pageObj) {
        const pageMatches = findTermMatchesInPage(pageObj, cleanTerm);
        if (pageMatches.length > 0) {
          for (const m of pageMatches) {
            const key = `${m.pageNumber}:${m.itemIndexes.join(",")}:${m.normalizedTerm}`;
            if (!seenMatches.has(key)) {
              seenMatches.add(key);
              matches.push(m);
            }
          }
          continue;
        }
      }
    }

    for (const pageObj of extraction.pages) {
      const pageMatches = findTermMatchesInPage(pageObj, cleanTerm);
      for (const m of pageMatches) {
        const key = `${m.pageNumber}:${m.itemIndexes.join(",")}:${m.normalizedTerm}`;
        if (!seenMatches.has(key)) {
          seenMatches.add(key);
          matches.push(m);
        }
      }
    }
  }

  return matches;
}

export function buildPdfHighlightMap(matches: PdfHighlightMatch[]): Record<number, number[]> {
  const highlightMap: Record<number, Set<number>> = {};

  for (const match of matches) {
    if (!highlightMap[match.pageNumber]) {
      highlightMap[match.pageNumber] = new Set<number>();
    }

    match.itemIndexes.forEach((itemIndex) => highlightMap[match.pageNumber].add(itemIndex));
  }

  return Object.fromEntries(
    Object.entries(highlightMap).map(([pageNumber, itemIndexes]) => [
      Number(pageNumber),
      Array.from(itemIndexes).sort((a, b) => a - b),
    ]),
  );
}

export async function renderPdfPageToImage(arrayBuffer: ArrayBuffer, pageNumber: number, scale = 1.5): Promise<string> {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
  const pdf = await loadingTask.promise;

  const validPageNum = Math.max(1, Math.min(pageNumber, pdf.numPages));
  const page = await pdf.getPage(validPageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context unavailable.");
  }

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: context, viewport } as any).promise;
  const rawDataUrl = canvas.toDataURL("image/png");
  return convertToWebP(rawDataUrl, 0.85);
}
