export interface AIConfig {
  provider: 'gemini' | 'groq' | 'local';
  geminiKey: string;
  geminiModel: string;
  groqKey: string;
  groqModel: string;
  localUrl: string;
  localModel: string;
}

export type LLMTask = 'scan' | 'validate' | 'teach' | 'quiz' | 'test';

export interface TaskAIConfig {
  provider: 'global' | 'gemini' | 'groq' | 'local';
  model: string;
}

export interface LearningPersonality {
  id: string;
  name: string;
  description: string;
}

export interface GeneratedFlashcard {
  front: string;
  back: string;
  tags?: string;
}

export interface PdfGeneratedFlashcard extends GeneratedFlashcard {
  sourceTerm: string;
  sourceContext?: string;
  sourceMode?: 'document' | 'selection';
  sourcePage?: number;
}

export interface ValidationResult {
  score: number; // 0 to 100
  feedback: string;
}

export interface TeachingTurnResult {
  score: number;
  feedback: string;
  nextPrompt: string;
  shouldContinue: boolean;
}

export interface QuizQuestion {
  id: string;
  type: 'multiple-choice' | 'short-answer';
  question: string;
  options?: string[]; // for multiple choice
  correctAnswer: string; // index for MC, or text for short-answer
}

const DEFAULT_PERSONALITIES: LearningPersonality[] = [
  { id: 'child', name: 'Child', description: 'a curious child who needs simple, concrete examples and very clear explanations' },
  { id: 'high-school', name: 'High School Student', description: 'a motivated high school student who learns best with practical examples and straightforward language' },
  { id: 'university', name: 'University Student', description: 'a university student who appreciates precise terminology and clear conceptual links' },
  { id: 'professor', name: 'Professor', description: 'a professor who expects rigorous, technically accurate explanations with nuance' }
];

export function getAIConfig(): AIConfig {
  const providerRaw = localStorage.getItem('oxide_deck_ai_provider');
  const provider = providerRaw === 'grok' ? 'groq' : (providerRaw as any) || 'gemini';
  
  return {
    provider,
    geminiKey: localStorage.getItem('oxide_deck_gemini_key') || '',
    geminiModel: localStorage.getItem('oxide_deck_gemini_model') || 'gemini-1.5-flash',
    groqKey: localStorage.getItem('oxide_deck_groq_key') || localStorage.getItem('oxide_deck_grok_key') || '',
    groqModel: localStorage.getItem('oxide_deck_groq_model') || localStorage.getItem('oxide_deck_grok_model') || 'llama-3.3-70b-versatile',
    localUrl: localStorage.getItem('oxide_deck_local_url') || 'http://localhost:1234/v1',
    localModel: localStorage.getItem('oxide_deck_local_model') || 'lmstudio-model',
  };
}

export function getTaskAIConfig(task: LLMTask): TaskAIConfig {
  const provider = (localStorage.getItem(`oxide_deck_ai_provider_${task}`) as any) || 'global';
  const model = localStorage.getItem(`oxide_deck_model_${task}`) || '';
  return { provider, model };
}

export function saveTaskAIConfig(task: LLMTask, config: TaskAIConfig): void {
  localStorage.setItem(`oxide_deck_ai_provider_${task}`, config.provider);
  localStorage.setItem(`oxide_deck_model_${task}`, config.model);
}

export function getLearningPersonalities(): LearningPersonality[] {
  const stored = localStorage.getItem('oxide_deck_learning_personalities');
  if (!stored) return DEFAULT_PERSONALITIES;

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.filter((item: any) => item && typeof item.name === 'string' && typeof item.description === 'string')
        .map((item: any) => ({
          id: item.id || crypto.randomUUID(),
          name: item.name,
          description: item.description
        }));
    }
  } catch (error) {
    console.error('Failed to parse learning personalities:', error);
  }

  return DEFAULT_PERSONALITIES;
}

export function saveLearningPersonalities(personalities: LearningPersonality[]): void {
  const cleanPersonalities = personalities
    .filter((persona) => persona?.name?.trim())
    .map((persona) => ({
      id: persona.id || crypto.randomUUID(),
      name: persona.name.trim(),
      description: persona.description?.trim() || 'A helpful learning companion.'
    }));

  localStorage.setItem('oxide_deck_learning_personalities', JSON.stringify(cleanPersonalities));
}

async function callLLM(task: LLMTask, prompt: string, systemPrompt: string, imageBase64?: string, imageMimeType?: string): Promise<string> {
  const config = getAIConfig();
  const taskConfig = getTaskAIConfig(task);

  const provider = taskConfig.provider === 'global' ? config.provider : taskConfig.provider;
  let model = '';
  if (taskConfig.provider !== 'global' && taskConfig.model.trim()) {
    model = taskConfig.model.trim();
  } else {
    if (provider === 'gemini') {
      model = config.geminiModel || 'gemini-1.5-flash';
    } else if (provider === 'groq') {
      model = config.groqModel || 'llama-3.3-70b-versatile';
    } else if (provider === 'local') {
      model = config.localModel || 'lmstudio-model';
    }
  }

  if (provider === 'gemini') {
    if (!config.geminiKey) {
      throw new Error("Gemini API key is not configured in Settings.");
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.geminiKey}`;

    const parts: any[] = [{ text: `${systemPrompt}\n\nUser request:\n${prompt}` }];

    if (imageBase64 && imageMimeType) {
      parts.push({
        inlineData: {
          mimeType: imageMimeType,
          data: imageBase64
        }
      });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("No response text received from Gemini.");
    }
    return text;

  } else if (provider === 'groq') {
    if (!config.groqKey) {
      throw new Error("Groq API key is not configured in Settings.");
    }
    const baseUrl = 'https://api.groq.com/openai/v1';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.groqKey}`,
    };

    let userContent: any = prompt;
    if (imageBase64 && imageMimeType) {
      userContent = [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: { url: `data:${imageMimeType};base64,${imageBase64}` }
        }
      ];
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ];

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages, temperature: 0.2 })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error("No response content received from Groq.");
    }
    return text;

  } else if (provider === 'local') {
    // Local LLM (LM Studio / Ollama): route through Rust proxy to avoid
    // Tauri WebView CORS restrictions which strip the JSON body on localhost requests.
    const { invoke } = await import('@tauri-apps/api/core');

    const baseUrl = (config.localUrl || 'http://localhost:1234/v1').replace(/\/$/, '');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer not-needed',
    };

    let userContent: any = prompt;
    if (imageBase64 && imageMimeType) {
      userContent = [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: { url: `data:${imageMimeType};base64,${imageBase64}` }
        }
      ];
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ];

    const requestBody = JSON.stringify({ model, messages, temperature: 0.2 });

    let responseText: string;
    try {
      responseText = await invoke<string>('proxy_post_request', {
        url: `${baseUrl}/chat/completions`,
        headers,
        body: requestBody,
      });
    } catch (e: any) {
      throw new Error(`Local LLM request failed: ${e}`);
    }

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`Local LLM returned non-JSON response: ${responseText.substring(0, 200)}`);
    }

    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error("No response content received from Local LLM. Check the model is loaded in LM Studio.");
    }
    return text;
  }

  throw new Error("Unknown AI provider.");
}

function cleanJson(text: string): string {
  // Strip out markdown code fences if present
  let clean = text.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```[a-zA-Z]*\n/, '');
    clean = clean.replace(/\n```$/, '');
  }
  return clean.trim();
}

function parseJsonArrayResponse<T>(responseText: string, invalidFormatMessage: string): T[] {
  try {
    const cleaned = cleanJson(responseText);
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed as T[];
    }
    throw new Error("Response was not a JSON array.");
  } catch (e) {
    console.error("Failed to parse AI response:", responseText, e);
    throw new Error(invalidFormatMessage);
  }
}

/**
 * AI Scans raw text to extract key terms and definitions
 */
export async function scanTextForFlashcards(text: string): Promise<GeneratedFlashcard[]> {
  const systemPrompt = `You are an expert educational AI. Analyze the text provided and extract the key terms, concepts, or formulas along with their definitions or explanations.
Output ONLY a JSON array of objects. Do not include any conversational text or markdown code blocks (e.g. do not wrap in \`\`\`json).
Each object in the array must have the following structure:
{
  "front": "The term, question, or concept",
  "back": "The definition, explanation, or answer",
  "tags": "A single comma-separated string of relevant categories or tag labels, or empty"
}
Keep definitions concise but comprehensive.`;

  const prompt = `Please extract terms and definitions from the following text:\n\n${text}`;
  const responseText = await callLLM('scan', prompt, systemPrompt);

  return parseJsonArrayResponse<GeneratedFlashcard>(
    responseText,
    "AI response was not in the expected JSON format. Please try again.",
  );
}

/**
 * AI scans PDF-derived text and returns flashcards plus exact source terms to highlight.
 */
export async function scanPdfTextForFlashcards(
  text: string,
  sourceMode: 'document' | 'selection' = 'document',
): Promise<PdfGeneratedFlashcard[]> {
  const scopeInstruction =
    sourceMode === 'selection'
      ? "The text comes from a user-selected PDF excerpt. Only extract definitions found inside that excerpt."
      : "The text comes from a full PDF document. Extract the most useful definitions from the document.";

  const systemPrompt = `You are an expert educational AI. Analyze the PDF text provided and extract key terms, concepts, or formulas with their definitions or explanations.
Output ONLY a JSON array of objects. Do not include any conversational text or markdown code blocks.
Each object in the array must have the following structure:
{
  "front": "The term, question, or concept",
  "back": "The definition, explanation, or answer",
  "tags": "A single comma-separated string of relevant categories or tag labels, or empty",
  "sourceTerm": "The exact term text copied verbatim from the source PDF text for highlighting",
  "sourceContext": "A short supporting snippet copied from the source text, or empty",
  "sourceMode": "${sourceMode}"
}
Rules:
- "sourceTerm" must be copied exactly from the provided source text and should match the visible term text to highlight.
- Return only terms that actually appear in the source text.
- Keep definitions concise but comprehensive.
- ${scopeInstruction}`;

  const prompt = `Please extract terms and definitions from the following PDF text:\n\n${text}`;
  const responseText = await callLLM('scan', prompt, systemPrompt);
  const parsed = parseJsonArrayResponse<PdfGeneratedFlashcard>(
    responseText,
    "AI response for the PDF scan was not in the expected JSON format. Please try again.",
  );

  return parsed.map((item) => ({
    ...item,
    sourceTerm: item.sourceTerm?.trim() || item.front,
    sourceContext: item.sourceContext?.trim() || "",
    sourceMode,
  }));
}

/**
 * Step 1: AI identifies which terms in the PDF text have definitions worth extracting.
 * Returns a plain string array of term names.
 */
async function identifyDefinableTerms(text: string): Promise<string[]> {
  const systemPrompt = `You are an expert educational AI. Your ONLY task is to read the provided text and identify every term, concept, or formula that has a clear definition or explanation in the text.
Output ONLY a JSON array of strings. Do not include any conversational text or markdown code blocks.
Example output: ["Photosynthesis", "Mitosis", "Ohm's Law"]
Rules:
- Only include terms that are actually defined or explained in the text.
- Do not include general topics or section headings unless they are defined.
- Keep the term names concise — use the exact phrasing from the text.`;

  const prompt = `Identify all terms that have definitions in the following text:\n\n${text}`;
  const responseText = await callLLM('scan', prompt, systemPrompt);
  return parseJsonArrayResponse<string>(
    responseText,
    "AI response for term identification was not in the expected JSON format. Please try again.",
  );
}

/**
 * Step 2: Given a list of identified terms, ask AI to extract definitions for each from the source text.
 */
async function extractDefinitionsForTerms(
  text: string,
  terms: string[],
): Promise<PdfGeneratedFlashcard[]> {
  const termsListStr = terms.map((t, i) => `${i + 1}. ${t}`).join("\n");

  const systemPrompt = `You are an expert educational AI. You are given a PDF document and a numbered list of terms that have been identified as having definitions in the document.
For each term, find its definition or explanation in the text and create a flashcard.
Output ONLY a JSON array of objects. Do not include any conversational text or markdown code blocks.
Each object in the array must have the following structure:
{
  "front": "The term, question, or concept",
  "back": "The definition, explanation, or answer",
  "tags": "A single comma-separated string of relevant categories or tag labels, or empty",
  "sourceTerm": "The exact term text copied verbatim from the source PDF text for highlighting",
  "sourceContext": "A short supporting snippet copied from the source text, or empty",
  "sourceMode": "document"
}
Rules:
- Create one flashcard per term from the list.
- "sourceTerm" must be copied exactly from the provided source text.
- Keep definitions concise but comprehensive.
- If you cannot find a definition for a term, skip it.`;

  const prompt = `Here are the terms to extract definitions for:\n${termsListStr}\n\nSource PDF text:\n\n${text}`;
  const responseText = await callLLM('scan', prompt, systemPrompt);
  const parsed = parseJsonArrayResponse<PdfGeneratedFlashcard>(
    responseText,
    "AI response for definition extraction was not in the expected JSON format. Please try again.",
  );

  return parsed.map((item) => ({
    ...item,
    sourceTerm: item.sourceTerm?.trim() || item.front,
    sourceContext: item.sourceContext?.trim() || "",
    sourceMode: "document" as const,
  }));
}

/**
 * Two-step smart scan: identifies definable terms first, then extracts definitions.
 * Provides a progress callback so the UI can show status updates between steps.
 */
export async function smartScanPdfForFlashcards(
  text: string,
  onProgress?: (step: number, message: string) => void,
): Promise<PdfGeneratedFlashcard[]> {
  // Step 1: Identify terms
  onProgress?.(1, "AI is identifying definable terms in the PDF...");
  const terms = await identifyDefinableTerms(text);

  if (terms.length === 0) {
    return [];
  }

  // Step 2: Extract definitions for identified terms
  onProgress?.(2, `Found ${terms.length} terms. AI is now extracting definitions...`);
  const cards = await extractDefinitionsForTerms(text, terms);

  return cards;
}

/**
 * AI Scans an image (e.g. from camera) to extract key terms and definitions
 */
export async function scanImageForFlashcards(base64Image: string, mimeType: string): Promise<GeneratedFlashcard[]> {
  const systemPrompt = `You are an expert educational AI. Analyze the image provided, which is a photo of a textbook page, slide, or handwritten notes. Extract the key terms, concepts, or formulas along with their definitions or explanations.
Output ONLY a JSON array of objects. Do not include any conversational text or markdown code blocks.
Each object in the array must have the following structure:
{
  "front": "The term, question, or concept",
  "back": "The definition, explanation, or answer",
  "tags": "A single comma-separated string of relevant categories or tag labels, or empty"
}
Keep definitions concise but comprehensive.`;

  const prompt = "Please scan this image of a page/document and extract key terms and definitions.";
  const responseText = await callLLM('scan', prompt, systemPrompt, base64Image, mimeType);

  try {
    const cleaned = cleanJson(responseText);
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed as GeneratedFlashcard[];
    }
    throw new Error("Response was not a JSON array.");
  } catch (e) {
    console.error("Failed to parse AI response from image:", responseText, e);
    throw new Error("AI response was not in the expected JSON format. Please try again.");
  }
}

/**
 * AI Validates a user's typed answer against the correct flashcard back (definition)
 */
export async function validateFlashcardAnswer(front: string, back: string, userAnswer: string): Promise<ValidationResult> {
  const systemPrompt = `You are an AI learning assistant that grades student answers.
Compare the student's answer to the correct definition (the key reference).
Determine if the student understands the core concept. They do not need to match word-for-word, but they must capture the correct meaning and essential elements.
Output ONLY a JSON object. Do not include conversational text or markdown code blocks.
The object must have the following structure:
{
  "score": <number from 0 to 100 reflecting how correct/complete the user's answer is>,
  "feedback": "A very brief explanation (1-2 sentences) of what they got right, what they missed, or how close they were."
}`;

  const prompt = `Flashcard Front (Concept/Question): "${front}"
Correct Reference Definition: "${back}"
Student's Typed Answer: "${userAnswer}"`;

  const responseText = await callLLM('validate', prompt, systemPrompt);

  try {
    const cleaned = cleanJson(responseText);
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.score === 'number' && typeof parsed.feedback === 'string') {
      return parsed as ValidationResult;
    }
    throw new Error("Response fields invalid.");
  } catch (e) {
    console.error("Failed to validate flashcard answer:", responseText, e);
    // Fallback validation
    return {
      score: userAnswer.trim().toLowerCase() === back.trim().toLowerCase() ? 100 : 50,
      feedback: "Failed to query AI validator. Evaluated simple match."
    };
  }
}

export async function validateTeachingExplanation(front: string, back: string, userAnswer: string, persona: LearningPersonality): Promise<ValidationResult> {
  const systemPrompt = `You are ${persona.name}, ${persona.description}. A learner is explaining a flashcard concept to you.
Judge how clearly and accurately they explained it from your perspective.
Use the correct definition as the reference and be encouraging but honest.
Output ONLY a JSON object. Do not include conversational text or markdown code blocks.
The object must have the following structure:
{
  "score": <number from 0 to 100 reflecting how correct/complete the user's explanation is>,
  "feedback": "A brief explanation (1-2 sentences) of what the learner explained well and what they should add or clarify."
}`;

  const prompt = `Flashcard Front (Concept/Question): "${front}"
Correct Reference Definition: "${back}"
Learner's Explanation to You: "${userAnswer}"`;

  const responseText = await callLLM('teach', prompt, systemPrompt);

  try {
    const cleaned = cleanJson(responseText);
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.score === 'number' && typeof parsed.feedback === 'string') {
      return parsed as ValidationResult;
    }
    throw new Error("Response fields invalid.");
  } catch (e) {
    console.error("Failed to validate teaching explanation:", responseText, e);
    return {
      score: userAnswer.trim().toLowerCase().includes(back.trim().toLowerCase().split(' ')[0]) ? 70 : 45,
      feedback: "The explanation was received, but the AI validator could not parse the response. Try giving a clearer explanation."
    };
  }
}

export async function runTeachingDialogue(
  front: string,
  back: string,
  userAnswer: string,
  persona: LearningPersonality,
  conversationHistory: Array<{ role: 'assistant' | 'user'; content: string }>
): Promise<TeachingTurnResult> {
  const systemPrompt = `You are ${persona.name}, ${persona.description}. You are having a lively, challenging conversation with a learner trying to explain a flashcard concept.
Stay in character and sound like a real person who asks probing questions, not a robot. Your job is to push the learner to think more deeply while staying encouraging.
Use the correct definition as the reference. After the learner's latest response, give a brief assessment, then ask one tricky follow-up question that makes them think harder.
Output ONLY a JSON object. Do not include conversational text or markdown code blocks.
The object must have the following structure:
{
  "score": <number from 0 to 100>,
  "feedback": "A short, conversational response to the learner's most recent answer",
  "nextPrompt": "One challenging follow-up question for the learner",
  "shouldContinue": true
}`;

  const historyText = conversationHistory.map(item => `${item.role === 'user' ? 'Learner' : persona.name}: ${item.content}`).join('\n');
  const prompt = `Flashcard Front (Concept/Question): "${front}"
Correct Reference Definition: "${back}"
Conversation so far:
${historyText}

Latest learner answer: "${userAnswer}"`;

  const responseText = await callLLM('teach', prompt, systemPrompt);

  try {
    const cleaned = cleanJson(responseText);
    const parsed = JSON.parse(cleaned);
    if (
      typeof parsed.score === 'number' &&
      typeof parsed.feedback === 'string' &&
      typeof parsed.nextPrompt === 'string' &&
      typeof parsed.shouldContinue === 'boolean'
    ) {
      return parsed as TeachingTurnResult;
    }
    throw new Error("Response fields invalid.");
  } catch (e) {
    console.error("Failed to run teaching dialogue:", responseText, e);
    return {
      score: userAnswer.trim().toLowerCase().includes(back.trim().toLowerCase().split(' ')[0]) ? 72 : 44,
      feedback: "That was a thoughtful start. I still want you to be more precise and connect your explanation back to the key idea.",
      nextPrompt: "Can you explain why that definition matters in a concrete example?",
      shouldContinue: true
    };
  }
}

/**
 * AI Generates a Quiz (distractor multiple-choice and short answer) from existing flashcards
 */
export async function generateQuizFromFlashcards(
  flashcards: { front: string; back: string }[],
  questionCount: number = 5
): Promise<QuizQuestion[]> {
  const systemPrompt = `You are an expert AI quiz generator.
Based on the provided list of flashcards (terms and definitions), generate a quiz with ${questionCount} questions.
Create a mix of Multiple Choice (type: 'multiple-choice') and Short Answer (type: 'short-answer') questions.
For multiple-choice questions, provide 4 options, and set 'correctAnswer' to the index (0, 1, 2, or 3) of the correct option. Ensure that the other 3 options (distractors) are plausible and educational, drawing from other flashcards if relevant.
For short-answer questions, the 'correctAnswer' should be the correct reference definition/answer text (which we will validate later using AI).
Output ONLY a JSON array of objects. Do not include conversational text or markdown code blocks.
Each object in the array must look like this:
{
  "id": "unique_question_id_string",
  "type": "multiple-choice" or "short-answer",
  "question": "The question prompt. E.g. 'What is the definition of CPU?' or 'Explain the concept of X.'",
  "options": ["option 0", "option 1", "option 2", "option 3"], // Only include for 'multiple-choice'
  "correctAnswer": "index_as_string_0_to_3" or "full_text_reference_answer"
}`;

  const cardsText = JSON.stringify(flashcards.map(c => ({ term: c.front, definition: c.back })));
  const prompt = `Generate a quiz from these flashcards:\n\n${cardsText}`;

  const responseText = await callLLM('quiz', prompt, systemPrompt);

  try {
    const cleaned = cleanJson(responseText);
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed as QuizQuestion[];
    }
    throw new Error("Response is not an array.");
  } catch (e) {
    console.error("Failed to generate quiz:", responseText, e);
    throw new Error("AI failed to generate a quiz in the correct format. Please try again.");
  }
}

// ===== TEST SCANNING (real-life subject exams) =====

export type ExtractedTestQuestionType = 'multiple-choice' | 'short-answer' | 'long-answer' | 'true-false' | 'maths';

export interface ExtractedTestQuestion {
  type: ExtractedTestQuestionType;
  question: string;
  options?: string[];
  correctAnswer?: string;
  /** The student's answer as written on the scanned paper, if visible. */
  userAnswer?: string;
  /** The points or score earned for this specific question (e.g. 100 for correct, 0 for wrong, or partial score). */
  score?: number | null;
  /** Step-by-step mathematical working out or derivation, if applicable. */
  mathWork?: string;
}

export interface AnalyzedTestMetadata {
  name: string;
  description: string;
  score: number | null;
  maxScore: number | null;
  testDate: string | null;
}

/**
 * AI scans raw text (e.g. pasted exam content) and extracts structured test questions.
 */
export async function scanTextForTestQuestions(text: string): Promise<ExtractedTestQuestion[]> {
  const systemPrompt = `You are an expert educational AI. Analyze the provided text, which contains a completed or blank exam or test paper (including any student written answers), and extract each question as a structured object.
Output ONLY a JSON array of objects. Do not include any conversational text or markdown code blocks.
Each object in the array must have the following structure:
{
  "type": "multiple-choice" | "short-answer" | "long-answer" | "true-false" | "maths",
  "question": "The full question text, copied verbatim where possible",
  "options": ["option A", "option B", ...], // ONLY for multiple-choice; omit or empty otherwise
  "correctAnswer": "The correct answer to the question (transcribe from paper if shown, OR calculate/provide the correct answer yourself)",
  "userAnswer": "The student's answer as written/selected on the paper, if visible; otherwise omit or empty",
  "score": <number for score earned on this question, e.g. 100 if userAnswer is correct, 0 if wrong; or points written on paper; or null if no student answer is present>,
  "mathWork": "Step-by-step mathematical calculations, equations, or derivations shown on the paper or solved by AI"
}
Rules:
- Preserve the original question wording as closely as possible.
- For multiple-choice, list all the options exactly as written.
- Provide "correctAnswer" for every question. If the correct answer is written on the paper, transcribe it; otherwise solve/provide the accurate answer.
- Include "userAnswer" if the student's handwritten, selected, or typed answer is visible in the source; otherwise omit it.
- Grade or calculate "score" for each question. If student's answer is present, assign a numeric score.
- For mathematical or equation questions (or when step-by-step working out is shown on paper), set type to "maths" and transcribe or provide the step-by-step working out in "mathWork".`;

  const prompt = `Please extract the test questions from the following text:\n\n${text}`;
  const responseText = await callLLM('test', prompt, systemPrompt);
  const parsed = parseJsonArrayResponse<any>(
    responseText,
    "AI response was not in the expected JSON format. Please try again.",
  );
  return parsed.map((q: any) => ({
    type: q.type || 'short-answer',
    question: q.question || '',
    options: Array.isArray(q.options) ? q.options : [],
    correctAnswer: q.correctAnswer || '',
    userAnswer: q.userAnswer || '',
    score: typeof q.score === 'number' ? q.score : (typeof q.score === 'string' && q.score.trim() !== '' && !isNaN(Number(q.score)) ? Number(q.score) : null),
    mathWork: q.mathWork || '',
  }));
}

/**
 * AI scans PDF-derived text and extracts structured test questions.
 */
export async function scanPdfForTestQuestions(promptText: string): Promise<ExtractedTestQuestion[]> {
  const systemPrompt = `You are an expert educational AI. Analyze the provided PDF text, which contains a completed or blank exam or test paper (including any student written answers), and extract each question as a structured object.
Output ONLY a JSON array of objects. Do not include any conversational text or markdown code blocks.
Each object in the array must have the following structure:
{
  "type": "multiple-choice" | "short-answer" | "long-answer" | "true-false" | "maths",
  "question": "The full question text, copied verbatim where possible",
  "options": ["option A", "option B", ...], // ONLY for multiple-choice; omit or empty otherwise
  "correctAnswer": "The correct answer to the question (transcribe from paper if shown, OR calculate/provide the correct answer yourself)",
  "userAnswer": "The student's answer as written/selected on the paper, if visible; otherwise omit or empty",
  "score": <number for score earned on this question, e.g. 100 if userAnswer is correct, 0 if wrong; or points written on paper; or null if no student answer is present>,
  "mathWork": "Step-by-step mathematical calculations, equations, or derivations shown on the paper or solved by AI"
}
Rules:
- Preserve the original question wording as closely as possible.
- For multiple-choice, list all the options exactly as written.
- Provide "correctAnswer" for every question. If the correct answer is written on the paper, transcribe it; otherwise solve/provide the accurate answer.
- Include "userAnswer" if the student's handwritten, selected, or typed answer is visible in the source; otherwise omit it.
- Grade or calculate "score" for each question. If student's answer is present, assign a numeric score.
- For mathematical or equation questions (or when step-by-step working out is shown on paper), set type to "maths" and transcribe or provide the step-by-step working out in "mathWork".`;

  const prompt = `Please extract the test questions from the following PDF text:\n\n${promptText}`;
  const responseText = await callLLM('test', prompt, systemPrompt);
  const parsed = parseJsonArrayResponse<any>(
    responseText,
    "AI response for the PDF scan was not in the expected JSON format. Please try again.",
  );
  return parsed.map((q: any) => ({
    type: q.type || 'short-answer',
    question: q.question || '',
    options: Array.isArray(q.options) ? q.options : [],
    correctAnswer: q.correctAnswer || '',
    userAnswer: q.userAnswer || '',
    score: typeof q.score === 'number' ? q.score : (typeof q.score === 'string' && q.score.trim() !== '' && !isNaN(Number(q.score)) ? Number(q.score) : null),
    mathWork: q.mathWork || '',
  }));
}

/**
 * AI scans an image (photo of an exam paper) and extracts structured test questions.
 */
export async function scanImageForTestQuestions(base64Image: string, mimeType: string): Promise<ExtractedTestQuestion[]> {
  const systemPrompt = `You are an expert educational AI. Analyze the provided image, which is a photo or scan of an exam or test paper (including any student handwritten/selected answers). Extract each question as a structured object.
Output ONLY a JSON array of objects. Do not include any conversational text or markdown code blocks.
Each object in the array must have the following structure:
{
  "type": "multiple-choice" | "short-answer" | "long-answer" | "true-false" | "maths",
  "question": "The full question text, transcribed as accurately as possible",
  "options": ["option A", "option B", ...], // ONLY for multiple-choice; omit or empty otherwise
  "correctAnswer": "The correct answer to the question (transcribe from paper if shown, OR calculate/provide the correct answer yourself)",
  "userAnswer": "The student's handwritten/selected answer transcribed from the image, if visible; otherwise omit or empty",
  "score": <number for score earned on this question, e.g. 100 if userAnswer is correct, 0 if wrong; or points written on paper; or null if no student answer is present>,
  "mathWork": "Step-by-step mathematical calculations, equations, or derivations shown on the paper or solved by AI"
}
Rules:
- Transcribe the question text as accurately as possible from the image.
- For multiple-choice, list all the options exactly as written.
- Provide "correctAnswer" for every question. If the correct answer is shown on the paper, transcribe it; otherwise calculate/provide the accurate answer.
- Include "userAnswer" if the student's handwritten or selected answer is visible in the image; transcribe it accurately; otherwise omit it.
- Grade or calculate "score" for each question. If student's answer is present, assign a numeric score.
- For mathematical or equation questions (or when step-by-step working out is shown on paper), set type to "maths" and transcribe or provide the step-by-step working out in "mathWork".`;

  const prompt = "Please scan this image of an exam/test paper and extract all the questions.";
  const responseText = await callLLM('test', prompt, systemPrompt, base64Image, mimeType);

  try {
    const cleaned = cleanJson(responseText);
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.map((q: any) => ({
        type: q.type || 'short-answer',
        question: q.question || '',
        options: Array.isArray(q.options) ? q.options : [],
        correctAnswer: q.correctAnswer || '',
        userAnswer: q.userAnswer || '',
        score: typeof q.score === 'number' ? q.score : (typeof q.score === 'string' && q.score.trim() !== '' && !isNaN(Number(q.score)) ? Number(q.score) : null),
        mathWork: q.mathWork || '',
      }));
    }
    throw new Error("Response was not a JSON array.");
  } catch (e) {
    console.error("Failed to parse AI response from image:", responseText, e);
    throw new Error("AI response was not in the expected JSON format. Please try again.");
  }
}

// ===== TEST ANSWER REVIEW (AI comments on each question) =====

export interface TestQuestionReview {
  questionIndex: number;
  isCorrect: boolean;
  userAnswer: string;
  correctAnswer: string;
  feedback: string;
}

/**
 * AI reviews the user's answers to a saved test and produces per-question commentary,
 * focusing on questions the user got wrong.
 *
 * @param questions The test questions (with correct answers, if available).
 * @param userAnswers The user's answers, indexed parallel to `questions`. Empty string = skipped.
 * @returns Per-question review array, indexed parallel to `questions`.
 */
export async function reviewTestAnswers(
  questions: { question: string; type: string; options?: string[] | null; correctAnswer?: string | null }[],
  userAnswers: string[],
): Promise<TestQuestionReview[]> {
  const items = questions.map((q, i) => ({
    index: i,
    type: q.type,
    question: q.question,
    options: q.options ?? null,
    correctAnswer: q.correctAnswer ?? null,
    userAnswer: userAnswers[i] ?? "",
  }));

  const systemPrompt = `You are an expert educational AI reviewing a student's completed exam.
For each question, compare the student's answer to the correct answer (if provided). Determine whether the student's answer is correct, and write a concise, helpful comment.
- If the student's answer is correct, briefly affirm it.
- If the student's answer is wrong or incomplete, explain WHY it is wrong, what the correct answer is, and what the student should study to improve.
- If no correct answer was provided for a question, do your best to evaluate the student's answer on its merits and provide the correct answer yourself with a brief explanation.
- If the student left the answer blank, mark it incorrect and explain what the correct answer would be.
Output ONLY a JSON array of objects. Do not include conversational text or markdown code blocks.
Each object must have this structure:
{
  "questionIndex": <the zero-based index of the question>,
  "isCorrect": <true or false>,
  "userAnswer": "The student's answer, echoed back",
  "correctAnswer": "The correct answer",
  "feedback": "A concise (1-3 sentence) comment explaining the result and how to improve"
}
The array must contain one object per question, in the same order as the input.`;

  const prompt = `Please review the student's answers to the following test questions:\n\n${JSON.stringify(items, null, 2)}`;
  const responseText = await callLLM('validate', prompt, systemPrompt);

  try {
    const cleaned = cleanJson(responseText);
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed as TestQuestionReview[];
    }
    throw new Error("Response was not a JSON array.");
  } catch (e) {
    console.error("Failed to review test answers:", responseText, e);
    throw new Error("AI failed to review the test answers. Please try again.");
  }
}

/**
 * AI analyzes scanned test content (text or PDF-extracted text) and infers the
 * test metadata: name, description, score, max score, and test date.
 * Used to auto-fill the metadata form after a scan.
 *
 * @param sourceText The raw text extracted from the scanned test paper.
 * @param questions The questions extracted from the same source (used to infer max score).
 */
export async function analyzeTestMetadata(
  sourceText: string,
  questions: ExtractedTestQuestion[],
): Promise<{ name: string; description: string; score: number | null; maxScore: number; testDate: string | null; timeLimitMinutes: number | null }> {
  const systemPrompt = `You are an expert educational test analyzer.
Given source text from an exam paper and its extracted questions, extract or infer metadata for the test:
{
  "name": "Descriptive title for the test (e.g. Physics Midterm 2025)",
  "description": "Concise 1-sentence summary of covered topics",
  "score": <the total score earned as a number e.g. 85, or evaluate student answers to calculate total score out of maxScore>,
  "maxScore": <the maximum possible score as a number, defaulting to 100 or total points>,
  "testDate": <the date the test was taken in YYYY-MM-DD format if visible on the paper, otherwise null>,
  "timeLimitMinutes": <allocated duration/time limit in minutes if printed on paper e.g. 60, 90, 120, or null>
}
Rules:
- Infer the name from headings, titles, or the subject matter of the questions.
- ALWAYS provide "score" and "maxScore". If a total score is explicitly written on the paper (e.g. "85/100" or "Score: 85"), use that exact score. If no explicit total score is printed, but student answers ("userAnswer") are present, evaluate the student's answers against the correct answers and compute total score out of maxScore (e.g. scaled to 100 or total questions).
- Only set "testDate" if a date is explicitly printed on the paper; otherwise null.
- Set "timeLimitMinutes" if a time limit (e.g. "Time allowed: 1 Hour", "Time: 90 mins") is printed on the paper; otherwise null.`;

  const prompt = `Source text from the test paper:\n\n${sourceText.slice(0, 4000)}\n\nExtracted questions (${questions.length}):\n${JSON.stringify(questions.map((q) => ({ type: q.type, question: q.question, correctAnswer: q.correctAnswer, userAnswer: q.userAnswer, score: q.score })), null, 2)}`;
  const responseText = await callLLM('test', prompt, systemPrompt);

  try {
    const cleaned = cleanJson(responseText);
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === 'object' && parsed !== null) {
      return {
        name: typeof parsed.name === 'string' ? parsed.name : '',
        description: typeof parsed.description === 'string' ? parsed.description : '',
        score: typeof parsed.score === 'number' ? parsed.score : (typeof parsed.score === 'string' && parsed.score.trim() !== '' && !isNaN(Number(parsed.score)) ? Number(parsed.score) : null),
        maxScore: typeof parsed.maxScore === 'number' ? parsed.maxScore : (typeof parsed.maxScore === 'string' && parsed.maxScore.trim() !== '' && !isNaN(Number(parsed.maxScore)) ? Number(parsed.maxScore) : 100),
        testDate: typeof parsed.testDate === 'string' && parsed.testDate ? parsed.testDate : null,
        timeLimitMinutes: typeof parsed.timeLimitMinutes === 'number' ? parsed.timeLimitMinutes : (typeof parsed.timeLimitMinutes === 'string' && parsed.timeLimitMinutes.trim() !== '' && !isNaN(Number(parsed.timeLimitMinutes)) ? Number(parsed.timeLimitMinutes) : null),
      };
    }
    throw new Error("Response was not a JSON object.");
  } catch (e) {
    console.error("Failed to analyze test metadata:", responseText, e);
    throw new Error("AI failed to analyze the test metadata. Please try again.");
  }
}

/**
 * AI automatically completes all fields for a test question set:
 * populates missing correct answers, fills user answers if detectable,
 * computes/grades total score, and generates test metadata (name, description).
 */
export async function autoFillAndGradeTestForm(
  questions: { type: string; question: string; options?: string[]; correctAnswer?: string; userAnswer?: string; score?: number | null; mathWork?: string }[],
  sourceText?: string,
): Promise<{
  name: string;
  description: string;
  score: number | null;
  maxScore: number;
  testDate: string | null;
  timeLimitMinutes: number | null;
  questions: { type: string; question: string; options?: string[]; correctAnswer: string; userAnswer: string; score: number | null; mathWork: string }[];
}> {
  const systemPrompt = `You are an expert educational AI assistant.
Given a list of exam/test questions (and optional source text), perform a complete auto-fill and grading analysis:
1. Ensure every question has a valid "correctAnswer". If missing, solve the question and provide the correct answer.
2. Preserve or refine "userAnswer" for each question.
3. For mathematical or equation questions (or questions of type "maths"), provide or refine the step-by-step mathematical working out, calculations, or derivations in "mathWork".
4. Grade each individual question: calculate a "score" for each question (e.g., 100 for correct, 0 for incorrect, partial score for partial credit, or point value out of 100).
5. Calculate the student's total test "score" and "maxScore" (e.g., sum of question scores or scaled to 100).
6. Generate a concise, descriptive test "name" (e.g., 'Physics Quiz 2') and a brief "description".
7. Infer "testDate" (YYYY-MM-DD) if mentioned, or null.
8. Infer "timeLimitMinutes" (allocated duration in minutes, e.g. 60 or 90) if printed on paper, or null.

Output ONLY a JSON object. Do not include conversational text or markdown code blocks.
Object structure:
{
  "name": "Test Name",
  "description": "Short description",
  "score": <number or null for total test score>,
  "maxScore": <number, e.g. 100 or total points>,
  "testDate": "YYYY-MM-DD" or null,
  "timeLimitMinutes": <number allocated duration in minutes, e.g. 60, or null>,
  "questions": [
    {
      "type": "multiple-choice" | "short-answer" | "long-answer" | "true-false" | "maths",
      "question": "Question text",
      "options": ["A", "B", ...],
      "correctAnswer": "Correct answer",
      "userAnswer": "User answer",
      "score": <number or null, score/points for this specific question>,
      "mathWork": "Step-by-step math working out or derivation"
    }
  ]
}`;

  const prompt = `Please complete auto-fill and grade analysis for this test form:\n${sourceText ? `Source Text:\n${sourceText.slice(0, 3000)}\n\n` : ''}Questions:\n${JSON.stringify(questions, null, 2)}`;
  const responseText = await callLLM('test', prompt, systemPrompt);

  try {
    const cleaned = cleanJson(responseText);
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === 'object' && parsed !== null && Array.isArray(parsed.questions)) {
      return {
        name: typeof parsed.name === 'string' ? parsed.name : '',
        description: typeof parsed.description === 'string' ? parsed.description : '',
        score: typeof parsed.score === 'number' ? parsed.score : (typeof parsed.score === 'string' && parsed.score.trim() !== '' && !isNaN(Number(parsed.score)) ? Number(parsed.score) : null),
        maxScore: typeof parsed.maxScore === 'number' ? parsed.maxScore : (typeof parsed.maxScore === 'string' && parsed.maxScore.trim() !== '' && !isNaN(Number(parsed.maxScore)) ? Number(parsed.maxScore) : 100),
        testDate: typeof parsed.testDate === 'string' && parsed.testDate ? parsed.testDate : null,
        timeLimitMinutes: typeof parsed.timeLimitMinutes === 'number' ? parsed.timeLimitMinutes : (typeof parsed.timeLimitMinutes === 'string' && parsed.timeLimitMinutes.trim() !== '' && !isNaN(Number(parsed.timeLimitMinutes)) ? Number(parsed.timeLimitMinutes) : null),
        questions: parsed.questions.map((q: any) => ({
          type: q.type || 'short-answer',
          question: q.question || '',
          options: Array.isArray(q.options) ? q.options : [],
          correctAnswer: q.correctAnswer || '',
          userAnswer: q.userAnswer || '',
          score: typeof q.score === 'number' ? q.score : (typeof q.score === 'string' && q.score.trim() !== '' && !isNaN(Number(q.score)) ? Number(q.score) : null),
          mathWork: q.mathWork || '',
        })),
      };
    }
    throw new Error("Response was not a valid JSON object.");
  } catch (e) {
    console.error("Failed autoFillAndGradeTestForm:", responseText, e);
    throw new Error("AI failed to auto-fill all test fields. Please try again.");
  }
}

export interface FullTestAnalysisResult {
  summary: string;
  strengths: string;
  weaknesses: string;
  recommendations: string;
  calculatedScore: number;
  maxScore: number;
  errors: {
    questionId?: string;
    questionText: string;
    userAnswer: string;
    correctAnswer: string;
    errorReason: string;
    score: number;
  }[];
}

/**
 * Perform deep AI analysis of a test: evaluates performance, calculates overall score,
 * generates breakdown summary with strengths/weaknesses, and identifies specific errors made.
 */
export async function analyzeTestWithAI(
  testName: string,
  subjectName: string,
  questions: { id?: string; type: string; question: string; options?: string[] | null; correctAnswer?: string | null; userAnswer?: string | null; score?: number | null; mathWork?: string | null }[],
): Promise<FullTestAnalysisResult> {
  const systemPrompt = `You are an expert AI educational tutor and diagnostic evaluator analyzing a completed student test titled "${testName}" in the subject "${subjectName}".
Analyze the questions, correct answers, student answers, and question scores.

Perform a thorough diagnostic review and output ONLY a JSON object with this structure:
{
  "summary": "Concise 2-3 sentence overview of overall student performance on this test.",
  "strengths": "1-2 bullet points or sentences highlighting what concepts the student mastered.",
  "weaknesses": "1-2 bullet points or sentences highlighting key misconception areas or topic gaps.",
  "recommendations": "Actionable, concrete study advice and next steps for improvement.",
  "calculatedScore": <number total score earned by student on this test, e.g. 75>,
  "maxScore": <number total possible points, e.g. 100>,
  "errors": [
    {
      "questionId": "ID of question if provided, or empty string",
      "questionText": "Full question prompt",
      "userAnswer": "The student's incorrect or partial answer",
      "correctAnswer": "The official correct answer",
      "errorReason": "Clear, encouraging 1-2 sentence explanation of WHY the answer was incorrect or incomplete, what concept was missed, and how to solve it correctly.",
      "score": <score earned for this specific question, e.g. 0 or partial points>
    }
  ]
}

Rules:
- Include in "errors" array ANY question where the student made a mistake, earned < 100% credit, left it blank, or gave an incorrect/incomplete response.
- Provide constructive, clear, and encouraging "errorReason" explanation for each mistake.
- Output strictly valid JSON without markdown wrapping.`;

  const prompt = `Test Title: ${testName}\nSubject: ${subjectName}\nQuestions and Student Responses:\n${JSON.stringify(questions, null, 2)}`;
  const responseText = await callLLM('test', prompt, systemPrompt);

  try {
    const cleaned = cleanJson(responseText);
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === 'object' && parsed !== null) {
      return {
        summary: typeof parsed.summary === 'string' ? parsed.summary : 'Test analysis completed.',
        strengths: typeof parsed.strengths === 'string' ? parsed.strengths : '',
        weaknesses: typeof parsed.weaknesses === 'string' ? parsed.weaknesses : '',
        recommendations: typeof parsed.recommendations === 'string' ? parsed.recommendations : '',
        calculatedScore: typeof parsed.calculatedScore === 'number' ? parsed.calculatedScore : 0,
        maxScore: typeof parsed.maxScore === 'number' ? parsed.maxScore : 100,
        errors: Array.isArray(parsed.errors)
          ? parsed.errors.map((e: any) => ({
              questionId: e.questionId || '',
              questionText: e.questionText || '',
              userAnswer: e.userAnswer || '',
              correctAnswer: e.correctAnswer || '',
              errorReason: e.errorReason || 'Incorrect response.',
              score: typeof e.score === 'number' ? e.score : 0,
            }))
          : [],
      };
    }
    throw new Error("Invalid JSON structure returned by AI.");
  } catch (e) {
    console.error("Failed analyzeTestWithAI:", responseText, e);
    throw new Error("AI failed to analyze the test. Please try again.");
  }
}
