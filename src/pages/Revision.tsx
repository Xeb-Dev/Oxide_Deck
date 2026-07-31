import { useEffect, useRef, useState } from "react";
import {
  getFlashcards, getDueFlashcards, reviewFlashcard, addRevisionHistory,
  Flashcard, Deck, getDecks
} from "../services/db";
import { Rating, scoreToRating } from "../services/fsrs";
import {
  validateFlashcardAnswer, runTeachingDialogue, generateQuizFromFlashcards, QuizQuestion, ValidationResult,
  getLearningPersonalities, LearningPersonality
} from "../services/llm";
import { 
  Sparkles, RotateCcw, AlertCircle, Loader2, Award
} from "lucide-react";
import MathText from "../components/MathText";
import StatusBanner from "../components/StatusBanner";

interface RevisionProps {
  currentNav: {
    page: 'dashboard' | 'folders' | 'create' | 'revision' | 'settings' | 'tests' | 'scores' | 'mock';
    deckId?: string;
    revisionMode?: 'flashcard' | 'quiz' | 'teach';
  };
  setCurrentNav: (nav: any) => void;
}

export default function Revision({ currentNav, setCurrentNav }: RevisionProps) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [revisionMode, setRevisionMode] = useState<'flashcard' | 'quiz' | 'teach'>('flashcard');

  // Flashcards session states
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [userTypedAnswer, setUserTypedAnswer] = useState("");
  const [aiValidation, setAiValidation] = useState<ValidationResult | null>(null);
  const [validatingAnswer, setValidatingAnswer] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);

  // Quiz states
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({}); // questionId -> userAnswer
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizGradingResults, setQuizGradingResults] = useState<Record<string, { score: number; feedback: string }>>({});
  const [quizFinalScore, setQuizFinalScore] = useState(0);
  const [availablePersonalities, setAvailablePersonalities] = useState<LearningPersonality[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [teachConversation, setTeachConversation] = useState<Array<{ role: 'assistant' | 'user'; content: string; score?: number }>>([]);
  const [teachIsSubmitting, setTeachIsSubmitting] = useState(false);
  const teachChatRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const personalities = getLearningPersonalities();
    setAvailablePersonalities(personalities);
    if (personalities.length > 0) {
      setSelectedPersonaId(prev => prev && personalities.some(persona => persona.id === prev) ? prev : personalities[0].id);
    }
  }, []);

  useEffect(() => {
    if (currentNav.deckId) {
      loadDeckAndCards(currentNav.deckId);
    }
  }, [currentNav.deckId, currentNav.revisionMode]);

  useEffect(() => {
    if (revisionMode !== 'teach') {
      setTeachConversation([]);
      return;
    }

    if (cards.length === 0) {
      setTeachConversation([]);
      return;
    }

    const card = cards[currentIndex];
    if (!card) return;

    setTeachConversation([]);
    setUserTypedAnswer("");
    setAiValidation(null);
  }, [revisionMode, cards, currentIndex, selectedPersonaId, availablePersonalities]);

  useEffect(() => {
    if (teachChatRef.current) {
      teachChatRef.current.scrollTop = teachChatRef.current.scrollHeight;
    }
  }, [teachConversation, revisionMode]);

  const loadDeckAndCards = async (deckId: string) => {
    try {
      setLoading(true);
      setErrorBanner(null);
      const decks = await getDecks();
      const targetDeck = decks.find(x => x.id === deckId);
      if (targetDeck) {
        setDeck(targetDeck);
      }

      const mode = currentNav.revisionMode || 'flashcard';
      setRevisionMode(mode as any);

      // Load cards
      let allCards = await getFlashcards(deckId);
      setCards(allCards);
      
      if (mode === 'flashcard') {
        // Spaced repetition style: only review due cards, but if none are due, review all
        const due = await getDueFlashcards();
        const deckDue = due.filter(x => x.deck_id === deckId);
        if (deckDue.length > 0) {
          setCards(deckDue);
        }
      } else if (mode === 'quiz') {
        generateAIQuiz(allCards);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // GENERATE AI QUIZ
  const generateAIQuiz = async (deckCards: Flashcard[]) => {
    if (deckCards.length === 0) return;
    try {
      setLoading(true);
      // Generate up to 5 questions based on deck size
      const count = Math.min(deckCards.length, 5);
      const generated = await generateQuizFromFlashcards(deckCards, count);
      setQuizQuestions(generated);
      setQuizAnswers({});
      setQuizSubmitted(false);
      setQuizGradingResults({});
    } catch (e: any) {
      console.error(e);
      setErrorBanner(e.message || "Failed to generate AI quiz. Check Settings.");
    } finally {
      setLoading(false);
    }
  };

  // FLASHCARD FSRS GRADING
  const handleCardGrade = async (rating: Rating) => {
    if (cards.length === 0) return;
    const card = cards[currentIndex];
    
    try {
      await reviewFlashcard(card.id, rating);
      
      // Move to next card
      setIsFlipped(false);
      setUserTypedAnswer("");
      setAiValidation(null);

      if (currentIndex + 1 < cards.length) {
        setCurrentIndex(prev => prev + 1);
      } else {
        setSessionCompleted(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmitTeachAnswer = async () => {
    if (!userTypedAnswer.trim()) return;
    const card = cards[currentIndex];
    const selectedPersona = availablePersonalities.find(persona => persona.id === selectedPersonaId);

    if (!card || !selectedPersona) return;

    try {
      setTeachIsSubmitting(true);
      const nextConversation = [...teachConversation, { role: 'user' as const, content: userTypedAnswer }];
      setTeachConversation(nextConversation);
      const result = await runTeachingDialogue(card.front, card.back, userTypedAnswer, selectedPersona, nextConversation);
      setTeachConversation(prev => [...prev, {
        role: 'assistant',
        content: `${result.feedback}\n\n${result.nextPrompt}`,
        score: result.score
      }]);
      setUserTypedAnswer("");
      setAiValidation({ score: result.score, feedback: result.feedback });
    } catch (e: any) {
      console.error(e);
      setErrorBanner(e.message || "The AI tutor could not continue the conversation.");
    } finally {
      setTeachIsSubmitting(false);
    }
  };

  // AI ANSWER VALIDATOR (FLASHCARD)
  const handleValidateTypedAnswer = async () => {
    if (!userTypedAnswer.trim()) return;
    const card = cards[currentIndex];
    const selectedPersona = availablePersonalities.find(persona => persona.id === selectedPersonaId);

    if (revisionMode === 'teach' && selectedPersona) {
      await handleSubmitTeachAnswer();
      return;
    }

    try {
      setValidatingAnswer(true);
      const result = await validateFlashcardAnswer(card.front, card.back, userTypedAnswer);
      setAiValidation(result);
      setIsFlipped(true); // Flip card to reveal backend reference
    } catch (e: any) {
      console.error(e);
      setErrorBanner(e.message || "AI validation failed. Please grade yourself.");
    } finally {
      setValidatingAnswer(false);
    }
  };

  // Auto FSRS Mapping from AI Score
  const handleAcceptAIValidation = () => {
    if (!aiValidation) return;
    const rating = scoreToRating(aiValidation.score);
    handleCardGrade(rating);
  };

  // QUIZ SUBMIT & AI GRADING
  const handleQuizSubmit = async () => {
    try {
      setLoading(true);
      let correctCount = 0;
      const grading: Record<string, { score: number; feedback: string }> = {};

      for (const q of quizQuestions) {
        const answer = quizAnswers[q.id] || "";
        
        if (q.type === 'multiple-choice') {
          const isCorrect = answer === q.correctAnswer;
          if (isCorrect) correctCount++;
          grading[q.id] = {
            score: isCorrect ? 100 : 0,
            feedback: isCorrect ? "Correct!" : `Incorrect. The correct answer was option ${parseInt(q.correctAnswer) + 1}.`
          };
        } else {
          // Short answer: validate via AI
          setStatusMsg(`AI is grading short answer: "${q.question}"...`);
          try {
            const validation = await validateFlashcardAnswer(q.question, q.correctAnswer, answer);
            grading[q.id] = validation;
            correctCount += (validation.score / 100);
          } catch (err) {
            grading[q.id] = {
              score: 0,
              feedback: "Error querying AI grader. Marked 0."
            };
          }
        }
      }

      const scorePct = Math.round((correctCount / quizQuestions.length) * 100);
      setQuizFinalScore(scorePct);
      setQuizGradingResults(grading);
      setQuizSubmitted(true);

      // Record in SQLite history
      await addRevisionHistory(null, 'quiz', scorePct);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setStatusMsg("");
    }
  };

  const [statusMsg, setStatusMsg] = useState("");
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px", gap: "16px" }}>
        <Loader2 size={36} className="animate-spin" style={{ animation: "spin 1s linear infinite" }} />
        <span>{statusMsg || (revisionMode === 'quiz' ? "Generating AI Quiz..." : "Loading revision Arena...")}</span>
      </div>
    );
  }

  if (errorBanner && revisionMode === 'quiz' && quizQuestions.length === 0) {
    return (
      <>
        <StatusBanner
          message={errorBanner}
          variant="error"
          onDismiss={() => setErrorBanner(null)}
        />
        <div style={{ textAlign: "center", padding: "40px" }}>
          <AlertCircle size={40} color="var(--danger-color)" />
          <h2 style={{ marginTop: "16px" }}>Quiz generation failed</h2>
          <p className="sub-description" style={{ marginTop: "8px" }}>
            Check your AI provider settings and try again.
          </p>
          <button
            className="notion-btn"
            style={{ marginTop: "20px" }}
            onClick={() => setCurrentNav({ page: 'folders', deckId: currentNav.deckId })}
          >
            Back to Deck
          </button>
        </div>
      </>
    );
  }

  if (cards.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px" }}>
        <AlertCircle size={40} color="var(--text-secondary)" />
        <h2 style={{ marginTop: "16px" }}>No cards available</h2>
        <p className="sub-description" style={{ marginTop: "8px" }}>
          You need to add cards to this deck first.
        </p>
        <button 
          className="notion-btn" 
          style={{ marginTop: "20px" }}
          onClick={() => setCurrentNav({ page: 'create' })}
        >
          Create Cards
        </button>
      </div>
    );
  }

  // FLASHCARDS COMPLETION SCREEN
  if (sessionCompleted) {
    return (
      <div style={{ textAlign: "center", padding: "40px", display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
        <Award size={64} color="var(--success-color)" />
        <h1 className="page-title" style={{ justifyContent: "center" }}>Revision Session Complete!</h1>
        <p className="sub-description">
          Excellent work. You have reviewed all scheduled cards for the deck <strong>{deck?.name}</strong>.
        </p>
        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
          <button className="notion-btn" onClick={() => setCurrentNav({ page: 'dashboard' })}>
            Back to Dashboard
          </button>
          <button className="notion-btn secondary" onClick={() => loadDeckAndCards(currentNav.deckId!)}>
            <RotateCcw size={14} /> Restart Session
          </button>
        </div>
      </div>
    );
  }

  // RENDER QUIZ MODE
  if (revisionMode === 'quiz') {
    return (
      <>
        {errorBanner && (
          <StatusBanner
            message={errorBanner}
            variant="error"
            onDismiss={() => setErrorBanner(null)}
          />
        )}
        <div>
          <span className="page-emoji">📝</span>
          <h1 className="page-title">AI Quiz: {deck?.name}</h1>
          <p className="sub-description">
            Test your learning recall. Short answer questions are graded in real-time by the AI.
          </p>
        </div>

        <div className="divider" />

        <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "600px", margin: "0 auto", width: "100%" }}>
          {quizQuestions.map((q, idx) => {
            const gradeResult = quizGradingResults[q.id];
            return (
              <div key={q.id} className="quiz-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Question {idx + 1} of {quizQuestions.length}
                  </span>
                  {quizSubmitted && gradeResult && (
                    <span 
                      style={{ 
                        fontSize: "0.8rem", 
                        fontWeight: 700, 
                        color: gradeResult.score >= 70 ? "var(--success-color)" : gradeResult.score >= 40 ? "var(--warning-color)" : "var(--danger-color)",
                        backgroundColor: gradeResult.score >= 70 ? "var(--success-light)" : "var(--danger-light)",
                        padding: "2px 8px",
                        borderRadius: "12px"
                      }}
                    >
                      Score: {gradeResult.score}%
                    </span>
                  )}
                </div>

                <div className="quiz-question-text"><MathText as="span">{q.question}</MathText></div>

                {q.type === 'multiple-choice' ? (
                  <div className="quiz-options">
                    {q.options?.map((opt, oIdx) => {
                      const isSelected = quizAnswers[q.id] === String(oIdx);
                      return (
                        <button
                          key={oIdx}
                          disabled={quizSubmitted}
                          className={`quiz-option ${isSelected ? 'selected' : ''}`}
                          onClick={() => setQuizAnswers(prev => ({ ...prev, [q.id]: String(oIdx) }))}
                          style={{
                            borderWidth: quizSubmitted && String(oIdx) === q.correctAnswer ? "2px" : "1px",
                            borderColor: quizSubmitted && String(oIdx) === q.correctAnswer ? "var(--success-color)" : undefined
                          }}
                        >
                          <span style={{ fontWeight: 600, marginRight: "8px" }}>{String.fromCharCode(65 + oIdx)}.</span> <MathText as="span">{opt}</MathText>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="notion-input-group">
                    <textarea
                      disabled={quizSubmitted}
                      className="notion-input"
                      rows={3}
                      value={quizAnswers[q.id] || ""}
                      onChange={(e) => setQuizAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder="Write your explanation..."
                    />
                  </div>
                )}

                {/* AI feedback on submission */}
                {quizSubmitted && gradeResult && (
                  <div 
                    style={{ 
                      padding: "12px", 
                      borderRadius: "6px", 
                      backgroundColor: "var(--bg-primary)", 
                      borderLeft: "3px solid", 
                      borderLeftColor: gradeResult.score >= 70 ? "var(--success-color)" : "var(--danger-color)",
                      fontSize: "0.85rem",
                      lineHeight: "1.4"
                    }}
                  >
                    <div><strong>AI Feedback:</strong> {gradeResult.feedback}</div>
                    {q.type === 'short-answer' && (
                      <div style={{ marginTop: "6px", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                        <strong>Reference Answer:</strong> <MathText as="span">{q.correctAnswer}</MathText>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Quiz submissions controls */}
          {!quizSubmitted ? (
            <button className="notion-btn" onClick={handleQuizSubmit} style={{ alignSelf: "center", padding: "12px 32px" }}>
              Submit Quiz
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center", marginTop: "12px", border: "1px solid var(--border-color)", padding: "20px", borderRadius: "10px", backgroundColor: "var(--accent-light)" }}>
              <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>Quiz Grade: {quizFinalScore}%</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="notion-btn" onClick={() => setCurrentNav({ page: 'dashboard' })}>
                  Dashboard
                </button>
                <button className="notion-btn secondary" onClick={() => loadDeckAndCards(currentNav.deckId!)}>
                  Retake Quiz
                </button>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  // RENDER FLASHCARD MODE
  const currentCard = cards[currentIndex];
  const selectedPersona = availablePersonalities.find(persona => persona.id === selectedPersonaId);

  return (
    <>
      {errorBanner && (
        <StatusBanner
          message={errorBanner}
          variant="error"
          onDismiss={() => setErrorBanner(null)}
        />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <span className="page-emoji">🧠</span>
          <h1 className="page-title">{revisionMode === 'teach' ? 'Teach the AI' : 'Reviewing'}: {deck?.name}</h1>
          <p className="sub-description">
            {revisionMode === 'teach'
              ? `Explain the card to ${selectedPersona?.name || 'your chosen persona'} and let the AI evaluate your understanding.`
              : `Card ${currentIndex + 1} of ${cards.length} (${cards.length - currentIndex} remaining)`}
          </p>
        </div>
        <button className="notion-btn secondary" onClick={() => setCurrentNav({ page: 'dashboard' })}>
          Exit Session
        </button>
      </div>

      <div className="divider" />

      <div className="revision-container">
        
        {/* Flipping card component */}
        <div 
          className={`flashcard-wrapper ${isFlipped ? 'flipped' : ''}`}
          onClick={() => setIsFlipped(!isFlipped)}
        >
          <div className="flashcard-inner">
            
            {/* Front card face */}
            <div className="flashcard-face front">
              <span className="flashcard-side-label">Front (Question)</span>
              {currentCard.tags && (
                <span className="flashcard-tags-badge">{currentCard.tags.split(',')[0]}</span>
              )}
              
              {/* Front Image rendering */}
              {(currentCard.front_image_url || currentCard.image_url) && (
                <div style={{ margin: "10px 0", textAlign: "center", width: "100%" }}>
                  <img
                    src={currentCard.front_image_url || currentCard.image_url!}
                    alt="Front Card Image"
                    style={{ maxWidth: "100%", maxHeight: "240px", objectFit: "contain", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "#fff" }}
                  />
                </div>
              )}

              {currentCard.front && currentCard.front !== "(Image)" && (
                <MathText className="flashcard-text">{currentCard.front}</MathText>
              )}

              <div style={{ position: "absolute", bottom: "16px", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                Click card to flip manually
              </div>
            </div>

            {/* Back card face */}
            <div className="flashcard-face back">
              <span className="flashcard-side-label">Back (Reference Answer)</span>
              
              {/* Back Image rendering */}
              {currentCard.back_image_url && (
                <div style={{ margin: "10px 0", textAlign: "center", width: "100%" }}>
                  <img
                    src={currentCard.back_image_url}
                    alt="Back Card Image"
                    style={{ maxWidth: "100%", maxHeight: "240px", objectFit: "contain", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "#fff" }}
                  />
                </div>
              )}

              {currentCard.back && currentCard.back !== "(Image)" && (
                <MathText className="flashcard-text">{currentCard.back}</MathText>
              )}
            </div>

          </div>
        </div>

        {/* User response actions block */}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "16px" }}>
          
          {/* AI Validation Form (User types answer first) */}
          {revisionMode !== 'teach' && !aiValidation && (
            <div 
              style={{ 
                border: "1px solid var(--border-color)", 
                borderRadius: "8px", 
                padding: "16px", 
                backgroundColor: "var(--bg-secondary)",
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)" }}>
                  AI Active Recall Validation
                </span>
              </div>
              <textarea
                className="notion-input"
                rows={4}
                value={userTypedAnswer}
                onChange={(e) => setUserTypedAnswer(e.target.value)}
                placeholder="Type your explanation or definition..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleValidateTypedAnswer();
                  }
                }}
              />
              <button 
                className="notion-btn" 
                onClick={handleValidateTypedAnswer}
                disabled={validatingAnswer || !userTypedAnswer.trim()}
                style={{ alignSelf: "flex-start", fontSize: "0.82rem", padding: "6px 12px" }}
              >
                {validatingAnswer ? (
                  <>
                    <Loader2 size={12} className="animate-spin" style={{ animation: "spin 1s linear infinite" }} />
                    AI is grading...
                  </>
                ) : (
                  <>
                    <Sparkles size={12} />
                    Submit & Grade with AI
                  </>
                )}
              </button>
            </div>
          )}

          {revisionMode === 'teach' && (
            <div style={{ border: "1px solid var(--border-color)", borderRadius: "8px", padding: "16px", backgroundColor: "var(--bg-secondary)", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)" }}>
                  Chat with your AI tutor
                </span>
                <select
                  className="notion-input"
                  value={selectedPersonaId}
                  onChange={(e) => setSelectedPersonaId(e.target.value)}
                  style={{ maxWidth: "220px", padding: "6px 10px", fontSize: "0.82rem" }}
                >
                  {availablePersonalities.map(persona => (
                    <option key={persona.id} value={persona.id}>{persona.name}</option>
                  ))}
                </select>
              </div>

              {selectedPersona && (
                <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  You are speaking to <strong>{selectedPersona.name}</strong>: {selectedPersona.description}
                </div>
              )}

              <div ref={teachChatRef} style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "260px", overflowY: "auto", paddingRight: "4px" }}>
                {teachConversation.map((message, index) => (
                  <div key={`${message.role}-${index}`} style={{ alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: "90%" }}>
                    <div style={{
                      padding: "10px 12px",
                      borderRadius: "12px",
                      backgroundColor: message.role === 'user' ? "var(--accent-color)" : "var(--bg-primary)",
                      color: message.role === 'user' ? "white" : "var(--text-primary)",
                      border: message.role === 'assistant' ? "1px solid var(--border-color)" : "none",
                      whiteSpace: "pre-wrap",
                      fontSize: "0.9rem",
                      lineHeight: 1.4
                    }}>
                      {message.content}
                    </div>
                    {message.role === 'assistant' && typeof message.score === 'number' && (
                      <div style={{ marginTop: "4px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        Persona score: {message.score}%
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <textarea
                className="notion-input"
                rows={3}
                value={userTypedAnswer}
                onChange={(e) => setUserTypedAnswer(e.target.value)}
                placeholder={`Answer ${selectedPersona?.name || 'the persona'} and let them challenge you...`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleValidateTypedAnswer();
                  }
                }}
              />
              <button
                className="notion-btn"
                onClick={handleValidateTypedAnswer}
                disabled={teachIsSubmitting || !userTypedAnswer.trim()}
                style={{ alignSelf: "flex-start", fontSize: "0.82rem", padding: "6px 12px" }}
              >
                {teachIsSubmitting ? (
                  <>
                    <Loader2 size={12} className="animate-spin" style={{ animation: "spin 1s linear infinite" }} />
                    Persona is thinking...
                  </>
                ) : (
                  <>
                    <Sparkles size={12} />
                    Send reply
                  </>
                )}
              </button>
            </div>
          )}

          {/* AI Validation results */}
          {aiValidation && (
            <div 
              style={{ 
                border: "1px solid var(--border-strong)", 
                borderRadius: "8px", 
                padding: "16px", 
                backgroundColor: "var(--accent-light)",
                display: "flex",
                flexDirection: "column",
                gap: "12px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 700 }}>AI Grading Score: {aiValidation.score}%</span>
                <span 
                  style={{ 
                    fontSize: "0.75rem", 
                    fontWeight: 700, 
                    color: aiValidation.score >= 70 ? "var(--success-color)" : aiValidation.score >= 40 ? "var(--warning-color)" : "var(--danger-color)"
                  }}
                >
                  {aiValidation.score >= 90 ? "Excellent Recall" : aiValidation.score >= 70 ? "Good Recall" : aiValidation.score >= 40 ? "Close Answer" : "Needs Review"}
                </span>
              </div>
              <p style={{ fontSize: "0.88rem", lineHeight: "1.4", margin: 0 }}>
                {aiValidation.feedback}
              </p>
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="notion-btn" style={{ padding: "6px 12px", fontSize: "0.82rem" }} onClick={handleAcceptAIValidation}>
                  Accept AI Grade & Next
                </button>
                <button className="notion-btn secondary" style={{ padding: "6px 12px", fontSize: "0.82rem" }} onClick={() => setAiValidation(null)}>
                  Change Answer
                </button>
              </div>
            </div>
          )}

          {/* Manual self-grading triggers */}
          <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "16px" }}>
            <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "8px" }}>
              Spaced Repetition Self-Grading
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
              <button 
                className="notion-btn secondary" 
                style={{ color: "var(--danger-color)", fontSize: "0.82rem" }} 
                onClick={() => handleCardGrade(Rating.Again)}
              >
                Again
              </button>
              <button 
                className="notion-btn secondary" 
                style={{ color: "var(--warning-color)", fontSize: "0.82rem" }} 
                onClick={() => handleCardGrade(Rating.Hard)}
              >
                Hard
              </button>
              <button 
                className="notion-btn secondary" 
                style={{ color: "var(--accent-color)", fontSize: "0.82rem" }} 
                onClick={() => handleCardGrade(Rating.Good)}
              >
                Good
              </button>
              <button 
                className="notion-btn secondary" 
                style={{ color: "var(--success-color)", fontSize: "0.82rem" }} 
                onClick={() => handleCardGrade(Rating.Easy)}
              >
                Easy
              </button>
            </div>
          </div>

        </div>

      </div>
    </>
  );
}
