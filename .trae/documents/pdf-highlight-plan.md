# PDF Highlight and Definition Extraction Plan

## Summary
Add a dedicated PDF workflow to flashcard creation that:
1. extracts definitions from a loaded PDF,
2. highlights the extracted term text inside the PDF viewer,
3. lets the user select text directly in the PDF and ask AI to extract definitions from only that selection,
4. appends selection-based results into the same extracted-card review/import list used elsewhere.

## Current State Analysis
- `src/services/pdf.ts`
  - Currently exposes only `extractTextFromPDF(arrayBuffer)` and returns one flat string.
  - No per-page structure, no text-item metadata, and no reusable search index for mapping AI output back onto the PDF.
- `src/services/llm.ts`
  - `scanTextForFlashcards(text)` returns `GeneratedFlashcard[]` with only `front`, `back`, and `tags`.
  - There is no source-anchor metadata, so the UI has no exact term string to highlight in the PDF.
- `src/components/PDFViewer.tsx`
  - Is a standalone viewer with its own open-file dialog, page navigation, and zoom.
  - Renders the PDF text layer but has no controlled props, no extraction actions, and no highlight overlay logic.
- `src/pages/CreateFlashcard.tsx`
  - Has `manual`, `ai-text`, `ai-url`, and `ai-camera` tabs.
  - PDF support currently exists only as an "Import from PDF" file input inside the text tab, which converts the PDF into plain text and fills `aiText`.
  - Extracted-card review/import already exists and should be reused for PDF and selection-based results.
- `src/pages/Test.tsx`
  - Imports and renders `PdfViewer`, so it must stay compatible if the component API changes.

## Assumptions And Decisions
- Highlight behavior: highlight the extracted term text only, not the full definition paragraph.
- Repeated terms: highlight all exact matches of the returned term string across the document.
- Selection workflow: selection-based extraction appends into the same `extractedCards` review list instead of creating a second review surface.
- Selection model: use standard text-layer selection from `react-pdf`, not a freeform rectangle/OCR tool.
- PDF support scope: first implementation targets text PDFs with a usable text layer; scanned-image PDFs continue to fall back to the existing warning path.
- Matching strategy: require the LLM to return a verbatim `sourceTerm` from the PDF text so highlight matching can be exact and deterministic.

## Proposed Changes

### `src/services/pdf.ts`
- Replace the flat-only extraction flow with structured PDF extraction types, for example:
  - `PdfTextItem`
  - `PdfPageText`
  - `PdfExtractionResult`
- Extract page-by-page text plus normalized text items that preserve:
  - page number,
  - raw text content,
  - normalized text for matching,
  - stable item order for rebuilding page text.
- Keep a convenience plain-text output available so the existing text-scan path can still work where needed.
- Add helper utilities that can:
  - flatten structured page text for LLM prompts,
  - match an exact term against per-page items,
  - return highlight descriptors grouped by page.
- Why:
  - the viewer needs page-aware term matches,
  - the LLM prompt needs structured-but-readable PDF text,
  - manual selections need a consistent source format.

### `src/services/llm.ts`
- Extend the flashcard extraction schema for PDF-specific scans with source metadata, for example:
  - `sourceTerm`: verbatim term text to highlight,
  - `sourceContext`: short supporting snippet for debugging/disambiguation,
  - optional `sourceMode`: `"document"` or `"selection"`.
- Keep the existing `GeneratedFlashcard` shape usable by the rest of the app, but introduce a PDF-aware type that extends it.
- Add a dedicated function for PDF/selection scans, such as `scanPdfTextForFlashcards(text, scopeLabel?)`, instead of overloading the current generic text scanner too heavily.
- Update the prompt so the model must:
  - output the existing flashcard fields,
  - return `sourceTerm` exactly as written in the provided PDF text,
  - avoid inventing anchors not present in the source.
- Why:
  - highlight rendering needs an exact string anchor,
  - selection scans need traceable metadata,
  - the generic text scanner should remain stable for non-PDF tabs.

### `src/components/PDFViewer.tsx`
- Convert the component from a self-contained demo viewer into a controlled PDF workspace component.
- Replace the internal file-open responsibility with props from `CreateFlashcard`, such as:
  - loaded PDF bytes/name,
  - current highlighted cards or highlight descriptors,
  - callbacks for text selection extraction,
  - loading/status flags as needed.
- Preserve the existing page navigation and zoom controls.
- Add viewer features:
  - page-aware term highlighting on the rendered text layer,
  - selected-text capture from the browser selection within the PDF text layer,
  - an action button for "Extract definitions from selection",
  - optional sidebar or summary area listing selected text length/current selection state.
- Highlight implementation approach:
  - use `react-pdf` text-layer rendering,
  - decorate matching term spans or inject highlighted markup via text rendering/search mapping,
  - compute page-specific matches from the structured extraction result rather than from ad hoc DOM scraping.
- UX behavior:
  - selecting text enables the selection-scan action,
  - after results come back, matching terms highlight across all exact occurrences in the document,
  - if no text is selected, the selection action stays disabled.

### `src/pages/CreateFlashcard.tsx`
- Add a new `ai-pdf` tab to the existing tab set instead of burying PDF upload inside the text tab.
- Move PDF-specific state here, including:
  - loaded PDF file metadata,
  - structured PDF extraction result,
  - PDF-derived extracted cards,
  - merged highlight descriptors,
  - in-progress selection-scan state.
- Add handlers for:
  - loading a PDF file,
  - extracting structured text once per file,
  - scanning the whole PDF for definitions,
  - scanning only a manual selection from the viewer,
  - appending selection-based cards into `extractedCards`,
  - merging new term highlights without losing prior ones.
- Reuse the existing extracted-card review/import surface so PDF results behave like text/url/camera results.
- Update copy and status messaging to distinguish:
  - full-document PDF extraction,
  - manual selection extraction,
  - scanned PDFs with no text layer.
- Keep existing `ai-text`, `ai-url`, and `ai-camera` behavior unchanged.

### `src/pages/Test.tsx`
- Update the test page if needed so it still compiles against the new `PdfViewer` props.
- If it is purely a dev-only sandbox, keep it minimal and feed mock/no-op props rather than maintaining a second PDF workflow.

## Implementation Order
1. Refactor `src/services/pdf.ts` to produce structured page/text-item extraction data and matching helpers.
2. Extend `src/services/llm.ts` with a PDF-specific extraction function and source-anchor response schema.
3. Refactor `src/components/PDFViewer.tsx` into a controlled component that renders page highlights and emits selection actions.
4. Add the new `ai-pdf` tab and PDF orchestration state to `src/pages/CreateFlashcard.tsx`.
5. Update `src/pages/Test.tsx` only as needed for type compatibility.
6. Run TypeScript/lint diagnostics on edited files and resolve any straightforward issues.

## Verification Steps
- Load a text-based PDF in the new PDF tab and confirm the document renders with paging and zoom intact.
- Run full-document AI extraction and verify returned cards appear in the existing review/import list.
- Confirm every extracted card contributes term highlights in the viewer and repeated terms highlight in all exact occurrences.
- Select a smaller text region in the PDF, run selection-based extraction, and confirm new cards append to the same review list.
- Verify selection-based cards also contribute term highlights after they are added.
- Confirm that importing selected cards into a deck still works after PDF and selection-based extraction.
- Verify non-PDF tabs (`ai-text`, `ai-url`, `ai-camera`, `manual`) still behave the same.
- Check edited files for TypeScript diagnostics and fix any regressions introduced by the refactor.
