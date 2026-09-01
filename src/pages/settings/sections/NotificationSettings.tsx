import { Bell, Clock, Flame, Moon, Send, Volume2, ShieldCheck, Target } from "lucide-react";
import { NotificationSettings as NotifSettingsType, DAY_KEYS, DAY_LABELS, StreakConditionPreset } from "../../../services/notificationService";
import SettingCard from "../components/SettingCard";
import SettingRow from "../components/SettingRow";

interface NotificationSettingsProps {
  settings: NotifSettingsType;
  onChange: <K extends keyof NotifSettingsType>(key: K, value: NotifSettingsType[K]) => void;
  onSendTestNotification: () => void;
}

export default function NotificationSettings({
  settings,
  onChange,
  onSendTestNotification
}: NotificationSettingsProps) {
  const currentPreset = settings.streakConditionPreset || 'casual';

  const handlePresetSelect = (preset: StreakConditionPreset) => {
    let minCards = settings.streakMinCards;
    if (preset === 'casual') minCards = 1;
    if (preset === 'balanced') minCards = 5;
    if (preset === 'serious') minCards = 15;

    onChange("streakConditionPreset", preset);
    onChange("streakMinCards", minCards);
  };

  return (
    <div className="settings-section-container">
      {/* Master Switch Card */}
      <SettingCard
        title="Notification System"
        icon={<Bell size={20} />}
        headerAction={
          <button
            type="button"
            className="notion-btn secondary"
            onClick={onSendTestNotification}
            style={{ fontSize: "0.82rem", gap: "6px" }}
          >
            <Send size={14} /> Send Test Alert
          </button>
        }
      >
        <SettingRow
          label="Enable All Notifications"
        >
          <label className="notion-switch">
            <input
              type="checkbox"
              checked={settings.masterEnabled}
              onChange={(e) => onChange("masterEnabled", e.target.checked)}
            />
            <span className="notion-slider round"></span>
          </label>
        </SettingRow>
      </SettingCard>

      {settings.masterEnabled && (
        <>
          {/* Daily Schedule Card */}
          <SettingCard
            title="Daily Study Reminders"
            icon={<Clock size={20} />}
            headerAction={
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer", fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={settings.dailyReminderEnabled}
                  onChange={(e) => onChange("dailyReminderEnabled", e.target.checked)}
                />
                Active
              </label>
            }
          >
            {settings.dailyReminderEnabled ? (
              <div className="weekly-schedule-grid">
                {DAY_KEYS.map((dayKey) => {
                  const dayLabel = DAY_LABELS[dayKey];
                  const schedule = settings.weeklySchedule[dayKey] || { enabled: true, time: "20:30" };

                  return (
                    <div
                      key={dayKey}
                      className={`day-schedule-card ${schedule.enabled ? 'day-schedule-active' : 'day-schedule-disabled'}`}
                    >
                      <label className="day-schedule-header">
                        <input
                          type="checkbox"
                          checked={schedule.enabled}
                          onChange={(e) => {
                            const updatedSchedule = {
                              ...settings.weeklySchedule,
                              [dayKey]: { ...schedule, enabled: e.target.checked }
                            };
                            onChange("weeklySchedule", updatedSchedule);
                          }}
                        />
                        <span className="day-name">{dayLabel.full}</span>
                      </label>
                      <input
                        type="time"
                        className="notion-input"
                        style={{ fontSize: "0.82rem", padding: "4px 6px", width: "100%" }}
                        value={schedule.time}
                        disabled={!schedule.enabled}
                        onChange={(e) => {
                          const updatedSchedule = {
                            ...settings.weeklySchedule,
                            [dayKey]: { ...schedule, time: e.target.value }
                          };
                          onChange("weeklySchedule", updatedSchedule);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Daily reminders are currently paused. Toggle on above to customize your weekly timetable.
              </div>
            )}
          </SettingCard>

          {/* Daily Streak Continuation Goal Card */}
          <SettingCard
            title="Streak Continuation Goal"
            icon={<Target size={20} style={{ color: "var(--accent-color)" }} />}
          >
            <SettingRow
              label="Goal Intensity Preset"
              vertical
            >
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", width: "100%", marginTop: "2px" }}>
                {[
                  { id: 'casual' as const, label: 'Casual (1+ card)', count: 1 },
                  { id: 'balanced' as const, label: 'Balanced (5+ cards)', count: 5 },
                  { id: 'serious' as const, label: 'Serious (15+ cards)', count: 15 },
                  { id: 'custom' as const, label: 'Custom Goal', count: settings.streakMinCards || 10 },
                ].map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePresetSelect(p.id)}
                    className={`streak-day-pill ${currentPreset === p.id ? 'streak-day-pill-active' : 'streak-day-pill-rest'}`}
                    style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </SettingRow>

            <SettingRow
              label="Minimum Cards Reviewed Per Day"
            >
              <input
                type="number"
                min={1}
                max={200}
                className="notion-input"
                style={{ width: "80px", padding: "4px 8px" }}
                value={settings.streakMinCards || 1}
                onChange={(e) => {
                  const val = Math.max(1, parseInt(e.target.value) || 1);
                  onChange("streakMinCards", val);
                  onChange("streakConditionPreset", "custom");
                }}
              />
            </SettingRow>

            <SettingRow
              label="Count AI Quizzes & Practice Tests"
            >
              <input
                type="checkbox"
                checked={settings.streakAllowQuizzes ?? true}
                onChange={(e) => onChange("streakAllowQuizzes", e.target.checked)}
              />
            </SettingRow>

            <SettingRow
              label="Count Teach Mode Tutor Sessions"
            >
              <input
                type="checkbox"
                checked={settings.streakAllowTeachMode ?? true}
                onChange={(e) => onChange("streakAllowTeachMode", e.target.checked)}
              />
            </SettingRow>
          </SettingCard>

          {/* Active Streak Days / Rest Days Card */}
          <SettingCard
            title="Streak Active & Rest Days"
            description="Select which days count towards your study streak. Days marked as Rest Days will never break your streak if you take time off."
            icon={<Flame size={20} style={{ color: "#f59e0b" }} />}
          >
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", paddingTop: "4px" }}>
              {DAY_KEYS.map((dayKey) => {
                const isRequired = settings.streakActiveDays[dayKey] ?? true;
                const dayInfo = DAY_LABELS[dayKey];

                return (
                  <button
                    key={dayKey}
                    type="button"
                    onClick={() => {
                      const updatedDays = {
                        ...settings.streakActiveDays,
                        [dayKey]: !isRequired
                      };
                      onChange("streakActiveDays", updatedDays);
                    }}
                    className={`streak-day-pill ${isRequired ? 'streak-day-pill-active' : 'streak-day-pill-rest'}`}
                  >
                    <span>{dayInfo.full.slice(0, 3)}</span>
                    <span className="pill-badge">{isRequired ? "Study" : "Rest"}</span>
                  </button>
                );
              })}
            </div>
          </SettingCard>

          {/* Threshold & Streak Saver Alerts Card */}
          <SettingCard
            title="Smart Alerts & Nudges"
            icon={<ShieldCheck size={20} />}
          >
            <SettingRow
              label="Due Cards Threshold Alert"
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input
                  type="number"
                  min={1}
                  max={200}
                  className="notion-input"
                  style={{ width: "75px", padding: "4px 8px" }}
                  value={settings.dueCardsThresholdCount}
                  onChange={(e) => onChange("dueCardsThresholdCount", Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={!settings.dueCardsThresholdEnabled}
                />
                <label className="notion-switch">
                  <input
                    type="checkbox"
                    checked={settings.dueCardsThresholdEnabled}
                    onChange={(e) => onChange("dueCardsThresholdEnabled", e.target.checked)}
                  />
                  <span className="notion-slider round"></span>
                </label>
              </div>
            </SettingRow>

            <SettingRow
              label="Evening Streak Saver"
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input
                  type="time"
                  className="notion-input"
                  style={{ width: "120px", padding: "4px 8px" }}
                  value={settings.streakSaverTime}
                  onChange={(e) => onChange("streakSaverTime", e.target.value)}
                  disabled={!settings.streakSaverEnabled}
                />
                <label className="notion-switch">
                  <input
                    type="checkbox"
                    checked={settings.streakSaverEnabled}
                    onChange={(e) => onChange("streakSaverEnabled", e.target.checked)}
                  />
                  <span className="notion-slider round"></span>
                </label>
              </div>
            </SettingRow>
          </SettingCard>

          {/* Quiet Hours (DND) & Sound Preferences */}
          <SettingCard
            title="Quiet Hours & Audio"
            icon={<Moon size={20} />}
          >
            <SettingRow
              label="Quiet Hours (Do Not Disturb)"
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="time"
                  className="notion-input"
                  style={{ width: "105px", padding: "4px 6px" }}
                  value={settings.quietHoursStart}
                  onChange={(e) => onChange("quietHoursStart", e.target.value)}
                  disabled={!settings.quietHoursEnabled}
                />
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>to</span>
                <input
                  type="time"
                  className="notion-input"
                  style={{ width: "105px", padding: "4px 6px" }}
                  value={settings.quietHoursEnd}
                  onChange={(e) => onChange("quietHoursEnd", e.target.value)}
                  disabled={!settings.quietHoursEnabled}
                />
                <label className="notion-switch">
                  <input
                    type="checkbox"
                    checked={settings.quietHoursEnabled}
                    onChange={(e) => onChange("quietHoursEnabled", e.target.checked)}
                  />
                  <span className="notion-slider round"></span>
                </label>
              </div>
            </SettingRow>

            <SettingRow
              label={
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <Volume2 size={15} /> Sound Effects
                </span>
              }
            >
              <label className="notion-switch">
                <input
                  type="checkbox"
                  checked={settings.soundEnabled}
                  onChange={(e) => onChange("soundEnabled", e.target.checked)}
                />
                <span className="notion-slider round"></span>
              </label>
            </SettingRow>

            <SettingRow
              label={
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <Bell size={15} /> In-App Banner Toasts
                </span>
              }
            >
              <label className="notion-switch">
                <input
                  type="checkbox"
                  checked={settings.inAppToastEnabled}
                  onChange={(e) => onChange("inAppToastEnabled", e.target.checked)}
                />
                <span className="notion-slider round"></span>
              </label>
            </SettingRow>
          </SettingCard>
        </>
      )}
    </div>
  );
}
