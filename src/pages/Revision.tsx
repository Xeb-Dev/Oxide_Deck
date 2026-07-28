import { useEffect, useRef, useState } from "react";
import {
  getFlashcards, getDueFlashcards, reviewFlashcard, addRevisionHistory,
  getTestsBySubject, saveTestAnalysis, getTestQuestions, getFolders, Flashcard, Deck, getDecks, Test
} from "../services/db";
import { Rating, scoreToRating } from "../services/fsrs";
import {
  validateFlashcardAnswer, runTeachingDialogue, generateQuizFromFlashcards, QuizQuestion, ValidationResult,
  getLearningPersonalities, LearningPersonality, generateVariableVariationTest, generateFlashcardMimicMock,
  analyzeTestWithAI, FullTestAnalysisResult, GeneratedMockQuestion
} from "../services/llm";
import { 
  Sparkles, RotateCcw, AlertCircle, Loader2, Award, Clock, CheckCircle2, Play
} from "lucide-react";
import MathText from "../components/MathText";
import StatusBanner from "../components/StatusBanner";

interface RevisionProps {
  currentNav: {
    page: 'dashboard' | 'folders' | 'create' | 'revision' | 'settings' | 'tests' | 'scores' | 'mock';
    deckId?: string;
    revisionMode?: 'flashcard' | 'quiz' | 'teach' | 'mock';
  };
  setCurrentNav: (nav: any) => void;
}

export default function Revision({ currentNav, setCurrentNav }: RevisionProps) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [revisionMode, setRevisionMode] = useState<'flashcard' | 'quiz' | 'teach' | 'mock'>('flashcard');

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

  // Mock Mode States
  const [mockOption, setMockOption] = useState<'retake' | 'variation' | 'flashcard_mimic'>('retake');
  const [subjectTests, setSubjectTests] = useState<Test[]>([]);
  const [selectedMockTestId, setSelectedMockTestId] = useState<string>('');
  const [mockTopicFocus, setMockTopicFocus] = useState<string>('');
  const [mockTimerMinutes, setMockTimerMinutes] = useState<number>(60);
  const [mockQuestions, setMockQuestions] = useState<GeneratedMockQuestion[]>([]);
  const [mockUserAnswers, setMockUserAnswers] = useState<string[]>([]);
  const [mockMathWork, setMockMathWork] = useState<string[]>([]);
  const [mockTimeRemainingSeconds, setMockTimeRemainingSeconds] = useState<number | null>(null);
  const [mockTimerActive, setMockTimerActive] = useState<boolean>(false);
  const [mockSubmitted, setMockSubmitted] = useState<boolean>(false);
  const [mockSubmitting, setMockSubmitting] = useState<boolean>(false);
  const [mockGenerating, setMockGenerating] = useState<boolean>(false);
  const [mockExamTitle, setMockExamTitle] = useState<string>('Mock Exam');
  const [mockAnalysisResult, setMockAnalysisResult] = useState<FullTestAnalysisResult | null>(null);

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

  useEffect(() => {
    if (!mockTimerActive || mockTimeRemainingSeconds === null) return;
    if (mockTimeRemainingSeconds <= 0) {
      setMockTimerActive(false);
      alert("⏰ Time is up! Submitting your exam now.");
      handleSubmitMockExam();
      return;
    }
    const interval = setInterval(() => {
      setMockTimeRemainingSeconds((prev) => (prev != null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [mockTimerActive, mockTimeRemainingSeconds]);

  const loadDeckAndCards = async (deckId: string) => {
    try {
      setLoading(true);
      setErrorBanner(null);
      const decks = await getDecks();
      const targetDeck = decks.find(x => x.id === deckId);
      if (targetDeck) {
        setDeck(targetDeck);
        const folders = await getFolders();
        const targetFolder = folders.find((f) => f.id === targetDeck.folder_id);
        if (targetFolder?.subject_id) {
          const sTests = await getTestsBySubject(targetFolder.subject_id);
          setSubjectTests(sTests);
          if (sTests.length > 0) {
            setSelectedMockTestId(sTests[0].id);
            if (sTests[0].time_limit_minutes) setMockTimerMinutes(sTests[0].time_limit_minutes);
          }
        }
        setMockTopicFocus(targetDeck.name);
      }

      const mode = currentNav.revisionMode || 'flashcard';
      setRevisionMode(mode);

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

  const handleStartMockExam = async () => {
    setMockGenerating(true);
    setErrorBanner(null);
    try {
      let title = "Mock Exam";
      let questionsToUse: GeneratedMockQuestion[] = [];

      if (mockOption === "retake") {
        const targetTest = subjectTests.find((t) => t.id === selectedMockTestId) || subjectTests[0];
        if (!targetTest) throw new Error("No saved test paper found in this subject to retake. Create or scan a test first, or choose Flashcard AI Mock.");
        title = `Retake: ${targetTest.name}`;
        const qs = await getTestQuestions(targetTest.id);
        questionsToUse = qs.map((q) => ({
          type: q.type,
          question: q.question,
          options: q.options || undefined,
          correctAnswer: q.correct_answer || '',
        }));
      } else if (mockOption === "variation") {
        const targetTest = subjectTests.find((t) => t.id === selectedMockTestId) || subjectTests[0];
        if (!targetTest) throw new Error("No saved test paper found in this subject for variable variation. Create or scan a test first, or choose Flashcard AI Mock.");
        const qs = await getTestQuestions(targetTest.id);
        const subjectName = deck ? deck.name : "Subject";
        const generated = await generateVariableVariationTest(targetTest.name, subjectName, qs.map((q) => ({
          type: q.type,
          question: q.question,
          options: q.options,
          correctAnswer: q.correct_answer,
        })), mockTopicFocus);
        title = generated.title;
        questionsToUse = generated.questions;
      } else {
        // Flashcard Mimic
        const subjectName = deck ? deck.name : "Subject";
        let exemplarQuestions: { type: string; question: string }[] = [];
        if (subjectTests.length > 0) {
          const sampleQs = await getTestQuestions(subjectTests[0].id);
          exemplarQuestions = sampleQs.map((q) => ({ type: q.type, question: q.question }));
        }
        const generated = await generateFlashcardMimicMock(
          subjectName,
          mockTopicFocus || deck?.name || "Topic Focus",
          cards.map((c) => ({ front: c.front, back: c.back })),
          exemplarQuestions
        );
        title = generated.title;
        questionsToUse = generated.questions;
      }

      setMockExamTitle(title);
      setMockQuestions(questionsToUse);
      setMockUserAnswers(new Array(questionsToUse.length).fill(""));
      setMockMathWork(new Array(questionsToUse.length).fill(""));
      setMockSubmitted(false);
      setMockAnalysisResult(null);

      // Start Countdown Timer
      const totalSecs = (mockTimerMinutes || 60) * 60;
      setMockTimeRemainingSeconds(totalSecs);
      setMockTimerActive(true);
    } catch (e: any) {
      console.error(e);
      setErrorBanner(e?.message || "Failed to launch Mock Exam.");
    } finally {
      setMockGenerating(false);
    }
  };

  const handleSubmitMockExam = async () => {
    if (mockSubmitting || mockSubmitted) return;
    setMockSubmitting(true);
    setMockTimerActive(false);
    try {
      const subjectName = deck ? deck.name : "Subject";
      const folders = await getFolders();
      const targetFolder = deck ? folders.find((f) => f.id === deck.folder_id) : null;
      const subjectId = targetFolder?.subject_id || "";

      const analysisResult = await analyzeTestWithAI(
        mockExamTitle,
        subjectName,
        mockQuestions.map((q, idx) => ({
          type: q.type,
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          userAnswer: mockUserAnswers[idx] || "",
          mathWork: mockMathWork[idx] || "",
        }))
      );

      if (subjectId) {
        const tempTestId = `mock_${Date.now()}`;
        await saveTestAnalysis(
          tempTestId,
          subjectId,
          analysisResult.summary,
          analysisResult.strengths,
          analysisResult.weaknesses,
          analysisResult.recommendations,
          analysisResult.errors
        );
      }

      const scorePct = analysisResult.maxScore > 0
        ? Math.round((analysisResult.calculatedScore / analysisResult.maxScore) * 100)
        : 0;

      await addRevisionHistory(null, 'mock', scorePct);

      setMockAnalysisResult(analysisResult);
      setMockSubmitted(true);
    } catch (e: any) {
      console.error(e);
      setErrorBanner(e?.message || "Failed to submit and grade Mock Exam.");
    } finally {
      setMockSubmitting(false);
    }
  };

  const formatTimerDisplay = (seconds: number | null) => {
    if (seconds == null) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
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

  // RENDER MOCK EXAM MODE
  if (revisionMode === 'mock') {
    return (
      <>
        {errorBanner && (
          <StatusBanner
            message={errorBanner}
            variant="error"
            onDismiss={() => setErrorBanner(null)}
          />
        )}

        {/* SETUP SCREEN */}
        {mockQuestions.length === 0 && (
          <div style={{ maxWidth: "680px", margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: "20px" }}>
            <div>
              <span className="page-emoji">🎯</span>
              <h1 className="page-title">Mock Exam Arena: {deck?.name}</h1>
              <p className="sub-description">
                Practice under timed exam conditions with retakes, mutated variable test papers, or AI mock exams based on your flashcards.
              </p>
            </div>

            <div className="divider" />

            {/* Mode Option Selection */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Select Mock Exam Generation Mode:
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                <div
                  onClick={() => setMockOption('retake')}
                  style={{
                    padding: "14px",
                    border: mockOption === 'retake' ? "2px solid var(--accent-color)" : "1px solid var(--border-color)",
                    backgroundColor: mockOption === 'retake' ? "var(--accent-light)" : "var(--bg-secondary)",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                    🔄 Retake Past Test
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
                    Retake an existing exam paper in this subject under timed conditions.
                  </div>
                </div>

                <div
                  onClick={() => setMockOption('variation')}
                  style={{
                    padding: "14px",
                    border: mockOption === 'variation' ? "2px solid var(--accent-color)" : "1px solid var(--border-color)",
                    backgroundColor: mockOption === 'variation' ? "var(--accent-light)" : "var(--bg-secondary)",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                    🎲 Variable Variation
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
                    AI mutates numbers, parameters & variables of a past test paper.
                  </div>
                </div>

                <div
                  onClick={() => setMockOption('flashcard_mimic')}
                  style={{
                    padding: "14px",
                    border: mockOption === 'flashcard_mimic' ? "2px solid var(--accent-color)" : "1px solid var(--border-color)",
                    backgroundColor: mockOption === 'flashcard_mimic' ? "var(--accent-light)" : "var(--bg-secondary)",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                    ✨ Flashcard AI Mock
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
                    AI builds a mock test from deck flashcards, mimicking past test formats.
                  </div>
                </div>
              </div>
            </div>

            {/* Select past test dropdown if retake or variation */}
            {(mockOption === 'retake' || mockOption === 'variation') && (
              <label className="form-label">
                Select Past Test Paper:
                {subjectTests.length === 0 ? (
                  <div style={{ fontSize: "0.82rem", color: "#e11d48", marginTop: "4px" }}>
                    No saved tests found in this subject. Scan or create a test paper in the Tests tab first, or switch to <strong>Flashcard AI Mock</strong> above!
                  </div>
                ) : (
                  <select
                    className="notion-input"
                    value={selectedMockTestId}
                    onChange={(e) => {
                      setSelectedMockTestId(e.target.value);
                      const selectedT = subjectTests.find(t => t.id === e.target.value);
                      if (selectedT?.time_limit_minutes) setMockTimerMinutes(selectedT.time_limit_minutes);
                    }}
                    style={{ marginTop: "6px", width: "100%" }}
                  >
                    {subjectTests.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.time_limit_minutes ? `${t.time_limit_minutes} mins` : 'No timer set'})
                      </option>
                    ))}
                  </select>
                )}
              </label>
            )}

            {/* Topic Focus Input */}
            <label className="form-label">
              Topic / Concept Focus (Optional):
              <input
                className="form-input"
                type="text"
                value={mockTopicFocus}
                onChange={(e) => setMockTopicFocus(e.target.value)}
                placeholder="e.g. Differentiation & Integration, Thermodynamics..."
                style={{ marginTop: "6px" }}
              />
            </label>

            {/* Timer Minutes Input */}
            <label className="form-label">
              Allocated Exam Timer (Minutes):
              <input
                className="form-input"
                type="number"
                value={mockTimerMinutes}
                onChange={(e) => setMockTimerMinutes(Number(e.target.value) || 30)}
                placeholder="60"
                style={{ marginTop: "6px" }}
              />
            </label>

            <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
              <button className="notion-btn secondary" onClick={() => setCurrentNav({ page: "dashboard" })}>
                Cancel
              </button>
              <button
                className="notion-btn primary"
                onClick={handleStartMockExam}
                disabled={mockGenerating || (mockOption !== 'flashcard_mimic' && subjectTests.length === 0)}
                style={{ flex: 1, padding: "10px 16px" }}
              >
                {mockGenerating ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Play size={16} />}
                {mockGenerating ? "Generating Timed Mock Exam..." : "Start Timed Mock Exam"}
              </button>
            </div>
          </div>
        )}

        {/* ACTIVE EXAM INTERFACE */}
        {mockQuestions.length > 0 && !mockSubmitted && (
          <div style={{ maxWidth: "800px", margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Sticky Header with Timer */}
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 100,
                backgroundColor: "var(--bg-primary)",
                padding: "14px 18px",
                borderRadius: "10px",
                border: "1px solid var(--border-color)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--text-primary)" }}>
                  {mockExamTitle}
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  {mockQuestions.length} Questions · Timed Examination
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                {/* Timer Badge */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "0.95rem",
                    fontWeight: 800,
                    padding: "6px 14px",
                    borderRadius: "20px",
                    backgroundColor: (mockTimeRemainingSeconds != null && mockTimeRemainingSeconds < 300) ? "rgba(225, 29, 72, 0.1)" : "var(--bg-secondary)",
                    color: (mockTimeRemainingSeconds != null && mockTimeRemainingSeconds < 300) ? "#e11d48" : "var(--accent-color)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <Clock size={16} />
                  <span>{formatTimerDisplay(mockTimeRemainingSeconds)}</span>
                </div>

                <button
                  className="notion-btn primary"
                  onClick={handleSubmitMockExam}
                  disabled={mockSubmitting}
                >
                  {mockSubmitting ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={14} />}
                  Submit Exam
                </button>
              </div>
            </div>

            {/* Questions Paper */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {mockQuestions.map((q, idx) => (
                <div key={idx} className="quiz-card" style={{ padding: "18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-color)", textTransform: "uppercase" }}>
                      Question {idx + 1} of {mockQuestions.length} ({q.type})
                    </span>
                  </div>

                  <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text-primary)", marginBottom: "12px" }}>
                    <MathText>{q.question}</MathText>
                  </div>

                  {/* Multiple Choice Options */}
                  {q.type === 'multiple-choice' && q.options && q.options.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                      {q.options.map((opt, optIdx) => (
                        <label
                          key={optIdx}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "8px 12px",
                            backgroundColor: mockUserAnswers[idx] === opt ? "var(--accent-light)" : "var(--bg-secondary)",
                            border: "1px solid var(--border-color)",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "0.88rem",
                          }}
                        >
                          <input
                            type="radio"
                            name={`mock-q-${idx}`}
                            checked={mockUserAnswers[idx] === opt}
                            onChange={() => {
                              const updated = [...mockUserAnswers];
                              updated[idx] = opt;
                              setMockUserAnswers(updated);
                            }}
                          />
                          <MathText>{opt}</MathText>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Short / Long Answer Input */}
                  {q.type !== 'multiple-choice' && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
                      <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                        Your Answer:
                      </label>
                      <textarea
                        className="form-input"
                        rows={2}
                        value={mockUserAnswers[idx]}
                        onChange={(e) => {
                          const updated = [...mockUserAnswers];
                          updated[idx] = e.target.value;
                          setMockUserAnswers(updated);
                        }}
                        placeholder="Write your answer here..."
                      />

                      {/* Math Work / Steps Shown for Maths Questions */}
                      {q.type === 'maths' && (
                        <div style={{ marginTop: "6px" }}>
                          <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--accent-color)" }}>
                            🔢 Math Working Out / Derivation (Optional):
                          </label>
                          <textarea
                            className="form-input"
                            rows={3}
                            value={mockMathWork[idx]}
                            onChange={(e) => {
                              const updated = [...mockMathWork];
                              updated[idx] = e.target.value;
                              setMockMathWork(updated);
                            }}
                            placeholder="Show step-by-step mathematical working out..."
                            style={{ marginTop: "4px" }}
                          />
                          {mockMathWork[idx].trim() !== "" && (
                            <div style={{ marginTop: "6px", padding: "8px", backgroundColor: "var(--bg-secondary)", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "2px" }}>Math Preview:</div>
                              <MathText>{mockMathWork[idx]}</MathText>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
              <button
                className="notion-btn primary"
                onClick={handleSubmitMockExam}
                disabled={mockSubmitting}
                style={{ padding: "10px 24px", fontSize: "0.95rem" }}
              >
                {mockSubmitting ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={16} />}
                Submit & Grade Mock Exam
              </button>
            </div>
          </div>
        )}

        {/* POST-EXAM RESULTS SCREEN */}
        {mockSubmitted && mockAnalysisResult && (
          <div style={{ maxWidth: "800px", margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ border: "1px solid var(--border-color)", borderRadius: "12px", padding: "24px", backgroundColor: "var(--bg-secondary)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div>
                  <span className="page-emoji">🎉</span>
                  <h1 className="page-title" style={{ margin: 0 }}>Mock Exam Complete!</h1>
                  <p className="sub-description" style={{ margin: 0, marginTop: "4px" }}>
                    {mockExamTitle}
                  </p>
                </div>

                <div style={{ padding: "8px 16px", borderRadius: "20px", backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-color)", fontWeight: 800, fontSize: "1.2rem", color: "var(--accent-color)" }}>
                  {mockAnalysisResult.calculatedScore} / {mockAnalysisResult.maxScore} ({Math.round((mockAnalysisResult.calculatedScore / (mockAnalysisResult.maxScore || 100)) * 100)}%)
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Summary */}
                <div style={{ padding: "14px", backgroundColor: "var(--bg-primary)", borderRadius: "8px", borderLeft: "4px solid var(--accent-color)" }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-color)", textTransform: "uppercase" }}>
                    Diagnostic Performance Overview
                  </div>
                  <div style={{ fontSize: "0.9rem", color: "var(--text-primary)", marginTop: "4px", lineHeight: 1.6 }}>
                    {mockAnalysisResult.summary}
                  </div>
                </div>

                {/* Strengths & Weaknesses */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  {mockAnalysisResult.strengths && (
                    <div style={{ padding: "14px", backgroundColor: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "8px" }}>
                      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--success-color)", marginBottom: "4px" }}>
                        💪 Concepts Mastered
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                        {mockAnalysisResult.strengths}
                      </div>
                    </div>
                  )}

                  {mockAnalysisResult.weaknesses && (
                    <div style={{ padding: "14px", backgroundColor: "rgba(139, 92, 246, 0.06)", border: "1px solid rgba(139, 92, 246, 0.2)", borderRadius: "8px" }}>
                      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#8b5cf6", marginBottom: "4px" }}>
                        🎯 Study Focus Points
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                        {mockAnalysisResult.weaknesses}
                      </div>
                    </div>
                  )}
                </div>

                {/* Recommendations */}
                {mockAnalysisResult.recommendations && (
                  <div style={{ padding: "14px", backgroundColor: "var(--bg-primary)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px" }}>
                      📌 Study Advice & Next Steps
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                      {mockAnalysisResult.recommendations}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button
                  className="notion-btn secondary"
                  onClick={() => {
                    setMockQuestions([]);
                    setMockSubmitted(false);
                  }}
                >
                  Take Another Mock
                </button>
                <button
                  className="notion-btn primary"
                  onClick={() => setCurrentNav({ page: "scores" })}
                >
                  View Scores & Analytics Tab
                </button>
              </div>
            </div>
          </div>
        )}
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
              <MathText className="flashcard-text">{currentCard.front}</MathText>
              <div style={{ position: "absolute", bottom: "16px", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                Click card to flip manually
              </div>
            </div>

            {/* Back card face */}
            <div className="flashcard-face back">
              <span className="flashcard-side-label">Back (Reference Answer)</span>
              <MathText className="flashcard-text">{currentCard.back}</MathText>
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
