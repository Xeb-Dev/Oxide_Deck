// @ts-ignore
import * as pdfjs from 'pdfjs-dist';

// Point the worker to a secure CDN to ensure cross-platform compatibility and zero Vite bundler overhead
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * Extracts raw text from a PDF file provided as an ArrayBuffer
 */
export async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(" ");
    
    fullText += `${pageText}\n\n`;
  }

  return fullText.trim();
}
