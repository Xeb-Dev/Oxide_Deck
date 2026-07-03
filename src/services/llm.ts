export interface AIConfig {
  provider: 'gemini' | 'groq' | 'local';
  geminiKey: string;
  geminiModel: string;
  groqKey: string;
  groqModel: string;
  localUrl: string;
  localModel: string;
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

async function callLLM(prompt: string, systemPrompt: string, imageBase64?: string, imageMimeType?: string): Promise<string> {
  const config = getAIConfig();

  if (config.provider === 'gemini') {
    if (!config.geminiKey) {
      throw new Error("Gemini API key is not configured in Settings.");
    }
    const model = config.geminiModel || 'gemini-1.5-flash';
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

  } else if (config.provider === 'groq') {
    if (!config.groqKey) {
      throw new Error("Groq API key is not configured in Settings.");
    }
    const baseUrl = 'https://api.groq.com/openai/v1';
    const model = config.groqModel || 'llama-3.3-70b-versatile';

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

  } else if (config.provider === 'local') {
    // Local LLM (LM Studio / Ollama): route through Rust proxy to avoid
    // Tauri WebView CORS restrictions which strip the JSON body on localhost requests.
    const { invoke } = await import('@tauri-apps/api/core');

    const baseUrl = (config.localUrl || 'http://localhost:1234/v1').replace(/\/$/, '');
    const model = config.localModel || 'local-model';

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
  const responseText = await callLLM(prompt, systemPrompt);
  
  try {
    const cleaned = cleanJson(responseText);
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed as GeneratedFlashcard[];
    }
    throw new Error("Response was not a JSON array.");
  } catch (e) {
    console.error("Failed to parse AI response:", responseText, e);
    throw new Error("AI response was not in the expected JSON format. Please try again.");
  }
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
  const responseText = await callLLM(prompt, systemPrompt, base64Image, mimeType);

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

  const responseText = await callLLM(prompt, systemPrompt);

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

  const responseText = await callLLM(prompt, systemPrompt);

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

  const responseText = await callLLM(prompt, systemPrompt);

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

  const responseText = await callLLM(prompt, systemPrompt);

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
