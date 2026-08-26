import { useEffect, useState } from "react";
import {
  getStats,
  getDueFlashcards,
  getCardStateStats,
  getTests,
  getTestErrors,
  Stats,
  CardStateStats,
} from "../services/db";
import { checkAndTriggerStudyReminders } from "../services/notificationService";
import {
  Sparkles,
  Flame,
  Play,
  Zap,
  Bot,
  CheckCircle2,
  Clock,
  TrendingUp,
  Brain,
  Target,
  ArrowRight,
  Plus,
  FileText,
  BookOpen,
  ChevronRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface DashboardProps {
  setCurrentNav: (nav: any) => void;
}

export default function Dashboard({ setCurrentNav }: DashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [dueDecks, setDueDecks] = useState<
    { id: string; name: string; icon: string; count: number }[]
  >([]);
  const [totalDueCount, setTotalDueCount] = useState(0);
  const [cardStates, setCardStates] = useState<CardStateStats>({
    newCount: 0,
    learningCount: 0,
    reviewCount: 0,
    relearningCount: 0,
    totalCount: 0,
  });
  const [errorCount, setErrorCount] = useState(0);
  const [avgTestScore, setAvgTestScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      const [s, dueCards, stateStats, testList, errorList] = await Promise.all([
        getStats(),
        getDueFlashcards(),
        getCardStateStats(),
        getTests(),
        getTestErrors("all"),
      ]);

      setStats(s);
      setTotalDueCount(dueCards.length);
      setCardStates(stateStats);
      setErrorCount(errorList.length);

      // Scored tests average
      const scoredTests = testList.filter(
        (t) => t.score !== null && t.max_score > 0
      );
      if (scoredTests.length > 0) {
        const avg = Math.round(
          scoredTests.reduce(
            (acc, t) => acc + ((t.score ?? 0) / t.max_score) * 100,
            0
          ) / scoredTests.length
        );
        setAvgTestScore(avg);
      } else {
        setAvgTestScore(null);
      }

      // Aggregate due flashcards by deck
      const deckMap: Record<
        string,
        { name: string; icon: string; count: number }
      > = {};

      dueCards.forEach((card) => {
        if (!deckMap[card.deck_id]) {
          deckMap[card.deck_id] = {
            name: card.deck_name,
            icon: "🎴",
            count: 0,
          };
        }
        deckMap[card.deck_id].count++;
      });

      const aggregatedDecks = Object.entries(deckMap).map(([id, info]) => ({
        id,
        name: info.name,
        icon: info.icon,
        count: info.count,
      }));

      // Sort by highest count of due cards first
      aggregatedDecks.sort((a, b) => b.count - a.count);
      setDueDecks(aggregatedDecks);

      // Trigger Spaced Repetition study reminder checks
      checkAndTriggerStudyReminders(
        dueCards.length,
        s.cardsReviewedToday || 0
      ).catch(console.error);
    } catch (e) {
      console.error("Failed to load dashboard data:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleStartRevision = (
    deckId: string,
    mode: "flashcard" | "quiz" | "teach"
  ) => {
    setCurrentNav({
      page: "revision",
      deckId,
      revisionMode: mode,
    });
  };

  // Helper for greeting based on current hour
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const formattedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const estStudyMinutes = Math.max(
    1,
    Math.round((totalDueCount * 20) / 60)
  );

  const goalTarget = stats?.streakTargetToday || 1;
  const goalProgress = stats?.streakProgressToday || 0;
  const goalPct = Math.min(
    100,
    Math.round((goalProgress / Math.max(goalTarget, 1)) * 100)
  );

  // Day of week index (0=Sun, 1=Mon, ..., 6=Sat) mapped to Mon-Sun
  const todayDayIdx = (new Date().getDay() + 6) % 7; // 0=Mon, 6=Sun

  if (loading) {
    return (
      <div className="bento-loading-container">
        <div className="bento-loading-spinner" />
        <span>Loading Dashboard...</span>
      </div>
    );
  }

  return (
    <div className="bento-dashboard-wrapper">
      {/* Header Context Bar */}
      <header className="bento-header">
        <div>
          <div className="bento-greeting-badge">
            <span className="bento-greeting-dot" />
            <span>{getGreeting()}</span>
            <span className="bento-greeting-sep">·</span>
            <span>{formattedDate}</span>
          </div>
          <h1 className="bento-page-title">Dashboard</h1>
          <p className="bento-page-subtitle">
            Active recall hub, spaced repetition analytics, and exam readiness.
          </p>
        </div>

        <div className="bento-header-actions">
          <button
            className="bento-btn bento-btn-primary"
            onClick={() => setCurrentNav({ page: "create" })}
          >
            <Plus size={15} /> Create Cards
          </button>
          <button
            className="bento-btn bento-btn-secondary"
            onClick={() => setCurrentNav({ page: "mock" })}
          >
            <FileText size={15} /> Mock Exam
          </button>
        </div>
      </header>

      {/* Main Bento Grid */}
      <div className="bento-grid">
        {/* ========================================================================= */}
        {/* 1. HERO ACTIVE RECALL MISSION (Span 8) */}
        {/* ========================================================================= */}
        <div className="bento-card bento-hero-tile">
          <div className="bento-hero-content">
            <div className="bento-hero-left">
              <div className="bento-hero-badge">
                <Sparkles size={13} /> Active Recall Queue
              </div>
              <h2 className="bento-hero-heading">
                {totalDueCount > 0 ? (
                  <>
                    <span>{totalDueCount}</span> Flashcard
                    {totalDueCount > 1 ? "s" : ""} Due Today
                  </>
                ) : (
                  <>You're All Caught Up! 🎉</>
                )}
              </h2>
              <p className="bento-hero-subtext">
                {totalDueCount > 0
                  ? `Estimated study time: ~${estStudyMinutes} min · Powered by the FSRS spaced repetition engine.`
                  : `Your review queue is completely clear. Consistency is the secret to long-term memory retention!`}
              </p>

              <div className="bento-hero-actions-row">
                {totalDueCount > 0 || dueDecks.length > 0 ? (
                  <>
                    <button
                      className="bento-btn bento-btn-hero-action"
                      onClick={() =>
                        handleStartRevision("all", "flashcard")
                      }
                    >
                      <Play size={16} fill="currentColor" /> Start Daily Review
                      {totalDueCount > 0 ? ` (${totalDueCount} Due)` : ""}
                    </button>
                    <button
                      className="bento-btn bento-btn-hero-secondary"
                      onClick={() =>
                        handleStartRevision("all", "quiz")
                      }
                      title="Generate AI Quiz from Due Cards"
                    >
                      <Zap size={14} /> Quick Quiz
                    </button>
                    <button
                      className="bento-btn bento-btn-hero-secondary"
                      onClick={() =>
                        handleStartRevision("all", "teach")
                      }
                      title="Teach Due Cards to AI"
                    >
                      <Bot size={14} /> Teach AI
                    </button>
                  </>
                ) : (
                  <button
                    className="bento-btn bento-btn-hero-action"
                    onClick={() => setCurrentNav({ page: "folders" })}
                  >
                    <BookOpen size={16} /> Explore All Decks & Folders
                  </button>
                )}
              </div>
            </div>

            {/* Daily Goal Gauge */}
            <div className="bento-hero-gauge-box">
              <div className="bento-circular-gauge">
                <svg viewBox="0 0 36 36" className="bento-gauge-svg">
                  <path
                    className="bento-gauge-bg"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="bento-gauge-fill"
                    strokeDasharray={`${goalPct}, 100`}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="bento-gauge-text">
                  <span className="bento-gauge-number">{goalPct}%</span>
                  <span className="bento-gauge-label">Daily Goal</span>
                </div>
              </div>
              <div className="bento-gauge-meta">
                {stats?.streakConditionMetToday ? (
                  <span className="bento-badge-success">
                    <CheckCircle2 size={12} /> Target Met
                  </span>
                ) : (
                  <span className="bento-badge-neutral">
                    {goalProgress}/{goalTarget} cards
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. STREAK & CONSISTENCY PULSE (Span 4) */}
        {/* ========================================================================= */}
        <div className="bento-card bento-streak-tile">
          <div className="bento-tile-header">
            <span className="bento-tile-title">Daily Streak</span>
            <div className="bento-streak-flame-icon">
              <Flame size={18} />
            </div>
          </div>

          <div className="bento-streak-hero-number">
            <span className="bento-streak-val">{stats?.streakDays || 0}</span>
            <span className="bento-streak-unit">
              day{stats?.streakDays === 1 ? "" : "s"}
            </span>
          </div>

          <div className="bento-streak-status-line">
            {stats?.streakConditionMetToday ? (
              <span className="bento-streak-msg success">
                <CheckCircle2 size={13} /> Today's streak condition met!
              </span>
            ) : (
              <span className="bento-streak-msg pending">
                <Clock size={13} /> {goalProgress}/{goalTarget} cards reviewed
                today
              </span>
            )}
          </div>

          {/* 7-Day Consistency Matrix */}
          <div className="bento-streak-week-matrix">
            {(stats?.currentWeekMatrix || [
              { dayLabel: "M", isToday: todayDayIdx === 0, isCompleted: false, count: 0, fullDate: "" },
              { dayLabel: "T", isToday: todayDayIdx === 1, isCompleted: false, count: 0, fullDate: "" },
              { dayLabel: "W", isToday: todayDayIdx === 2, isCompleted: false, count: 0, fullDate: "" },
              { dayLabel: "T", isToday: todayDayIdx === 3, isCompleted: false, count: 0, fullDate: "" },
              { dayLabel: "F", isToday: todayDayIdx === 4, isCompleted: false, count: 0, fullDate: "" },
              { dayLabel: "S", isToday: todayDayIdx === 5, isCompleted: false, count: 0, fullDate: "" },
              { dayLabel: "S", isToday: todayDayIdx === 6, isCompleted: false, count: 0, fullDate: "" },
            ]).map((item, idx) => (
              <div key={idx} className="bento-week-matrix-item">
                <div
                  className={`bento-week-bubble ${item.isCompleted ? "active" : ""
                    } ${item.isToday ? "today" : ""}`}
                  title={item.fullDate ? `${item.fullDate}: ${item.count} reviewed` : undefined}
                >
                  {item.isCompleted ? <Flame size={12} /> : null}
                </div>
                <span
                  className={`bento-week-matrix-label ${item.isToday ? "highlight" : ""
                    }`}
                >
                  {item.dayLabel}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. 7-DAY LEARNING VELOCITY & RETENTION (Span 7) */}
        {/* ========================================================================= */}
        <div className="bento-card bento-velocity-tile">
          <div className="bento-tile-header">
            <div>
              <span className="bento-tile-title">Weekly Activity & Velocity</span>
              <div className="bento-tile-sub">
                Review volume & daily recall scores
              </div>
            </div>
            <div className="bento-stat-chip">
              <TrendingUp size={14} color="var(--accent-color)" />
              <span>{stats?.cardsReviewedToday || 0} reviewed today</span>
            </div>
          </div>

          <div className="bento-recharts-box">
            {stats && stats.weeklyProgress && stats.weeklyProgress.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={stats.weeklyProgress}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border-color)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="day"
                    stroke="var(--text-secondary)"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--text-secondary)"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--bg-hover)" }}
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bento-tooltip-container">
                            <div className="bento-tooltip-header">
                              {label}
                            </div>
                            <div className="bento-tooltip-row">
                              <span>Cards Reviewed:</span>
                              <strong>{data.count}</strong>
                            </div>
                            <div className="bento-tooltip-row">
                              <span>Avg Score:</span>
                              <strong>{data.avg_score}%</strong>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--accent-color)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="bento-empty-chart">No activity data yet</div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 4. DECKS NEEDING ATTENTION (Span 5) */}
        {/* ========================================================================= */}
        <div className="bento-card bento-due-decks-tile">
          <div className="bento-tile-header">
            <div>
              <span className="bento-tile-title">Decks to Review</span>
              <div className="bento-tile-sub">
                {dueDecks.length} deck{dueDecks.length === 1 ? "" : "s"} due
              </div>
            </div>
            {dueDecks.length > 0 && (
              <span className="bento-due-pill-danger">
                {totalDueCount} cards due
              </span>
            )}
          </div>

          <div className="bento-due-deck-list">
            {dueDecks.slice(0, 4).map((deck) => (
              <div key={deck.id} className="bento-deck-row">
                <div className="bento-deck-row-left">
                  <div className="bento-deck-avatar">{deck.icon || "🎴"}</div>
                  <div className="bento-deck-text-group">
                    <div className="bento-deck-title" title={deck.name}>
                      {deck.name}
                    </div>
                    <div className="bento-deck-count-sub">
                      {deck.count} card{deck.count > 1 ? "s" : ""} ready
                    </div>
                  </div>
                </div>

                <div className="bento-deck-row-actions">
                  <button
                    className="bento-deck-action-btn primary"
                    onClick={() => handleStartRevision(deck.id, "flashcard")}
                    title="Start Flashcard Revision"
                  >
                    Cards
                  </button>
                  <button
                    className="bento-deck-action-btn"
                    onClick={() => handleStartRevision(deck.id, "quiz")}
                    title="Generate Quiz"
                  >
                    Quiz
                  </button>
                  <button
                    className="bento-deck-action-btn"
                    onClick={() => handleStartRevision(deck.id, "teach")}
                    title="Teach to AI"
                  >
                    Teach
                  </button>
                </div>
              </div>
            ))}

            {dueDecks.length > 4 && (
              <div className="bento-deck-more-row">
                <span>+{dueDecks.length - 4} more decks due</span>
                <button
                  className="bento-inline-link"
                  onClick={() => setCurrentNav({ page: "folders" })}
                >
                  View all in Folders <ChevronRight size={13} />
                </button>
              </div>
            )}

            {dueDecks.length === 0 && (
              <div className="bento-deck-empty-state">
                <span className="bento-empty-icon">✨</span>
                <div className="bento-empty-title">Zero Decks Due</div>
                <p className="bento-empty-desc">
                  Your queue is spotless. Great time to create new flashcards or
                  take a practice exam.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 5. FSRS MEMORY MATRIX (Span 6) */}
        {/* ========================================================================= */}
        <div className="bento-card bento-fsrs-tile">
          <div className="bento-tile-header">
            <span className="bento-tile-title">FSRS Memory Matrix</span>
            <Brain size={16} color="var(--accent-color)" />
          </div>

          <div className="bento-fsrs-headline">
            <span className="bento-fsrs-count-big">
              {cardStates.totalCount}
            </span>
            <span className="bento-fsrs-count-sub">Total Flashcards</span>
          </div>

          {/* Segmented color bar */}
          <div className="bento-fsrs-bar-container">
            <div
              className="bento-fsrs-segment new"
              style={{
                width: `${(cardStates.newCount / Math.max(cardStates.totalCount, 1)) *
                  100
                  }%`,
              }}
              title={`New: ${cardStates.newCount}`}
            />
            <div
              className="bento-fsrs-segment learning"
              style={{
                width: `${(cardStates.learningCount /
                  Math.max(cardStates.totalCount, 1)) *
                  100
                  }%`,
              }}
              title={`Learning: ${cardStates.learningCount}`}
            />
            <div
              className="bento-fsrs-segment review"
              style={{
                width: `${(cardStates.reviewCount /
                  Math.max(cardStates.totalCount, 1)) *
                  100
                  }%`,
              }}
              title={`Mature: ${cardStates.reviewCount}`}
            />
            <div
              className="bento-fsrs-segment relearning"
              style={{
                width: `${(cardStates.relearningCount /
                  Math.max(cardStates.totalCount, 1)) *
                  100
                  }%`,
              }}
              title={`Relearning: ${cardStates.relearningCount}`}
            />
          </div>

          {/* 2x2 Legend Grid */}
          <div className="bento-fsrs-legend-grid">
            <div className="bento-legend-item">
              <span className="bento-legend-dot new" />
              <span className="bento-legend-name">New</span>
              <span className="bento-legend-value">{cardStates.newCount}</span>
            </div>
            <div className="bento-legend-item">
              <span className="bento-legend-dot learning" />
              <span className="bento-legend-name">Learning</span>
              <span className="bento-legend-value">
                {cardStates.learningCount}
              </span>
            </div>
            <div className="bento-legend-item">
              <span className="bento-legend-dot review" />
              <span className="bento-legend-name">Mature</span>
              <span className="bento-legend-value">{cardStates.reviewCount}</span>
            </div>
            <div className="bento-legend-item">
              <span className="bento-legend-dot relearning" />
              <span className="bento-legend-name">Relearning</span>
              <span className="bento-legend-value">
                {cardStates.relearningCount}
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 6. EXAM READINESS & WEAK SPOTS (Span 6) */}
        {/* ========================================================================= */}
        <div className="bento-card bento-diagnostics-tile">
          <div className="bento-tile-header">
            <span className="bento-tile-title">Exam & Test Diagnostics</span>
            <Target size={16} color="var(--warning-color)" />
          </div>

          <div className="bento-diagnostics-metrics-row">
            <div className="bento-diag-metric-box">
              <span className="bento-diag-label">Average Score</span>
              <span className="bento-diag-number">
                {avgTestScore !== null ? `${avgTestScore}%` : "—"}
              </span>
            </div>
            <div className="bento-diag-metric-box">
              <span className="bento-diag-label">Flagged Errors</span>
              <span
                className={`bento-diag-number ${errorCount > 0 ? "danger-text" : ""
                  }`}
              >
                {errorCount}
              </span>
            </div>
          </div>

          <div className="bento-diagnostics-footer">
            <p className="bento-diag-hint">
              {errorCount > 0
                ? `${errorCount} question error${errorCount > 1 ? "s" : ""
                } flagged for remediation.`
                : `No unresolved errors from recent exams.`}
            </p>
            <button
              className="bento-diag-link-btn"
              onClick={() => setCurrentNav({ page: "scores" })}
            >
              <span>View Error Analytics</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

