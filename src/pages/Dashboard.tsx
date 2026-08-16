import { useEffect, useState } from "react";
import { getStats, getDueFlashcards, Stats } from "../services/db";
import { checkAndTriggerStudyReminders } from "../services/notificationService";
import { Sparkles, Calendar, BookOpen, Flame, Award } from "lucide-react";

interface DashboardProps {
  setCurrentNav: (nav: any) => void;
}

export default function Dashboard({ setCurrentNav }: DashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [dueDecks, setDueDecks] = useState<{ id: string; name: string; icon: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      // Fetch stats
      const s = await getStats();
      setStats(s);

      // Fetch due flashcards to aggregate them by deck
      const dueCards = await getDueFlashcards();
      const deckMap: Record<string, { name: string; icon: string; count: number }> = {};
      
      dueCards.forEach(card => {
        if (!deckMap[card.deck_id]) {
          deckMap[card.deck_id] = {
            name: card.deck_name,
            icon: "🎴", // standard fallback
            count: 0
          };
        }
        deckMap[card.deck_id].count++;
      });

      const aggregatedDecks = Object.entries(deckMap).map(([id, info]) => ({
        id,
        name: info.name,
        icon: info.icon,
        count: info.count
      }));

      setDueDecks(aggregatedDecks);

      // Trigger 1A Spaced Repetition / Study Notifications check
      checkAndTriggerStudyReminders(dueCards.length, s.cardsReviewedToday || 0).catch(console.error);
    } catch (e) {
      console.error("Failed to load dashboard data:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleStartRevision = (deckId: string, mode: 'flashcard' | 'quiz' | 'teach') => {
    setCurrentNav({
      page: 'revision',
      deckId,
      revisionMode: mode
    });
  };

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>Loading dashboard stats...</div>;
  }

  const maxWeeklyCount = stats ? Math.max(...stats.weeklyProgress.map(w => w.count), 1) : 1;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div className="page-emoji">🚀</div>
        <h1 className="page-title">Welcome back</h1>
        <p className="sub-description">
          Track your progress, manage your folders, and start active recall revisions.
        </p>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="stats-row">
          <div className="stat-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="stat-card-title">Daily Streak</span>
              <Flame size={16} color="var(--warning-color)" />
            </div>
            <div className="stat-card-value">{stats.streakDays} days</div>
            {stats.streakTargetToday > 1 && (
              <div style={{ fontSize: "0.72rem", color: stats.streakConditionMetToday ? "var(--success-color)" : "var(--text-secondary)", marginTop: "4px", fontWeight: 500 }}>
                {stats.streakConditionMetToday
                  ? "✓ Today's goal met"
                  : `${stats.streakProgressToday}/${stats.streakTargetToday} cards today`}
              </div>
            )}
          </div>
          <div className="stat-card-value-box stat-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="stat-card-title">Total Reviews</span>
              <BookOpen size={16} color="var(--accent-color)" />
            </div>
            <div className="stat-card-value">{stats.totalReviews}</div>
          </div>
          <div className="stat-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="stat-card-title">Average Score</span>
              <Award size={16} color="var(--success-color)" />
            </div>
            <div className="stat-card-value">{stats.averageScore}%</div>
          </div>
          <div className="stat-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="stat-card-title">Reviewed Today</span>
              <Calendar size={16} color="var(--text-secondary)" />
            </div>
            <div className="stat-card-value">{stats.cardsReviewedToday}</div>
          </div>
        </div>
      )}

      {/* Callout Info */}
      <div className="callout">
        <span className="callout-icon">💡</span>
        <div className="callout-content">
          <strong>Tip for Revision:</strong> Try typing your answer in Revision Mode to use <strong>AI Validation</strong>! The AI grades your understanding rather than forcing exact matches, giving you qualitative feedback and accelerating active learning.
        </div>
      </div>

      {/* Weekly graph & due reviews grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "24px" }}>
        
        {/* Weekly Progress Bar Chart */}
        {stats && (
          <div className="weekly-chart">
            <h2 className="section-title" style={{ fontSize: "1.1rem" }}>
              <Calendar size={16} /> Weekly Activity
            </h2>
            <div className="chart-bars-container">
              {stats.weeklyProgress.map((w, idx) => {
                const pct = (w.count / maxWeeklyCount) * 100;
                return (
                  <div key={idx} className="chart-column">
                    <div className="chart-bar-outer">
                      <div 
                        className="chart-bar-inner" 
                        style={{ height: `${Math.max(pct, 4)}%` }} 
                      />
                      <div className="chart-bar-tooltip">
                        {w.count} cards ({w.avg_score}% avg)
                      </div>
                    </div>
                    <span className="chart-label">{w.day}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Decks due for review */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <h2 className="section-title" style={{ fontSize: "1.1rem" }}>
            <Sparkles size={16} /> Decks to Review
          </h2>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {dueDecks.map(deck => (
              <div 
                key={deck.id} 
                style={{ 
                  border: "1px solid var(--border-color)", 
                  borderRadius: "8px", 
                  padding: "12px 16px", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "space-between",
                  backgroundColor: "var(--bg-secondary)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "1.5rem" }}>{deck.icon || "🎴"}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>{deck.name}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--danger-color)", fontWeight: 500 }}>
                      {deck.count} card{deck.count > 1 ? "s" : ""} due
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button 
                    className="notion-btn" 
                    style={{ padding: "4px 8px", fontSize: "0.78rem" }}
                    onClick={() => handleStartRevision(deck.id, 'flashcard')}
                  >
                    Flashcards
                  </button>
                  <button 
                    className="notion-btn secondary" 
                    style={{ padding: "4px 8px", fontSize: "0.78rem" }}
                    onClick={() => handleStartRevision(deck.id, 'quiz')}
                  >
                    Quiz
                  </button>
                  <button 
                    className="notion-btn secondary" 
                    style={{ padding: "4px 8px", fontSize: "0.78rem" }}
                    onClick={() => handleStartRevision(deck.id, 'teach')}
                  >
                    Teach AI
                  </button>
                </div>
              </div>
            ))}

            {dueDecks.length === 0 && (
              <div 
                style={{ 
                  border: "1px dashed var(--border-color)", 
                  borderRadius: "8px", 
                  padding: "32px", 
                  textAlign: "center", 
                  color: "var(--text-muted)",
                  fontSize: "0.9rem"
                }}
              >
                🎉 Outstanding! No flashcards are due for review right now.
              </div>
            )}
          </div>
        </div>

      </div>
    </>
  );
}
