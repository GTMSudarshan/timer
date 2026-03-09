import { useState, useEffect, useRef, useCallback, useMemo } from "react";
// Recharts imports handled by preview wrapper globally

// ── Audio ─────────────────────────────────────────────────────────────────────
// Split into distinct end sounds for focus vs break
function playTone(freqs, vol = 0.18, spacing = 0.18, type = "sine") {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = type;
      const t = ctx.currentTime + i * spacing;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  } catch {}
}

const playFocusEnd = () => playTone([528, 660, 784, 660], 0.2, 0.14);
const playBreakEnd = () => playTone([392, 330], 0.12, 0.22);
const playStart = () => playTone([440, 550], 0.1, 0.1);
const playPause = () => playTone([330, 260], 0.08, 0.1);

function playTick() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 900;
    osc.type = "square";
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.05);
  } catch {}
}

function sanitizeCSVField(field) {
  if (typeof field !== "string") return String(field || "");
  // Prevent CSV injection: strip leading =, +, -, @, tab, carriage return
  let cleaned = field.replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(cleaned)) {
    cleaned = "'" + cleaned;
  }
  return cleaned;
}

function isValidYouTubeUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    const validHosts = [
      "www.youtube.com",
      "youtube.com",
      "m.youtube.com",
      "youtu.be",
      "music.youtube.com",
    ];
    return validHosts.includes(parsed.hostname);
  } catch {
    // Could be just a video ID (11 chars alphanumeric)
    return /^[a-zA-Z0-9_-]{11}$/.test(url.trim());
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_SUBJECTS = ["Physics", "Chemistry", "Math"];
const DEFAULT_SETTINGS = {
  workDuration: 25,
  shortBreak: 5,
  longBreak: 15,
  customSubjects: [],
  tickSound: false,
  autoStart: false,
  autoPlayMusic: false,
  musicSource: "local", // "local" or "youtube"
  youtubeUrl: "https://www.youtube.com/watch?v=jfKfPfyJRdk", // Default Lofi Girl
  musicVolume: 0.5,
  lastTrackId: "none",
  focusTasks: [
    { id: 1, text: "", completed: false },
  ],
};

const MODES = {
  work: { label: "Focus", key: "workDuration" },
  short: { label: "Short Break", key: "shortBreak" },
  long: { label: "Long Break", key: "longBreak" },
};

const ACCENT = { work: "#e8c547", short: "#5bbfb5", long: "#8b8fe8" };
const AMBIANCE = {
  work: { bg: "#080808", glowBlur: 3, glowOp: 0.12, breathe: false },
  short: {
    bg: "#07090a",
    glowBlur: 8,
    glowOp: 0.22,
    breathe: true,
    bspeed: "4s",
  },
  long: {
    bg: "#07080c",
    glowBlur: 14,
    glowOp: 0.32,
    breathe: true,
    bspeed: "7s",
  },
};

// Subject accent dot colors (cycles for custom subjects)
const SUBJECT_DOTS = [
  "#e8c547",
  "#5bbfb5",
  "#8b8fe8",
  "#e87d5b",
  "#7be89a",
  "#e85b9a",
];

const AMBIANCE_TRACKS = [
  { id: "none", name: "None", artist: "", url: "" },
  {
    id: "lofi",
    name: "Lo-Fi Beat",
    artist: "SoundHelix",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  },
  {
    id: "rain",
    name: "Rain",
    artist: "Mixkit Nature",
    url: "https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3",
  },
  {
    id: "forest",
    name: "Forest",
    artist: "Mixkit Nature",
    url: "https://assets.mixkit.co/active_storage/sfx/1234/1234-preview.mp3",
  },
  {
    id: "noise",
    name: "Deep Noise",
    artist: "Mixkit Tones",
    url: "https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3",
  },
];

const QUOTES = [
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Your time is limited, so don't waste it living someone else's life.", author: "Steve Jobs" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "Efficiency is doing things right; effectiveness is doing the right things.", author: "Peter Drucker" },
  { text: "Don't count the days, make the days count.", author: "Muhammad Ali" },
  { text: "The future depends on what you do today.", author: "Mahatma Gandhi" },
  { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { text: "Deep work is the ability to focus without distraction.", author: "Cal Newport" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
];

// ── Mini Music Player (used in Stats tab) ────────────────────────────────────
function MiniMusicPlayer({
  accent,
  isYt,
  isMusicPlaying,
  trackTitle,
  trackArtist,
  currentTimeSec,
  durationSec,
  musicVolume,
  toggleMusic,
  seekMusic,
  setMusicVolume,
  fmtTime,
  isLoading,
  ytNextTrack,
  ytPrevTrack,
}) {
  return (
    <div
      className="mini-music-player"
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "#0d0d0dee",
        border: "1px solid #1e1e1e",
        borderRadius: 40,
        padding: "6px 16px 6px 8px",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        maxWidth: "92vw",
        minWidth: 280,
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        animation: "fadeUp 0.3s ease",
      }}
    >
      {/* Play/Pause */}
      <button
        className="mp-play-btn"
        onClick={toggleMusic}
        style={{
          width: 30,
          height: 30,
          minWidth: 30,
          background: "#161616",
          border: "1px solid " + (isMusicPlaying ? accent + "44" : "#262626"),
          borderRadius: "50%",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: isMusicPlaying ? accent : "#555",
          transition: "all 0.2s",
          flexShrink: 0,
        }}
        aria-label={isMusicPlaying ? "Pause" : "Play"}
      >
        {isLoading ? (
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#333"
            strokeWidth="2"
            style={{ animation: "breathe 1.2s ease-in-out infinite" }}
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        ) : isMusicPlaying ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6 3 20 12 6 21 6 3" />
          </svg>
        )}
      </button>

      {/* Equalizer bars or music icon */}
      {isMusicPlaying ? (
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 1.5,
            height: 12,
            flexShrink: 0,
          }}
        >
          {[8, 12, 6].map((h, i) => (
            <div
              key={i}
              style={{
                width: 1.5,
                background: accent,
                borderRadius: 1,
                height: h,
                animation: `pulse-dot 0.6s ease ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      ) : null}

      {/* Track info */}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "#888",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            letterSpacing: "0.02em",
          }}
        >
          {trackTitle}
        </span>
        <span
          style={{
            fontSize: 8,
            color: "#2e2e2e",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {trackArtist || (isMusicPlaying ? "Now playing" : "Paused")}
        </span>
      </div>

      {/* Progress bar (compact) */}
      <div
        style={{
          width: 50,
          height: 3,
          background: "#1a1a1a",
          borderRadius: 2,
          cursor: "pointer",
          position: "relative",
          flexShrink: 0,
        }}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          seekMusic(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            borderRadius: 2,
            background: accent,
            width:
              durationSec > 0
                ? `${(currentTimeSec / durationSec) * 100}%`
                : "0%",
            transition: "width 0.9s linear",
          }}
        />
      </div>

      {/* Time */}
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 8,
          color: "#333",
          flexShrink: 0,
          minWidth: 24,
        }}
      >
        {fmtTime(currentTimeSec)}
      </span>

      {/* Volume mini */}
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        className="volume-slider"
        value={musicVolume}
        onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
        style={{ width: 36, flexShrink: 0 }}
        aria-label="Volume"
      />
    </div>
  );
}

// ── Stats Dashboard ──────────────────────────────────────────────────────────
function StatsDashboard({
  history,
  allSubjects,
  subjectDot,
  onClearAllData,
  onClearToday,
}) {
  const [range, setRange] = useState("year");
  const [selectedDay, setSelectedDay] = useState(null);

  const stats = useMemo(() => {
    const safeHistory = (history || []).filter((s) => {
      if (!s) return false;
      if (!s.completedAt || typeof s.completedAt !== "string") return false;
      if (!s.subject) return false; // Ensure subject exists
      return true;
    });

    const today = new Date().toISOString().slice(0, 10);
    const todaySessions = safeHistory.filter(
      (s) => s.completedAt.startsWith(today) && s.type === "work",
    );
    const todayMins = todaySessions.reduce(
      (acc, s) => acc + (parseFloat(s.duration) || 0),
      0,
    );
    const totalMins = safeHistory.reduce(
      (acc, s) => acc + (parseFloat(s.duration) || 0),
      0,
    );

    const breakdownAll = allSubjects.map((name) => ({
      name,
      value: safeHistory
        .filter((s) => s.subject === name && s.type === "work")
        .reduce((acc, s) => acc + (parseFloat(s.duration) || 0), 0),
      color: subjectDot(name),
    }));
    const breakdown =
      breakdownAll.filter((s) => s.value > 0).length > 0
        ? breakdownAll.filter((s) => s.value > 0)
        : breakdownAll;

    const days = range === "week" ? 7 : range === "month" ? 31 : 365;
    const activity = [];
    const now = new Date();
    // Use local time for generating activity dates to match session logging
    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - (days - 1 - i));
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const ds = `${year}-${month}-${day}`;
      const count = safeHistory.filter(
        (s) => s.completedAt.startsWith(ds) && s.type === "work",
      ).length;
      activity.push({ date: ds, count });
    }

    const dailyCounts = {};
    const dailyMins = {};
    safeHistory
      .filter((s) => s.type === "work")
      .forEach((s) => {
        const date = s.completedAt.slice(0, 10);
        dailyCounts[date] = (dailyCounts[date] || 0) + 1;
        dailyMins[date] =
          (dailyMins[date] || 0) + (parseFloat(s.duration) || 0);
      });

    const peakSessionsInADay = Math.max(0, ...Object.values(dailyCounts));
    const peakDayDate = Object.keys(dailyCounts).find(
      (d) => dailyCounts[d] === peakSessionsInADay,
    );
    const peakDayMins = peakDayDate ? dailyMins[peakDayDate] : 0;

    const uniqueDays = new Set(safeHistory
      .filter((s) => s.type === "work")
      .map((s) => s.completedAt.slice(0, 10))).size;
    const avgSessions =
      uniqueDays > 0
        ? (
            safeHistory.filter((s) => s.type === "work").length / uniqueDays
          ).toFixed(1)
        : 0;

    const workDaySet = new Set(
      safeHistory
        .filter((s) => s.type === "work")
        .map((s) => s.completedAt.slice(0, 10)),
    );
    const sortedWorkDays = [...workDaySet].sort();
    let longestStreak = 0,
      sCur = 0;
    sortedWorkDays.forEach((day, i) => {
      if (i === 0) {
        sCur = 1;
      } else {
        const diff =
          (new Date(day + "T00:00:00Z") -
            new Date(sortedWorkDays[i - 1] + "T00:00:00Z")) /
          86400000;
        sCur = diff === 1 ? sCur + 1 : 1;
      }
      longestStreak = Math.max(longestStreak, sCur);
    });
    const todayISO = today;
    const yestISO = new Date(Date.now() - 86400000)
      .toISOString()
      .slice(0, 10);
    let currentStreak = 0;
    const startDay = workDaySet.has(todayISO)
      ? todayISO
      : workDaySet.has(yestISO)
        ? yestISO
        : null;
    if (startDay) {
      let d = new Date(startDay + "T00:00:00Z");
      while (workDaySet.has(d.toISOString().slice(0, 10))) {
        currentStreak++;
        d = new Date(d.getTime() - 86400000);
      }
    }

    // Simple consistency score over recent window (0–100)
    const windowDays = 21;
    let activeDays = 0;
    for (let i = 0; i < windowDays; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      if (dailyCounts[ds]) activeDays++;
    }
    const consistencyScore =
      windowDays > 0 ? Math.round((activeDays / windowDays) * 100) : 0;
    let consistencyLabel = "Getting started";
    if (consistencyScore >= 80) consistencyLabel = "Ultra consistent";
    else if (consistencyScore >= 60) consistencyLabel = "Very steady";
    else if (consistencyScore >= 40) consistencyLabel = "Finding rhythm";

    // Subject minutes for recent windows
    const weekWindowDays = 7;
    const monthWindowDays = 30;
    const todayDate = new Date();
    const weekSubjectMap = {};
    const monthSubjectMap = {};
    safeHistory
      .filter((s) => s.type === "work")
      .forEach((s) => {
        const dateStr = s.completedAt.slice(0, 10);
        const d = new Date(dateStr + "T00:00:00Z");
        const diffDays =
          (todayDate.getTime() - d.getTime()) / 86400000;
        const mins = parseFloat(s.duration) || 0;
        const subj = s.subject || "Unknown";
        if (diffDays >= 0 && diffDays < weekWindowDays) {
          weekSubjectMap[subj] = (weekSubjectMap[subj] || 0) + mins;
        }
        if (diffDays >= 0 && diffDays < monthWindowDays) {
          monthSubjectMap[subj] = (monthSubjectMap[subj] || 0) + mins;
        }
      });
    const weekSubjects = allSubjects.map((name) => ({
      name,
      value: weekSubjectMap[name] || 0,
      color: subjectDot(name),
    }));
    const monthSubjects = allSubjects.map((name) => ({
      name,
      value: monthSubjectMap[name] || 0,
      color: subjectDot(name),
    }));

    return {
      todaySessions,
      todayMins,
      totalMins,
      breakdown,
      activity,
      peakSessionsInADay,
      peakDayMins,
      avgSessions,
      currentStreak,
      longestStreak,
      consistencyScore,
      consistencyWindowDays: windowDays,
      consistencyLabel,
      weekSubjects,
      monthSubjects,
    };
  }, [history, allSubjects, subjectDot, range]);

  const exportCSV = () => {
    const rows = [
      "Subject,Duration (min),Completed At,Type,Music Source,Music Title,Music Artist",
      ...history.map((s) =>
        [
          `"${sanitizeCSVField(s.subject || "")}"`,
          s.duration || 0,
          `"${sanitizeCSVField(s.completedAt || "")}"`,
          `"${sanitizeCSVField(s.type || "")}"`,
          `"${sanitizeCSVField(s.musicSource || "")}"`,
          `"${sanitizeCSVField(s.musicTitle || "")}"`,
          `"${sanitizeCSVField(s.musicArtist || "")}"`,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `study-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  return (
    <div
      className="fade-up"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        width: "100%",
        paddingBottom: 80,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: -8,
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "#2a2a2a",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Overview
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {onClearToday && (
            <button
              className="btn-stats-tab"
              onClick={onClearToday}
              style={{ fontSize: 9, letterSpacing: "0.1em" }}
            >
              Clear Today
            </button>
          )}
          {onClearAllData && (
            <button
              className="btn-stats-tab"
              onClick={onClearAllData}
              style={{ fontSize: 9, letterSpacing: "0.1em" }}
            >
              Clear All
            </button>
          )}
          <button
            className="btn-stats-tab"
            onClick={exportCSV}
            style={{ fontSize: 9, letterSpacing: "0.1em" }}
          >
            Export CSV
          </button>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 16,
        }}
      >
        <div className="stats-card">
          <span className="stats-title">Today</span>
          <span className="stats-value">{stats.todaySessions.length}</span>
          <span className="stats-label">Sessions</span>
        </div>
        <div className="stats-card">
          <span className="stats-title">Today's Time</span>
          <span className="stats-value">
            {Math.floor(stats.todayMins / 60)}h{" "}
            {Math.round(stats.todayMins % 60)}m
          </span>
          <span className="stats-label">Focused today</span>
        </div>
        <div className="stats-card">
          <span className="stats-title">Total Time</span>
          <span className="stats-value">
            {Math.floor(stats.totalMins / 60)}h{" "}
            {Math.round(stats.totalMins % 60)}m
          </span>
          <span className="stats-label">Focused all-time</span>
        </div>
        <div className="stats-card">
          <span className="stats-title">Average</span>
          <span className="stats-value">{stats.avgSessions}</span>
          <span className="stats-label">Sessions / Day</span>
        </div>
        <div className="stats-card">
          <span className="stats-title">Current Streak</span>
          <span className="stats-value">{stats.currentStreak}</span>
          <span className="stats-label">Days in a row</span>
        </div>
        <div className="stats-card">
          <span className="stats-title">Best Streak</span>
          <span className="stats-value">{stats.longestStreak}</span>
          <span className="stats-label">Longest run</span>
        </div>
        <div className="stats-card">
          <span className="stats-title">Consistency</span>
          <span className="stats-value">
            {stats.consistencyScore}
            <span
              style={{
                fontSize: 12,
                marginLeft: 2,
                color: "#555",
                fontWeight: 500,
              }}
            >
              /100
            </span>
          </span>
          <span className="stats-label">
            {stats.consistencyLabel} · last {stats.consistencyWindowDays} days
          </span>
        </div>
      </div>

      {/* Today's session list + recent subject summaries */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
          gap: 16,
          alignItems: "stretch",
        }}
      >
        <div className="stats-card">
          <span className="stats-title">Today's Sessions</span>
          {stats.todaySessions.length === 0 ? (
            <span className="stats-label" style={{ marginTop: 8 }}>
              No focus sessions logged today yet.
            </span>
          ) : (
            <div
              style={{
                marginTop: 10,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {stats.todaySessions.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 10px",
                    background: "#0f0f0f",
                    borderRadius: 4,
                    border: "1px solid #191919",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: subjectDot(s.subject),
                        flexShrink: 0,
                        display: "inline-block",
                      }}
                    />
                    <span
                      style={{
                        fontSize: 11,
                        color: "#555",
                        fontFamily: "'Syne', sans-serif",
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                      }}
                    >
                      {s.subject}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 11,
                        color: "#3a3a3a",
                      }}
                    >
                      {Math.round(parseFloat(s.duration) || 0)}m
                    </span>
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 9,
                        color: "#252525",
                      }}
                    >
                      {new Date(s.completedAt).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="stats-card">
          <span className="stats-title">Subjects — Recent Focus</span>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 8,
            }}
          >
            {[
              {
                label: "Last 7 days",
                data: stats.weekSubjects,
              },
              {
                label: "Last 30 days",
                data: stats.monthSubjects,
              },
            ].map(({ label, data }) => {
              const nonZero = data.filter((s) => s.value > 0);
              const top = (nonZero.length ? nonZero : data)
                .slice()
                .sort((a, b) => b.value - a.value)
                .slice(0, 3);
              return (
                <div key={label}>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#2a2a2a",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: 4,
                    }}
                  >
                    {label}
                  </div>
                  {top.length === 0 || top.every((t) => t.value === 0) ? (
                    <div
                      style={{
                        fontSize: 10,
                        color: "#222",
                      }}
                    >
                      No focus logged in this window.
                    </div>
                  ) : (
                    top.map((s) => (
                      <div
                        key={s.name}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "4px 0",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: "50%",
                              background: s.color,
                              flexShrink: 0,
                              display: "inline-block",
                            }}
                          />
                          <span
                            style={{
                              fontSize: 10,
                              color: "#444",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            {s.name}
                          </span>
                        </div>
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 10,
                            color: "#3a3a3a",
                          }}
                        >
                          {Math.round(s.value)}m
                        </span>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 16,
        }}
      >
        <div className="stats-card" style={{ height: 320 }}>
          <span className="stats-title">Subject Breakdown (min)</span>
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "flex-end",
              gap: 12,
              padding: "20px 10px 10px",
              minHeight: 200,
              height: "100%",
            }}
          >
            {(() => {
              const maxVal = Math.max(
                ...stats.breakdown.map((x) => x.value),
                1,
              );
              return stats.breakdown.map((s, i) => {
                const hPct = (s.value / maxVal) * 100;
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      alignItems: "center",
                      gap: 8,
                      height: "100%",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: `${hPct}%`,
                        minHeight: s.value > 0 ? 4 : 2,
                        background: s.value > 0 ? s.color : "#1a1a1a",
                        borderRadius: "4px 4px 0 0",
                        transition: "height 1s cubic-bezier(0.4, 0, 0.2, 1)",
                        position: "relative",
                      }}
                    >
                      {s.value > 0 && (
                        <div
                          style={{
                            position: "absolute",
                            top: -20,
                            left: "50%",
                            transform: "translateX(-50%)",
                            fontSize: 10,
                            color: "#666",
                            fontFamily: "JetBrains Mono",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {Math.round(s.value)}
                        </div>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 9,
                        color: "#444",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        textAlign: "center",
                        width: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {s.name}
                    </span>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        <div className="stats-card" style={{ justifyContent: "center" }}>
          <span className="stats-title">Productivity Peak</span>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              marginTop: 10,
            }}
          >
            <div className="peak-stat">
              <span className="stats-label" style={{ width: 100 }}>
                Peak Record
              </span>
              <span className="peak-hour">{stats.peakSessionsInADay}</span>
              <span className="peak-count">sessions / day</span>
            </div>
            <div className="peak-stat">
              <span className="stats-label" style={{ width: 100 }}>
                Peak Time
              </span>
              <span className="peak-hour">
                {Math.floor(stats.peakDayMins / 60)}h{" "}
                {Math.round(stats.peakDayMins % 60)}m
              </span>
              <span className="peak-count">Total focused</span>
            </div>
          </div>
        </div>
      </div>

      <div className="stats-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            gap: 12,
            flexWrap: "wrap"
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span className="stats-title">Activity Timeline</span>
            <span
              style={{
                fontSize: 9,
                color: "#222",
                marginTop: 2,
                fontWeight: 500,
              }}
            >
              {range === "year" 
                ? `${new Date().getFullYear()} Timeline` 
                : range === "month" 
                  ? `${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })} View`
                  : `Last 7 Days Activity`}
            </span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {["week", "month", "year"].map((r) => (
              <button
                key={r}
                className={`btn-stats-tab ${range === r ? "active" : ""}`}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div
          className="heatmap"
          style={{
            gridTemplateColumns:
              range === "week"
                ? "repeat(7, 1fr)"
                : range === "month"
                  ? "repeat(31, 1fr)"
                  : "repeat(53, 1fr)",
            marginTop: 10,
          }}
        >
          {stats.activity.map((d, i) => {
            let level = 0;
            if (d.count > 0) level = 1;
            if (d.count > 3) level = 2;
            if (d.count > 6) level = 3;
            if (d.count > 9) level = 4;
            return (
              <div
                key={i}
                className={`heatmap-cell level-${level}`}
                title={`${d.date}: ${d.count} sessions`}
                onClick={() => setSelectedDay(d.date)}
                style={{ cursor: "pointer" }}
              />
            );
          })}
        </div>

        {selectedDay &&
          (() => {
            const daySessions = history.filter(
              (s) => s.completedAt.startsWith(selectedDay) && s.type === "work",
            );
            const dayMins = daySessions.reduce(
              (acc, s) => acc + (parseFloat(s.duration) || 0),
              0,
            );
            return (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "#0d0d0d",
                  borderRadius: 8,
                  padding: "32px 40px",
                  zIndex: 5,
                  display: "flex",
                  flexDirection: "column",
                  gap: 24,
                  animation: "fadeUp 0.3s ease",
                  border: "1px solid #1a1a1a",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className="stats-title" style={{ color: "#444", fontSize: 12, letterSpacing: "0.2em" }}>
                      DAY DETAILS
                    </span>
                    <span style={{ fontSize: 24, fontWeight: 800, color: "#d8d8d8", fontFamily: "Syne" }}>
                      {new Date(selectedDay).toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <button
                    className="btn-icon"
                    onClick={() => setSelectedDay(null)}
                    style={{ color: "#333", background: "#161616", padding: 10, borderRadius: "50%" }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                <div
                  style={{ display: "flex", gap: 48, padding: "20px 0", borderBottom: "1px solid #141414" }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 32, fontWeight: 300, color: "#d8d8d8", fontFamily: "JetBrains Mono" }}>
                      {daySessions.length}
                    </span>
                    <span className="stats-label" style={{ color: "#2a2a2a", fontSize: 10 }}>SESSIONS COMPLETED</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 32, fontWeight: 300, color: "#d8d8d8", fontFamily: "JetBrains Mono" }}>
                        {Math.floor(dayMins / 60)}<span style={{ fontSize: 16, color: "#333", marginLeft: 2 }}>h</span>
                      </span>
                      <span style={{ fontSize: 32, fontWeight: 300, color: "#d8d8d8", fontFamily: "JetBrains Mono" }}>
                        {Math.round(dayMins % 60)}<span style={{ fontSize: 16, color: "#333", marginLeft: 2 }}>m</span>
                      </span>
                    </div>
                    <span className="stats-label" style={{ color: "#2a2a2a", fontSize: 10 }}>TOTAL FOCUS TIME</span>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    overflowY: "auto",
                    flex: 1,
                    paddingRight: 10,
                  }}
                  className="settings-drawer" // Reuse scrollbar styles
                >
                  {daySessions.length > 0 ? (
                    daySessions.map((s, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                          padding: 20,
                          background: "#0f0f0f",
                          borderRadius: 12,
                          border: "1px solid #181818",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: subjectDot(s.subject),
                              }}
                            />
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                              {s.subject}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                            <span style={{ fontFamily: "JetBrains Mono", fontSize: 12, color: "#444" }}>
                              {Math.round(parseFloat(s.duration) || 0)} min
                            </span>
                            <span style={{ fontFamily: "JetBrains Mono", fontSize: 10, color: "#222" }}>
                              {new Date(s.completedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>

                        {s.tasks && s.tasks.filter(t => t.text.trim()).length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 16px", background: "#080808", borderRadius: 8, border: "1px solid #141414" }}>
                            <span style={{ fontSize: 9, color: "#222", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Tasks Logged</span>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                              {/* Completed Tasks */}
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <span style={{ fontSize: 8, color: "#39d35344", fontWeight: 600 }}>COMPLETED</span>
                                {s.tasks.filter(t => t.completed && t.text.trim()).length > 0 ? (
                                  s.tasks.filter(t => t.completed && t.text.trim()).map((t, ti) => (
                                    <div key={ti} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#39d353" }} />
                                      <span style={{ fontSize: 11, color: "#39d353aa", textDecoration: "line-through" }}>{t.text}</span>
                                    </div>
                                  ))
                                ) : <span style={{ fontSize: 10, color: "#1a1a1a" }}>None</span>}
                              </div>
                              {/* Left Tasks */}
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <span style={{ fontSize: 8, color: "#444", fontWeight: 600 }}>PENDING</span>
                                {s.tasks.filter(t => !t.completed && t.text.trim()).length > 0 ? (
                                  s.tasks.filter(t => !t.completed && t.text.trim()).map((t, ti) => (
                                    <div key={ti} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#222" }} />
                                      <span style={{ fontSize: 11, color: "#555" }}>{t.text}</span>
                                    </div>
                                  ))
                                ) : <span style={{ fontSize: 10, color: "#1a1a1a" }}>None</span>}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 12, color: "#222", textAlign: "center", padding: 60 }}>
                      No focus sessions recorded for this day.
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function PomodoroApp() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [mode, setMode] = useState("work");
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const [howlerAvailable, setHowlerAvailable] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInput, setSettingsInput] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [isSplashActive, setIsSplashActive] = useState(true);
  const [focusTasks, setFocusTasks] = useState(DEFAULT_SETTINGS.focusTasks);
  const [currentQuote, setCurrentQuote] = useState(QUOTES[0]);

  const handleToggleTask = (id) => {
    setFocusTasks(prev => {
      const next = prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
      // Persist
      const current = settingsRef.current;
      const updatedSettings = { ...current, focusTasks: next };
      settingsRef.current = updatedSettings;
      window.storage.set("settings", JSON.stringify(updatedSettings));
      return next;
    });
  };

  const handleTaskChange = (id, text) => {
    setFocusTasks(prev => {
      const next = prev.map(t => t.id === id ? { ...t, text } : t);
      // Persist
      const current = settingsRef.current;
      const updatedSettings = { ...current, focusTasks: next };
      settingsRef.current = updatedSettings;
      window.storage.set("settings", JSON.stringify(updatedSettings));
      return next;
    });
  };

  const handleAddTask = () => {
    if (focusTasks.length >= 5) return;
    setFocusTasks(prev => {
      const next = [...prev, { id: Date.now(), text: "", completed: false }];
      // Persist
      const current = settingsRef.current;
      const updatedSettings = { ...current, focusTasks: next };
      settingsRef.current = updatedSettings;
      window.storage.set("settings", JSON.stringify(updatedSettings));
      return next;
    });
  };

  const handleRemoveTask = (id) => {
    setFocusTasks(prev => {
      let next = prev.filter(t => t.id !== id);
      if (next.length === 0) next = [{ id: Date.now(), text: "", completed: false }];
      // Persist
      const current = settingsRef.current;
      const updatedSettings = { ...current, focusTasks: next };
      settingsRef.current = updatedSettings;
      window.storage.set("settings", JSON.stringify(updatedSettings));
      return next;
    });
  };

  const handleTaskKeyDown = (e, id, index) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const task = focusTasks.find(t => t.id === id);
      if (task && task.text.trim()) {
        if (index === focusTasks.length - 1 && focusTasks.length < 5) {
          handleAddTask();
        } else if (index < focusTasks.length - 1) {
          // Focus next input if it exists
          const inputs = document.querySelectorAll('.task-input');
          if (inputs[index + 1]) inputs[index + 1].focus();
        }
      }
    } else if (e.key === "Escape") {
      const task = focusTasks.find(t => t.id === id);
      if (!task.text.trim() && focusTasks.length > 1) {
        handleRemoveTask(id);
      } else {
        e.target.blur();
      }
    }
  };
  const [lockedNotice, setLockedNotice] = useState(false);
  // Phase 2
  const [subject, setSubject] = useState("Physics");
  const [newSubjectInput, setNewSubjectInput] = useState("");
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [view, setView] = useState("timer");
  const [history, setHistory] = useState([]);
  // Music state
  const [currentTrack, setCurrentTrack] = useState(AMBIANCE_TRACKS[0]);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.5);
  const [ytPlayer, setYtPlayer] = useState(null);
  const [ytVideoTitle, setYtVideoTitle] = useState("");
  const [ytArtist, setYtArtist] = useState("");
  const [ytCurrentTime, setYtCurrentTime] = useState(0);
  const [ytDuration, setYtDuration] = useState(0);
  const [ytLoading, setYtLoading] = useState(false);
  const [ytUrlError, setYtUrlError] = useState("");
  // Local player progress tracking
  const [localCurrentTime, setLocalCurrentTime] = useState(0);
  const [localDuration, setLocalDuration] = useState(0);
  const localProgressRef = useRef(null);

  const howlsRef = useRef({});
  const scrollRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const lockedTimerRef = useRef(null);
  const autoStartRef = useRef(null);
  const startTimestampRef = useRef(null);
  const initialTimeLeftRef = useRef(0);
  const ytProgressRef = useRef(null); // interval for yt progress polling
  const timeLeftRef = useRef(timeLeft); // ref for actual time left (for skip duration calc)

  const modeRef = useRef(mode);
  const settingsRef = useRef(settings);
  const subjectRef = useRef(subject);
  const focusTasksRef = useRef(focusTasks);

  // Music refs for use in handleSessionEnd (avoids stale closures)
  const currentTrackRef = useRef(currentTrack);
  const ytVideoTitleRef = useRef(ytVideoTitle);
  const ytArtistRef = useRef(ytArtist);
  const isMusicPlayingRef = useRef(isMusicPlaying);
  const toggleMusicRef = useRef(null);
  const isClearingRef = useRef(false);
  const [isClearingData, setIsClearingData] = useState(false);
  const [isChangingView, setIsChangingView] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState(null); // { message, onConfirm }

  const handleViewChange = (newView) => {
    if (view === newView) return;
    setIsChangingView(true);
    setTimeout(() => {
      setView(newView);
      setIsChangingView(false);
    }, 300);
  };

  useEffect(() => {
    modeRef.current = mode;
    settingsRef.current = settings;
    subjectRef.current = subject;
    focusTasksRef.current = focusTasks;
  }, [mode, settings, subject, focusTasks]);

  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    ytVideoTitleRef.current = ytVideoTitle;
  }, [ytVideoTitle]);

  useEffect(() => {
    ytArtistRef.current = ytArtist;
  }, [ytArtist]);

  useEffect(() => {
    isMusicPlayingRef.current = isMusicPlaying;
  }, [isMusicPlaying]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const allSubjects = useMemo(
    () => [...DEFAULT_SUBJECTS, ...(settings.customSubjects || [])],
    [settings.customSubjects],
  );
  const subjectDot = useCallback(
    (s) => {
      const idx = allSubjects.indexOf(s);
      if (idx === -1) return "#333";
      return SUBJECT_DOTS[idx % SUBJECT_DOTS.length];
    },
    [allSubjects],
  );

  const accent = mode === "work" ? subjectDot(subject) : ACCENT[mode];
  const amb = AMBIANCE[mode];
  const totalSecs = settings[MODES[mode].key] * 60;
  const progress = totalSecs > 0 ? (totalSecs - timeLeft) / totalSecs : 0;
  const R = 110;
  const CIRC = 2 * Math.PI * R;
  const dashOffset = CIRC * (1 - progress);
  const mins = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const secs = String(timeLeft % 60).padStart(2, "0");
  const pipsFilled = pomodoroCount % 4;
  const chromeOp = isRunning ? 0.2 : 1;
  const subjectOp = isRunning ? 0.35 : 1;

  // ── Load settings ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      // Pick a random quote from API with fallback - NON-BLOCKING
      fetch("https://dummyjson.com/quotes/random")
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(data => setCurrentQuote({ text: data.quote, author: data.author }))
        .catch(() => {
          const randomQuote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
          setCurrentQuote(randomQuote);
        });

      // Detect Howler availability
      const isHowlerMissing = typeof window.Howl === "undefined";
      if (isHowlerMissing) {
        setHowlerAvailable(false);
      }

      try {
        const r = await window.storage.get("settings");
        if (r) {
          const s = { ...DEFAULT_SETTINGS, ...JSON.parse(r.value) };

          // If Howler is missing, auto-switch to youtube
          if (isHowlerMissing && s.musicSource === "local") {
            s.musicSource = "youtube";
          }

          setSettings(s);
          setSettingsInput(s);
          setTimeLeft(s.workDuration * 60);

          // Restore persisted pomodoro count
          if (typeof s.pomodoroCount === "number") {
            setPomodoroCount(s.pomodoroCount % 4);
          }

          // Restore focus tasks
          if (s.focusTasks) {
            setFocusTasks(s.focusTasks);
          }

          // Restore persisted music volume and track
          if (typeof s.musicVolume === "number") {
            setMusicVolume(s.musicVolume);
          }
          if (s.lastTrackId && s.lastTrackId !== "none") {
            const found = AMBIANCE_TRACKS.find((t) => t.id === s.lastTrackId);
            if (found) setCurrentTrack(found);
          }
        } else {
          // If Howler is missing, default to youtube
          if (isHowlerMissing) {
            const s = { ...DEFAULT_SETTINGS, musicSource: "youtube" };
            setSettings(s);
            setSettingsInput(s);
          }
          setTimeLeft(25 * 60);
        }
      } catch {
        setTimeLeft(25 * 60);
      }
      setLoaded(true);
      // Fade out splash after a small delay
      setTimeout(() => setIsSplashActive(false), 1200);
    })();
  }, []);

  // ── Load today's session count ─────────────────────────────────────────────
  const loadTodaySessionCount = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const r = await window.storage.list(`sessions:${today}`);
      if (r?.keys) {
        const data = await Promise.all(
          r.keys.map(async (k) => {
            const val = await window.storage.get(k.replace("pomodoro_", ""));
            return val ? JSON.parse(val.value) : null;
          }),
        );
        setSessionCount(data.filter((s) => s?.type === "work").length);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadTodaySessionCount();
  }, [loadTodaySessionCount]);

  // ── Load session history ──────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    try {
      const r = await window.storage.list("sessions:");
      if (r?.keys) {
        const sorted = r.keys.sort().reverse();
        const data = await Promise.all(
          sorted.slice(0, 500).map(async (k) => {
            const val = await window.storage.get(k.replace("pomodoro_", ""));
            return val ? JSON.parse(val.value) : null;
          }),
        );
        setHistory(data.filter(Boolean));
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, sessionCount]);

  // ── Volume ref so initYtPlayer can always read the latest value ───────────
  const musicVolumeRef = useRef(musicVolume);
  useEffect(() => {
    musicVolumeRef.current = musicVolume;
  }, [musicVolume]);

  // ── Persist music volume and track selection ──────────────────────────────
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const current = settingsRef.current;
        if (
          current.musicVolume !== musicVolume ||
          current.lastTrackId !== currentTrack.id
        ) {
          const updated = {
            ...current,
            musicVolume,
            lastTrackId: currentTrack.id,
          };
          settingsRef.current = updated;
          await window.storage.set("settings", JSON.stringify(updated));
        }
      } catch {}
    }, 500);
    return () => clearTimeout(t);
  }, [musicVolume, currentTrack.id]);

  // ── Stop all local Howls ───────────────────────────────────────────────────
  const stopAllHowls = useCallback(() => {
    Object.values(howlsRef.current).forEach((h) => {
      try {
        h.stop();
      } catch {}
    });
    if (localProgressRef.current) {
      clearInterval(localProgressRef.current);
      localProgressRef.current = null;
    }
    setLocalCurrentTime(0);
    setLocalDuration(0);
  }, []);

  // ── YouTube Logic ─────────────────────────────────────────────────────────
  const initYtPlayer = useCallback(() => {
    if (ytPlayerRef.current) {
      try {
        ytPlayerRef.current.destroy();
      } catch {}
      ytPlayerRef.current = null;
    }
    setYtPlayer(null);
    setYtVideoTitle("");
    setYtArtist("");
    setYtCurrentTime(0);
    setYtDuration(0);
    setYtUrlError("");

    const ytUrl = settingsRef.current.youtubeUrl;
    if (!isValidYouTubeUrl(ytUrl)) {
      setYtUrlError(
        "Invalid YouTube URL. Please use a valid youtube.com or youtu.be link.",
      );
      setYtLoading(false);
      return;
    }

    // Container must exist and be visible to the iframe API — we hide it offscreen
    const container = document.getElementById("yt-player-hidden");
    if (!container) return;
    // Use textContent-safe method to clear
    while (container.firstChild) container.removeChild(container.firstChild);
    const inner = document.createElement("div");
    inner.id = "yt-player-inner";
    container.appendChild(inner);

    let videoId = "";
    let listId = "";
    try {
      const url = new URL(ytUrl);
      if (url.hostname === "youtu.be") {
        videoId = url.pathname.slice(1);
      } else {
        videoId = url.searchParams.get("v") || "";
      }
      listId = url.searchParams.get("list") || "";
    } catch {
      // Assume raw video ID
      videoId = ytUrl.trim();
    }

    setYtLoading(true);

    new window.YT.Player("yt-player-inner", {
      height: "1",
      width: "1",
      videoId: videoId || undefined,
      playerVars: {
        listType: listId ? "playlist" : undefined,
        list: listId || undefined,
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        enablejsapi: 1,
        origin: window.location.origin,
        rel: 0,
      },
      events: {
        onReady: (event) => {
          ytPlayerRef.current = event.target;
          setYtPlayer(event.target);
          setYtLoading(false);
          try {
            event.target.setVolume(musicVolumeRef.current * 100);
            const d = event.target.getVideoData();
            if (d?.title) setYtVideoTitle(d.title);
            if (d?.author) setYtArtist(d.author);
            const dur = event.target.getDuration();
            if (dur) setYtDuration(dur);
          } catch {}
        },
        onStateChange: (event) => {
          const S = window.YT.PlayerState;
          if (event.data === S.PLAYING) {
            setIsMusicPlaying(true);
            setYtLoading(false);
            try {
              const d = event.target.getVideoData();
              if (d?.title) setYtVideoTitle(d.title);
              if (d?.author) setYtArtist(d.author);
              const dur = event.target.getDuration();
              if (dur) setYtDuration(dur);
            } catch {}
          } else if (event.data === S.PAUSED) {
            setIsMusicPlaying(false);
          } else if (event.data === S.ENDED) {
            event.target.nextVideo
              ? event.target.nextVideo()
              : event.target.playVideo();
          } else if (event.data === S.BUFFERING) {
            setYtLoading(true);
          } else if (event.data === S.CUED) {
            setYtLoading(false);
          }
        },
        onError: (event) => {
          setYtLoading(false);
          const errorCodes = {
            2: "Invalid video ID or URL",
            5: "Video content can't be played in an embedded player",
            100: "Video not found or has been removed",
            101: "Video owner does not allow embedded playback",
            150: "Video owner does not allow embedded playback",
          };
          setYtUrlError(
            errorCodes[event.data] || "YouTube player error occurred",
          );
        },
      },
    });
  }, []); // no deps — reads via refs

  // Load YT API and init player when source is youtube
  useEffect(() => {
    if (settings.musicSource !== "youtube") {
      // Switching away from YT → destroy player
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {}
        ytPlayerRef.current = null;
      }
      setYtPlayer(null);
      setIsMusicPlaying(false);
      setYtUrlError("");
      return;
    }

    // Stop any local audio first
    stopAllHowls();
    setCurrentTrack(
      AMBIANCE_TRACKS.find((t) => t.id === settingsRef.current.lastTrackId) ||
        AMBIANCE_TRACKS[0],
    );
    setIsMusicPlaying(false);

    const tryInit = () => {
      if (window.YT && window.YT.Player) {
        setTimeout(() => initYtPlayer(), 150);
      } else {
        window.onYouTubeIframeAPIReady = () => initYtPlayer();
        if (!document.getElementById("yt-api-script")) {
          const tag = document.createElement("script");
          tag.id = "yt-api-script";
          tag.src = "https://www.youtube.com/iframe_api";
          document.head.appendChild(tag);
        }
      }
    };
    tryInit();

    return () => {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {}
        ytPlayerRef.current = null;
      }
    };
  }, [settings.musicSource, settings.youtubeUrl, initYtPlayer, stopAllHowls]);

  // When switching to local mode — stop YT
  useEffect(() => {
    if (settings.musicSource === "local") {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch {}
      }
    }
  }, [settings.musicSource]);

  // YouTube progress polling
  useEffect(() => {
    if (ytProgressRef.current) {
      clearInterval(ytProgressRef.current);
      ytProgressRef.current = null;
    }
    if (
      isMusicPlaying &&
      settings.musicSource === "youtube" &&
      ytPlayerRef.current
    ) {
      ytProgressRef.current = setInterval(() => {
        try {
          const p = ytPlayerRef.current;
          if (!p || typeof p.getCurrentTime !== "function") return;
          setYtCurrentTime(p.getCurrentTime() || 0);
          const dur = p.getDuration();
          if (dur > 0) setYtDuration(dur);
          const d = p.getVideoData();
          if (d?.title) setYtVideoTitle(d.title);
          if (d?.author) setYtArtist(d.author);
        } catch {}
      }, 1000);
    }
    return () => {
      if (ytProgressRef.current) {
        clearInterval(ytProgressRef.current);
        ytProgressRef.current = null;
      }
    };
  }, [isMusicPlaying, settings.musicSource]);

  // Local progress polling
  useEffect(() => {
    if (localProgressRef.current) {
      clearInterval(localProgressRef.current);
      localProgressRef.current = null;
    }
    if (
      isMusicPlaying &&
      settings.musicSource === "local" &&
      currentTrack.id !== "none"
    ) {
      localProgressRef.current = setInterval(() => {
        try {
          const howl = howlsRef.current[currentTrack.id];
          if (!howl) return;
          const seek = howl.seek();
          if (typeof seek === "number") setLocalCurrentTime(seek);
          const dur = howl.duration();
          if (dur > 0) setLocalDuration(dur);
        } catch {}
      }, 1000);
    }
    return () => {
      if (localProgressRef.current) {
        clearInterval(localProgressRef.current);
        localProgressRef.current = null;
      }
    };
  }, [isMusicPlaying, settings.musicSource, currentTrack.id]);

  // ── Howler cleanup on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (localProgressRef.current) clearInterval(localProgressRef.current);
      if (autoStartRef.current) clearTimeout(autoStartRef.current);
      Object.values(howlsRef.current).forEach((h) => {
        try {
          h.unload();
        } catch {}
      });
    };
  }, []);

  // ── Music controls ─────────────────────────────────────────────────────────
  const toggleMusic = useCallback(() => {
    if (settings.musicSource === "youtube") {
      if (!ytPlayerRef.current) return;
      try {
        if (isMusicPlaying) ytPlayerRef.current.pauseVideo();
        else ytPlayerRef.current.playVideo();
      } catch {}
      return;
    }
    // Local
    let track = currentTrack;
    if (track.id === "none") {
      // Pick first real track if none is selected
      track = AMBIANCE_TRACKS[1];
      setCurrentTrack(track);
    }
    if (!howlerAvailable) return;
    let howl = howlsRef.current[track.id];
    if (!howl) {
      howl = new window.Howl({
        src: [track.url],
        html5: true,
        loop: true,
        volume: musicVolumeRef.current,
        onload: () => {
          setLocalDuration(howl.duration());
        },
      });
      howlsRef.current[track.id] = howl;
    }
    if (isMusicPlaying) {
      howl.pause();
      setIsMusicPlaying(false);
    } else {
      howl.play();
      setIsMusicPlaying(true);
    }
  }, [settings.musicSource, currentTrack, isMusicPlaying]);

  useEffect(() => {
    toggleMusicRef.current = toggleMusic;
  }, [toggleMusic]);

  const ytNextTrack = useCallback(() => {
    try {
      ytPlayerRef.current?.nextVideo();
    } catch {}
  }, []);
  const ytPrevTrack = useCallback(() => {
    try {
      ytPlayerRef.current?.previousVideo();
    } catch {}
  }, []);

  const seekMusic = useCallback(
    (fraction) => {
      if (settings.musicSource === "youtube") {
        if (!ytPlayerRef.current || !ytDuration) return;
        try {
          ytPlayerRef.current.seekTo(fraction * ytDuration, true);
        } catch {}
      } else {
        const howl = howlsRef.current[currentTrack.id];
        if (!howl || !localDuration) return;
        try {
          howl.seek(fraction * localDuration);
          setLocalCurrentTime(fraction * localDuration);
        } catch {}
      }
    },
    [settings.musicSource, ytDuration, currentTrack.id, localDuration],
  );

  const switchTrack = useCallback(
    (track) => {
      if (settings.musicSource === "youtube" || !howlerAvailable) return;
      // Stop & unload previous
      if (howlsRef.current[currentTrack.id]) {
        try {
          howlsRef.current[currentTrack.id].stop();
        } catch {}
      }
      setLocalCurrentTime(0);
      setLocalDuration(0);
      setCurrentTrack(track);
      setIsMusicPlaying(false);
      if (track.id !== "none") {
        const howl = new window.Howl({
          src: [track.url],
          html5: true,
          loop: true,
          volume: musicVolumeRef.current,
          onload: () => {
            setLocalDuration(howl.duration());
          },
        });
        howlsRef.current[track.id] = howl;
        howl.play();
        setIsMusicPlaying(true);
      }
    },
    [settings.musicSource, currentTrack.id],
  );

  // Volume sync
  useEffect(() => {
    if (settings.musicSource === "youtube" && ytPlayerRef.current) {
      try {
        ytPlayerRef.current.setVolume(musicVolume * 100);
      } catch {}
    } else {
      const howl = howlsRef.current[currentTrack.id];
      if (howl)
        try {
          howl.volume(musicVolume);
        } catch {}
    }
  }, [musicVolume, currentTrack.id, settings.musicSource]);

  // ── Session end (BUG FIX: saves actual time spent, not full duration) ─────
  // Also fixed: uses refs for music metadata to avoid stale closures
  const handleSessionEnd = useCallback(async (skipped = false) => {
    const m = modeRef.current;
    const s = settingsRef.current;
    const sub = subjectRef.current;

    // Play appropriate end sound
    if (m === "work") playFocusEnd();
    else playBreakEnd();

    setIsRunning(false);

    if (m === "work") {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const totalDurationSecs = s.workDuration * 60;
      const elapsedSecs = totalDurationSecs - timeLeftRef.current;
      // Only save if at least 30 seconds elapsed (prevent accidental saves)
      const actualMins = Math.round((elapsedSecs / 60) * 100) / 100;
      if (elapsedSecs >= 30 || !skipped) {
        const durationToSave = skipped ? actualMins : s.workDuration;
        // Capture what music was playing for future analytics — use refs for freshness
        const ct = currentTrackRef.current;
        const ytTitle = ytVideoTitleRef.current;
        const ytArt = ytArtistRef.current;
        const currentTasks = focusTasksRef.current;
        const musicMeta =
          s.musicSource === "youtube"
            ? {
                musicSource: "youtube",
                musicTitle: ytTitle || "",
                musicArtist: ytArt || "",
              }
            : ct.id !== "none"
              ? {
                  musicSource: "local",
                  musicTitle: ct.name,
                  musicArtist: ct.artist,
                }
              : { musicSource: "none", musicTitle: "", musicArtist: "" };
        try {
          await window.storage.set(
            `sessions:${dateStr}-${now.getTime()}`,
            JSON.stringify({
              subject: sub,
              duration: durationToSave,
              completedAt: now.toISOString(),
              type: "work",
              tasks: currentTasks.map(t => ({ text: t.text, completed: t.completed })),
              ...musicMeta,
            }),
          );
        } catch {}
        loadTodaySessionCount();
      }
      setPomodoroCount((p) => {
        const next = (p + 1) % 4;
        // Persist pomodoroCount
        const currentSettings = settingsRef.current;
        const updatedSettings = { ...currentSettings, pomodoroCount: next };
        settingsRef.current = updatedSettings;
        window.storage.set("settings", JSON.stringify(updatedSettings));

        if (next === 0) {
          setMode("long");
          setTimeLeft(s.longBreak * 60);
        } else {
          setMode("short");
          setTimeLeft(s.shortBreak * 60);
        }
        return next;
      });
    } else {
      setMode("work");
      setTimeLeft(s.workDuration * 60);
    }

    if (s.autoStart) {
      if (autoStartRef.current) clearTimeout(autoStartRef.current);
      autoStartRef.current = setTimeout(() => {
        playStart();
        setIsRunning(true);
      }, 1000);
    }
  }, []);

  // ── Timer tick ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning) {
      startTimestampRef.current = null;
      return;
    }
    if (startTimestampRef.current === null) {
      startTimestampRef.current = Date.now();
      initialTimeLeftRef.current = timeLeftRef.current;
    }

    const id = setInterval(() => {
      if (settingsRef.current.tickSound) playTick();

      const elapsed = Math.floor((Date.now() - startTimestampRef.current) / 1000);
      const newTimeLeft = Math.max(0, initialTimeLeftRef.current - elapsed);

      setTimeLeft(newTimeLeft);

      if (newTimeLeft <= 0) {
        clearInterval(id);
        handleSessionEnd(false);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning, handleSessionEnd]);

  // ── Space key (BUG FIX: only fires on body, not inputs/buttons) ───────────
  useEffect(() => {
    const h = (e) => {
      if (e.code === "Space" && e.target === document.body && !showSettings) {
        e.preventDefault();
        if (view !== "timer") return; // Only toggle timer from timer view
        setIsRunning((r) => {
          r ? playPause() : playStart();
          return !r;
        });
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [showSettings, view]);

  // ── Escape key closes settings drawer ──────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape" && showSettings) {
        setShowSettings(false);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [showSettings]);

  // ── Document title reflects timer state ────────────────────────────────────
  useEffect(() => {
    if (isRunning) {
      document.title = `${mins}:${secs} — ${MODES[mode].label} | Pomodoro`;
    } else {
      document.title = "Pomodoro Focus App";
    }
  }, [isRunning, mins, secs, mode]);

  useEffect(() => {
    return () => {
      document.title = "Pomodoro Focus App";
    };
  }, []);

  // ── Scroll selected subject to center ─────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!scrollRef.current) return;
      const container = scrollRef.current;
      const activeItem = container.querySelector(".subj-pill.active");
      if (activeItem) {
        const center = container.offsetWidth / 2;
        const itemCenter = activeItem.offsetLeft + activeItem.offsetWidth / 2;
        container.scrollTo({ left: itemCenter - center, behavior: "smooth" });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [subject, isAddingCustom, allSubjects.length]);

  // ── Mode switch — blocked while running ────────────────────────────────────
  const switchMode = (m) => {
    if (isRunning) {
      setLockedNotice(true);
      if (lockedTimerRef.current) clearTimeout(lockedTimerRef.current);
      lockedTimerRef.current = setTimeout(() => setLockedNotice(false), 2000);
      return;
    }
    setMode(m);
    startTimestampRef.current = null;
    setTimeLeft(settings[MODES[m].key] * 60);
  };

  const resetTimer = () => {
    if (isRunning) playPause();
    setIsRunning(false);
    startTimestampRef.current = null;
    setTimeLeft(settings[MODES[mode].key] * 60);
  };

  const addFiveMinutes = () => {
    setTimeLeft((t) => Math.min(t + 300, settings.workDuration * 60 + 600));
  };

  const skipBreak = () => {
    if (mode === "work") return;
    setIsRunning(false);
    setTimeLeft(settings.workDuration * 60);
    setMode("work");
  };

  const toggleRunning = () => {
    const willRun = !isRunning;
    if (willRun) {
      playStart();
      startTimestampRef.current = Date.now();
      initialTimeLeftRef.current = timeLeft;
      if (settings.autoPlayMusic && !isMusicPlaying) {
        // slight delay so state is settled before playing
        setTimeout(() => {
          if (toggleMusicRef.current) toggleMusicRef.current();
        }, 80);
      }
    } else {
      playPause();
      startTimestampRef.current = null;
    }
    setIsRunning(willRun);
  };

  // ── Settings save ──────────────────────────────────────────────────────────
  const saveSettings = async () => {
    const s = { ...settingsInput };
    ["workDuration", "shortBreak", "longBreak"].forEach((k) => {
      s[k] = Math.max(1, Math.min(120, parseInt(s[k]) || 1));
    });
    // Preserve runtime persisted values
    s.musicVolume = musicVolume;
    s.lastTrackId = currentTrack.id;
    s.focusTasks = focusTasks;
    // Validate youtube URL if youtube is selected
    if (s.musicSource === "youtube" && s.youtubeUrl) {
      if (!isValidYouTubeUrl(s.youtubeUrl)) {
        setYtUrlError("Invalid YouTube URL. Please check and try again.");
        // Still save other settings but flag the error
      } else {
        setYtUrlError("");
      }
    }
    // Sanitize custom subjects
    s.customSubjects = (s.customSubjects || []).map((subj) =>
      subj.trim().slice(0, 30),
    );
    setSettings(s);
    try {
      await window.storage.set("settings", JSON.stringify(s));
    } catch {}
    setTimeLeft(s[MODES[mode].key] * 60);
    setIsRunning(false);
    setShowSettings(false);
  };

  // ── Custom subject management ──────────────────────────────────────────────
  const addCustomSubject = async (fromMain = false) => {
    const val = newSubjectInput.trim().slice(0, 30);
    if (!val) {
      if (fromMain) setIsAddingCustom(false);
      return;
    }

    const all = [...DEFAULT_SUBJECTS, ...(settings.customSubjects || [])];
    if (all.length >= 20) {
      // Cap at 20 subjects max
      if (fromMain) setIsAddingCustom(false);
      return;
    }
    if (all.map((s) => s.toLowerCase()).includes(val.toLowerCase())) {
      setSubject(all.find((s) => s.toLowerCase() === val.toLowerCase()));
      setNewSubjectInput("");
      if (fromMain) setIsAddingCustom(false);
      return;
    }

    const newSettings = {
      ...settings,
      customSubjects: [...(settings.customSubjects || []), val],
    };
    setSettings(newSettings);
    setSettingsInput(newSettings);
    setSubject(val);
    setNewSubjectInput("");
    if (fromMain) setIsAddingCustom(false);

    try {
      await window.storage.set("settings", JSON.stringify(newSettings));
    } catch {}
  };

  const removeCustomSubject = async (subj) => {
    const newCustomSubjects = (settings.customSubjects || []).filter(
      (x) => x !== subj,
    );
    const newSettings = { ...settings, customSubjects: newCustomSubjects };
    setSettings(newSettings);
    setSettingsInput((s) => ({ ...s, customSubjects: newCustomSubjects }));
    if (subject === subj) setSubject(DEFAULT_SUBJECTS[0]);
    try {
      await window.storage.set("settings", JSON.stringify(newSettings));
    } catch {}
  };

  const applyPreset = (preset) => {
    setSettingsInput((s) => ({
      ...s,
      workDuration: preset.workDuration,
      shortBreak: preset.shortBreak,
      longBreak: preset.longBreak,
    }));
  };

  // ── Data management helpers (clear today / all) ────────────────────────────
  const clearTodayData = async () => {
    if (isClearingRef.current) return;
    const todayLabel = new Date().toLocaleDateString();
    setConfirmConfig({
      message: `Clear all sessions logged for today (${todayLabel})? This cannot be undone.`,
      onConfirm: async () => {
        isClearingRef.current = true;
        setIsClearingData(true);
        try {
          const todayIso = new Date().toISOString().slice(0, 10);
          const r = await window.storage.list(`sessions:${todayIso}`);
          const keys = (r && r.keys) || [];
          if (typeof window.storage.remove === "function") {
            await Promise.all(
              keys.map((k) =>
                window.storage.remove(k.replace("pomodoro_", "")),
              ),
            );
          } else if (typeof localStorage !== "undefined") {
            keys.forEach((k) => {
              try {
                localStorage.removeItem(k);
              } catch {}
            });
          }
          // Refresh in‑memory history and today count
          setHistory((prev) =>
            prev.filter(
              (s) =>
                !s.completedAt ||
                !s.completedAt.startsWith(todayIso) ||
                s.type !== "work",
            ),
          );
          setSessionCount(0);
        } catch {
          // ignore and fall through
        } finally {
          isClearingRef.current = false;
          setIsClearingData(false);
        }
      },
    });
  };

  const clearAllData = async () => {
    if (isClearingRef.current) return;
    setConfirmConfig({
      message: "Clear ALL saved sessions and settings on this device? This cannot be undone.",
      onConfirm: async () => {
        isClearingRef.current = true;
        setIsClearingData(true);
        try {
          const r = await window.storage.list("sessions:");
          const keys = (r && r.keys) || [];
          if (typeof window.storage.remove === "function") {
            await Promise.all(
              keys.map((k) =>
                window.storage.remove(k.replace("pomodoro_", "")),
              ),
            );
            await window.storage.remove("settings");
          } else if (typeof localStorage !== "undefined") {
            keys.forEach((k) => {
              try {
                localStorage.removeItem(k);
              } catch {}
            });
            try {
              localStorage.removeItem("pomodoro_settings");
            } catch {}
          }
          // Reset in‑memory state
          setHistory([]);
          setSessionCount(0);
          setSettings(DEFAULT_SETTINGS);
          setSettingsInput(DEFAULT_SETTINGS);
          setTimeLeft(DEFAULT_SETTINGS.workDuration * 60);
          setMode("work");
          setSubject(DEFAULT_SUBJECTS[0]);
        } catch {
          // ignore and fall through
        } finally {
          isClearingRef.current = false;
          setIsClearingData(false);
        }
      },
    });
  };

  // ── Format time helper ─────────────────────────────────────────────────────
  const fmtTime = useCallback((seconds) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }, []);

  // ── Shared Music Player Card (used for both local & YT) ───────────────────
  const isYt = settings.musicSource === "youtube";
  const trackTitle = isYt
    ? ytVideoTitle || (ytLoading ? "Loading..." : "YouTube Player")
    : currentTrack.id === "none"
      ? "No track"
      : currentTrack.name;
  const trackArtist = isYt ? ytArtist || "YouTube" : currentTrack.artist || "";
  const currentTimeSec = isYt ? ytCurrentTime : localCurrentTime;
  const durationSec = isYt ? ytDuration : localDuration;
  const isLoading = isYt && ytLoading;

  // Music is "active" if something is playing or a non-none source is set up
  const hasMusicActive =
    isMusicPlaying ||
    (isYt && ytPlayer) ||
    (!isYt && currentTrack.id !== "none");

  if (!loaded)
    return <div style={{ background: "#080808", height: "100vh" }} />;

  return (
    <div
      className="pomodoro-app-container"
      style={{
        minHeight: "100vh",
        background: amb.bg,
        color: "#d8d8d8",
        fontFamily: "'Syne', sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: view === "timer" ? "hidden" : "auto",
        transition: "background 1.4s ease",
        "--accent": accent,
        "--accent-glow": accent + "aa",
        "--accent-glow-op": accent + "33",
      }}
    >
      {/* ── Splash Screen ── */}
      {isSplashActive && (
        <div className="splash-screen">
          <div className="splash-logo" style={{ "--accent": ACCENT.work }}>FOCUS</div>
          <div className="splash-progress">
            <div className="splash-progress-bar" style={{ "--accent": ACCENT.work }}></div>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@200;300;400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .pomodoro-app-container {
          transition: background 1.4s ease;
        }

        .chrome {
          transition: opacity 0.4s ease;
        }
        .chrome:hover {
          opacity: 1 !important;
        }

        @keyframes splash-out {
          0% { opacity: 1; visibility: visible; }
          90% { opacity: 0; visibility: visible; }
          100% { opacity: 0; visibility: hidden; }
        }

        .splash-screen {
          position: fixed;
          inset: 0;
          background: #080808;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          animation: splash-out 0.8s ease 1.6s forwards;
        }

        .splash-logo {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 24px;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: #d8d8d8;
          animation: fadeUp 0.6s ease forwards;
        }

        .splash-progress {
          width: 40px;
          height: 1px;
          background: #1a1a1a;
          margin-top: 24px;
          position: relative;
          overflow: hidden;
        }

        .splash-progress-bar {
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          background: var(--accent);
          width: 0;
          animation: splash-progress 1.4s cubic-bezier(0.4, 0, 0.2, 1) 0.2s forwards;
        }

        @keyframes splash-progress {
          0% { width: 0; }
          100% { width: 100%; }
        }

        .view-transition {
          transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .focus-grid {
          display: grid;
          grid-template-columns: 1fr 1.5fr 1fr;
          gap: 40px;
          width: 100%;
          max-width: 1200px;
          height: calc(100vh - 160px);
          align-items: center;
          padding: 0 40px;
        }

        @media (max-width: 1000px) {
          .focus-grid {
            grid-template-columns: 1fr;
            height: auto;
            gap: 32px;
            padding: 20px;
          }
          .focus-side-panel { display: none; }
        }

        .focus-side-panel {
          display: flex;
          flex-direction: column;
          gap: 20px;
          height: 100%;
          justify-content: center;
        }

        .task-list-container {
          background: #0d0d0d;
          border: 1px solid #181818;
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-height: 280px;
          overflow: hidden;
        }

        .task-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 0;
          border-bottom: 1px solid #141414;
          transition: all 0.2s;
          position: relative;
        }
        .task-item:last-child { border-bottom: none; }
        .task-item:hover .task-delete { opacity: 0.6; }

        .task-input {
          background: transparent;
          border: none;
          color: #888;
          font-family: 'Syne', sans-serif;
          font-size: 13px;
          flex: 1;
          outline: none;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .task-input:focus { color: #d8d8d8; white-space: normal; overflow: visible; }
        .task-input.completed { text-decoration: line-through; color: #333; }

        .task-checkbox {
          width: 16px;
          height: 16px;
          border: 1px solid #222;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .task-checkbox.completed {
          background: var(--accent);
          border-color: var(--accent);
        }

        .task-delete {
          opacity: 0;
          background: none;
          border: none;
          color: #444;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          transition: all 0.2s;
        }
        .task-delete:hover { color: #e85b5b; opacity: 1 !important; }

        .stats-summary-container {
          background: #0d0d0d;
          border: 1px solid #181818;
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        @media (max-width: 800px) {
          .focus-grid {
            display: flex;
            flex-direction: column;
            height: auto;
            gap: 20px;
            padding: 20px 15px;
            overflow-y: visible;
            align-items: center;
          }
          .focus-side-panel { 
            display: flex; 
            width: 100%; 
            height: auto;
            justify-content: flex-start;
          }
          /* Re-order: Timer first, then Stats, then Tasks */
          .focus-grid > div:nth-child(1) { order: 2; } /* Left panel (Stats) */
          .focus-grid > div:nth-child(2) { order: 1; width: 100%; } /* Middle (Timer) */
          .focus-grid > div:nth-child(3) { order: 3; } /* Right panel (Tasks) */
          
          .view-transition { 
            padding: 70px 10px 40px !important; 
            height: auto;
            min-height: 100vh;
            overflow-y: auto;
          }
          .stats-card { grid-template-columns: 1fr !important; }
          .heatmap-cell { min-width: 10px; }
          
          /* Scale down timer ring slightly for small phones */
          svg { transform: scale(0.9) rotate(-90deg); }
          .subj-scroll-container { max-width: 100%; padding: 10px 40px; }
        }

        .btn-mode {
          background: none; border: none; cursor: pointer;
          padding: 5px 14px; border-radius: 4px;
          font-family: 'Syne', sans-serif; font-size: 11px;
          font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;
          transition: color 0.25s;
        }
        .btn-icon {
          background: none; border: none; cursor: pointer;
          padding: 6px; display: flex; align-items: center;
          transition: color 0.2s; border-radius: 3px;
        }
        .btn-primary {
          border: none; cursor: pointer; border-radius: 3px;
          font-family: 'Syne', sans-serif; font-weight: 700;
          font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase;
          transition: opacity 0.15s, transform 0.1s;
        }
        .btn-primary:hover { opacity: 0.85; transform: translateY(-1px); }
        .btn-primary:active { transform: translateY(0); opacity: 0.7; }

        .subj-pill {
          display: flex; align-items: center; gap: 6px;
          background: #0d0d0d; border: 1px solid #1c1c1c;
          border-radius: 20px; padding: 6px 16px;
          font-family: 'Syne', sans-serif; font-size: 11px;
          font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
          cursor: pointer; color: #444;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          white-space: nowrap;
          scroll-snap-align: center;
          flex-shrink: 0;
        }
        .subj-pill:hover { color: #888; border-color: #2e2e2e; transform: translateY(-1px); }
        .subj-pill.active {
          color: #d8d8d8;
          border-color: var(--accent-glow);
          background: #121212;
          box-shadow: 0 0 15px var(--accent-glow-op);
          transform: scale(1.05);
        }
        .subj-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; transition: background 0.3s; }

        .subj-scroll-container {
          display: flex; gap: 10px; padding: 10px 180px;
          overflow-x: auto; scroll-snap-type: x mandatory;
          width: 100%; max-width: 480px;
          scrollbar-width: none; -ms-overflow-style: none;
          mask-image: linear-gradient(to right, transparent, black 25%, black 75%, transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, black 25%, black 75%, transparent);
          position: relative;
          user-select: none;
          transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .subj-scroll-container.is-running {
          padding: 10px 0;
          mask-image: none;
          -webkit-mask-image: none;
          justify-content: center;
          overflow: visible;
        }
        .subj-scroll-container::-webkit-scrollbar { display: none; }

        .toggle {
          width: 30px; height: 16px; border-radius: 8px;
          border: none; cursor: pointer; position: relative;
          transition: background 0.25s; flex-shrink: 0;
        }
        .toggle-knob {
          position: absolute; top: 2px;
          width: 12px; height: 12px; border-radius: 50%;
          background: #080808; transition: left 0.2s;
        }

        .settings-drawer {
          position: fixed; top: 0; right: 0;
          height: 100vh; width: 270px;
          background: #0c0c0c; border-left: 1px solid #191919;
          padding: 28px 22px 28px; z-index: 100;
          transform: translateX(100%); transition: transform 0.28s ease;
          display: flex; flex-direction: column; gap: 18px;
          overflow-y: auto;
        }
        .settings-drawer.open { transform: translateX(0); }
        .settings-drawer::-webkit-scrollbar { width: 3px; }
        .settings-drawer::-webkit-scrollbar-track { background: transparent; }
        .settings-drawer::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 2px; }

        .s-label { font-size: 10px; color: #555; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
        .s-row { display: flex; justify-content: space-between; align-items: center; }
        .s-name { font-size: 12px; color: #404040; font-weight: 500; }
        .s-hint { font-size: 10px; color: #282828; margin-top: 2px; }
        .s-divider { border: none; border-top: 1px solid #141414; }

        .s-input {
          background: #080808; border: 1px solid #1c1c1c; color: #aaa;
          padding: 7px 10px; border-radius: 3px;
          font-family: 'JetBrains Mono', monospace; font-size: 13px;
          width: 62px; text-align: center; transition: border-color 0.2s;
          -moz-appearance: textfield;
        }
        .s-input::-webkit-inner-spin-button,
        .s-input::-webkit-outer-spin-button { -webkit-appearance: none; }
        .s-input:focus { outline: none; }

        .s-text-input {
          flex: 1; background: #080808; border: 1px solid #1c1c1c; color: #aaa;
          padding: 7px 10px; border-radius: 3px;
          font-family: 'Syne', sans-serif; font-size: 12px;
          transition: border-color 0.2s;
        }
        .s-text-input:focus { outline: none; border-color: #333; }
        .s-text-input::placeholder { color: #2a2a2a; }

        .s-add-btn {
          background: #141414; border: 1px solid #1e1e1e;
          color: #444; padding: 7px 12px; border-radius: 3px;
          font-family: 'Syne', sans-serif; font-size: 11px;
          font-weight: 600; cursor: pointer; white-space: nowrap;
          transition: color 0.2s, border-color 0.2s;
        }
        .s-add-btn:hover { color: #777; border-color: #2e2e2e; }

        .s-subj-tag {
          display: flex; align-items: center; justify-content: space-between;
          padding: 5px 10px; background: #0d0d0d;
          border: 1px solid #181818; border-radius: 3px;
        }
        .s-subj-remove {
          background: none; border: none; cursor: pointer;
          color: #2a2a2a; display: flex; align-items: center;
          transition: color 0.15s; padding: 2px;
        }
        .s-subj-remove:hover { color: #666; }
        .s-subj-default {
          padding: 5px 10px; background: #090909;
          border: 1px solid #151515; border-radius: 3px;
          font-size: 11px; color: #2e2e2e; letter-spacing: 0.04em;
        }

        .s-error {
          font-size: 9px; color: #e85b5b; letter-spacing: 0.04em;
          margin-top: 2px; animation: fadeUp 0.2s ease;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.45s ease forwards; }

        @keyframes breathe {
          0%,100% { opacity: 0.4; }
          50%      { opacity: 1; }
        }

        @keyframes pulse-dot {
          0%,100% { opacity: 0.4; }
          50%      { opacity: 1; }
        }

        @keyframes marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        .lock-toast {
          position: fixed; top: 58px; left: 50%;
          transform: translateX(-50%);
          background: #111; border: 1px solid #232323;
          border-radius: 4px; padding: 6px 16px;
          font-size: 10px; color: #484848;
          letter-spacing: 0.1em; text-transform: uppercase;
          pointer-events: none; z-index: 200;
          animation: fadeUp 0.2s ease;
        }

        /* ── Music Player Card (shared local + YT) ── */
        .music-player {
          display: flex; flex-direction: column; align-items: stretch; gap: 0;
          background: #0d0d0d; border: 1px solid #181818;
          border-radius: 14px; padding: 0;
          margin-top: 10px; opacity: var(--music-op, 1);
          transition: all 0.4s ease;
          width: 320px; max-width: 90vw;
          overflow: hidden;
        }

        .mp-track-info {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 16px 6px; min-height: 48px;
        }

        .mp-icon {
          width: 30px; height: 30px; border-radius: 6px;
          background: #141414; border: 1px solid #1e1e1e;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        .mp-text { flex: 1; overflow: hidden; min-width: 0; }

        .mp-title {
          font-size: 11px; font-weight: 600; color: #888;
          letter-spacing: 0.02em; white-space: nowrap; overflow: hidden;
          display: block; position: relative;
        }
        .mp-title-inner { display: inline-block; }
        .mp-title.scrolling .mp-title-inner { animation: marquee 12s linear infinite; padding-right: 60px; }

        .mp-subtitle {
          font-size: 9px; color: #2e2e2e; margin-top: 2px;
          letter-spacing: 0.06em; text-transform: uppercase;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        /* Track selector row (local only) */
        .mp-track-row {
          display: flex; align-items: center; gap: 2px;
          padding: 4px 12px; overflow-x: auto;
          scrollbar-width: none;
        }
        .mp-track-row::-webkit-scrollbar { display: none; }

        .mp-track-btn {
          background: none; border: 1px solid transparent; cursor: pointer;
          color: #383838; font-size: 9px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.05em;
          padding: 3px 8px; border-radius: 10px; transition: all 0.2s;
          white-space: nowrap; flex-shrink: 0;
        }
        .mp-track-btn.active { color: var(--accent); border-color: var(--accent-glow); background: #121212; }
        .mp-track-btn:hover:not(.active) { color: #777; }

        /* Progress bar */
        .mp-progress {
          display: flex; align-items: center; gap: 8px;
          padding: 2px 16px 4px;
        }
        .mp-progress-track {
          flex: 1; height: 3px; background: #1a1a1a;
          border-radius: 2px; cursor: pointer; position: relative;
          transition: height 0.15s;
        }
        .mp-progress-track:hover { height: 5px; }
        .mp-progress-fill {
          position: absolute; top: 0; left: 0; height: 100%;
          border-radius: 2px; transition: width 0.9s linear;
        }
        .mp-time {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px; color: #252525;
          min-width: 28px; text-align: center; flex-shrink: 0;
        }

        /* Controls row */
        .mp-controls {
          display: flex; align-items: center; justify-content: center;
          gap: 6px; padding: 4px 16px 10px;
        }
        .mp-ctrl-btn {
          background: none; border: none; cursor: pointer;
          color: #363636; padding: 5px; display: flex;
          align-items: center; justify-content: center;
          border-radius: 50%; transition: all 0.2s;
        }
        .mp-ctrl-btn:hover { color: #888; }
        .mp-play-btn {
          width: 34px; height: 34px;
          background: #161616; border: 1px solid #262626;
          border-radius: 50%; cursor: pointer; display: flex;
          align-items: center; justify-content: center;
          transition: all 0.2s; color: #555;
        }
        .mp-play-btn:hover { border-color: #444; color: #aaa; }
        .mp-vol-row {
          display: flex; align-items: center; gap: 6px;
        }

        .volume-slider {
          -webkit-appearance: none; width: 58px; height: 2px;
          background: #1a1a1a; border-radius: 1px; outline: none;
        }
        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none; width: 8px; height: 8px;
          border-radius: 50%; background: #444; cursor: pointer;
          transition: background 0.2s;
        }
        .volume-slider::-webkit-slider-thumb:hover { background: var(--accent); }

        /* Stats Dashboard Specific */
        .stats-card {
          background: #0d0d0d; border: 1px solid #181818;
          border-radius: 8px; padding: 20px;
          display: flex; flex-direction: column; gap: 12px;
          position: relative;
        }
        @media (max-width: 600px) {
          .stats-card { padding: 15px; }
          .stats-value { font-size: 20px; }
          .heatmap-cell { min-width: 6px; }
        }
        .stats-title { font-size: 11px; font-weight: 700; color: #444; text-transform: uppercase; letter-spacing: 0.1em; }
        .stats-value { font-size: 24px; font-weight: 300; color: #d8d8d8; font-family: 'JetBrains Mono', monospace; }
        .stats-label { font-size: 10px; color: #2a2a2a; text-transform: uppercase; letter-spacing: 0.05em; }

        .heatmap { 
          display: grid; 
          gap: 2px; 
          width: 100%; 
          min-width: 0;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .heatmap::-webkit-scrollbar { display: none; }
        .heatmap-cell { 
          aspect-ratio: 1/1; 
          border-radius: 1px; 
          background: #111; 
          min-width: 8px;
        }
        .heatmap-cell.level-1 { background: var(--h-level-1, #0e4429); }
        .heatmap-cell.level-2 { background: var(--h-level-2, #006d32); }
        .heatmap-cell.level-3 { background: var(--h-level-3, #26a641); }
        .heatmap-cell.level-4 { background: var(--h-level-4, #39d353); }

        .btn-stats-tab {
          background: #111; border: 1px solid #222; color: #555;
          padding: 4px 12px; border-radius: 4px; font-size: 10px;
          text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer;
          transition: all 0.2s;
        }
        .btn-stats-tab.active { background: #222; border-color: #444; color: #d8d8d8; }

        .peak-stat {
          display: flex; align-items: baseline; gap: 8px;
        }
        .peak-hour { font-size: 18px; color: #d8d8d8; font-family: 'JetBrains Mono', monospace; }
        .peak-count { font-size: 11px; color: #444; }

        /* Mini player in stats view */
        .mini-music-player {
          font-family: 'Syne', sans-serif;
        }
      `}</style>

      {/* Breathing bg glow for breaks */}
      {amb.breathe && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            background: `radial-gradient(ellipse 65% 55% at 50% 50%, ${accent}1a 0%, transparent 70%)`,
            animation: `breathe ${amb.bspeed} ease-in-out infinite`,
          }}
        />
      )}

      {lockedNotice && (
        <div className="lock-toast">Stop timer to switch mode</div>
      )}

      {/* ── Top bar ── */}
      <div
        className="chrome"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 28px",
          zIndex: 10,
          opacity: chromeOp,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.2em",
                color: "#3a3a3a",
                textTransform: "uppercase",
              }}
            >
              Pomodoro
            </span>
            <span
              style={{
                fontSize: 9,
                color: "#222",
                fontWeight: 500,
                marginTop: 2,
              }}
            >
              {new Date().toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              background: "#0d0d0d",
              border: "1px solid #181818",
              borderRadius: 4,
              padding: 2,
            }}
          >
            <button
              onClick={() => handleViewChange("timer")}
              style={{
                background: view === "timer" ? "#1a1a1a" : "transparent",
                border: "none",
                padding: "4px 10px",
                borderRadius: 3,
                color: view === "timer" ? "#d8d8d8" : "#333",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.1em",
                cursor: "pointer",
                textTransform: "uppercase",
                transition: "all 0.2s",
              }}
            >
              Focus
            </button>
            <button
              onClick={() => handleViewChange("stats")}
              style={{
                background: view === "stats" ? "#1a1a1a" : "transparent",
                border: "none",
                padding: "4px 10px",
                borderRadius: 3,
                color: view === "stats" ? "#d8d8d8" : "#333",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.1em",
                cursor: "pointer",
                textTransform: "uppercase",
                transition: "all 0.2s",
              }}
            >
              Stats
            </button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Show running timer badge when on stats tab */}
          {view === "stats" && isRunning && (
            <button
              onClick={() => handleViewChange("timer")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "#0d0d0d",
                border: "1px solid " + accent + "44",
                borderRadius: 20,
                padding: "3px 10px",
                cursor: "pointer",
                animation: "breathe 2s ease-in-out infinite",
              }}
              title="Timer is running — click to go back"
            >
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: accent,
                  animation: "pulse-dot 1s ease infinite",
                }}
              />
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  color: accent,
                  letterSpacing: "0.05em",
                }}
              >
                {mins}:{secs}
              </span>
            </button>
          )}
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: "#3a3a3a",
            }}
          >
            {sessionCount} <span style={{ color: "#282828" }}>today</span>
          </span>
          <button
            className="btn-icon"
            style={{ color: "#3a3a3a" }}
            onClick={() => setShowSettings((v) => !v)}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── YT hidden iframe container — positioned offscreen, NOT display:none
           MOVED OUTSIDE view conditional so it persists across tab switches ── */}
      <div
        id="yt-player-hidden"
        style={{
          position: "fixed",
          left: "-9999px",
          top: 0,
          width: 1,
          height: 1,
          overflow: "hidden",
          visibility: "hidden",
          pointerEvents: "none",
          zIndex: -1,
        }}
      />

      {/* ── Main View Switcher ── */}
      <div
        className="view-transition"
        style={{
          width: "100%",
          maxWidth: view === "stats" ? 800 : "unset",
          padding: view === "timer" ? "80px 0 40px" : "80px 20px 40px",
          opacity: (isSplashActive || isChangingView) ? 0 : 1,
          transform: (isSplashActive || isChangingView) ? "translateY(20px)" : "translateY(0)",
          display: "flex",
          justifyContent: "center",
          margin: "0 auto",
        }}
      >
        {view === "timer" ? (
          <div className="focus-grid fade-up">
            {/* Left Column: Stats Summary */}
            <div className="focus-side-panel chrome" style={{ opacity: chromeOp, width: "100%", maxWidth: 280 }}>
              <div className="stats-summary-container" style={{ width: "100%" }}>
                <span className="stats-title">Today's Progress</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span className="stats-label">Sessions</span>
                    <span className="stats-value" style={{ fontSize: 20 }}>{sessionCount}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span className="stats-label">Time</span>
                    <span className="stats-value" style={{ fontSize: 20 }}>
                      {Math.floor(history.filter(s => s.completedAt.startsWith(new Date().toISOString().slice(0, 10)) && s.type === "work").reduce((acc, s) => acc + (parseFloat(s.duration) || 0), 0) / 60)}h {Math.round(history.filter(s => s.completedAt.startsWith(new Date().toISOString().slice(0, 10)) && s.type === "work").reduce((acc, s) => acc + (parseFloat(s.duration) || 0), 0) % 60)}m
                    </span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <span className="stats-label" style={{ display: "block", marginBottom: 8 }}>Recent Subjects</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(() => {
                        const workHistory = history.filter(s => s.type === "work");
                        const recent = Array.from(new Set(workHistory.slice(0, 20).map(s => s.subject))).slice(0, 3);
                        return recent.length > 0 ? recent.map(s => (
                          <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span className="subj-dot" style={{ background: subjectDot(s), width: 4, height: 4 }} />
                            <span style={{ fontSize: 10, color: "#555", textTransform: "uppercase" }}>{s}</span>
                          </div>
                        )) : <span style={{ fontSize: 9, color: "#222" }}>No sessions yet</span>;
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Middle Column: Timer & Quote */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 24,
                zIndex: 1,
                height: "100%",
                justifyContent: "center",
              }}
            >
              {/* Quote at Top */}
              <div
                className="chrome"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  opacity: isRunning ? 0.05 : 0.8,
                  maxWidth: 380,
                  textAlign: "center",
                  transition: "opacity 0.8s ease",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    fontStyle: "italic",
                    fontSize: 12,
                    color: "#d8d8d8",
                    lineHeight: 1.5,
                    fontFamily: "'Syne', sans-serif",
                    fontWeight: 400,
                  }}
                >
                  "{currentQuote.text}"
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: accent,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    fontWeight: 700,
                  }}
                >
                  — {currentQuote.author}
                </div>
              </div>

              {/* Mode tabs */}
              <div
                className="chrome"
                style={{
                  display: "flex",
                  gap: 2,
                  background: "#0d0d0d",
                  border: "1px solid #181818",
                  borderRadius: 5,
                  padding: 3,
                  opacity: chromeOp,
                }}
              >
                {Object.entries(MODES).map(([k, { label }]) => (
                  <button
                    key={k}
                    className="btn-mode"
                    style={{ color: mode === k ? accent : "#2e2e2e" }}
                    onClick={() => switchMode(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Ring */}
              <div style={{ position: "relative", width: 240, height: 240 }}>
                <svg
                  width="240"
                  height="240"
                  style={{ transform: "rotate(-90deg)" }}
                >
                  <defs>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation={amb.glowBlur} result="b" />
                      <feMerge>
                        <feMergeNode in="b" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <circle
                    cx="120"
                    cy="120"
                    r={R - 10}
                    fill="none"
                    stroke="#141414"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx="120"
                    cy="120"
                    r={R - 10}
                    fill="none"
                    stroke={accent}
                    strokeWidth="2"
                    strokeDasharray={2 * Math.PI * (R - 10)}
                    strokeDashoffset={2 * Math.PI * (R - 10) * (1 - progress)}
                    opacity={amb.glowOp}
                    filter="url(#glow)"
                    style={{
                      transition:
                        "stroke-dashoffset 1s linear, stroke 0.6s, opacity 0.8s",
                    }}
                  />
                  <circle
                    cx="120"
                    cy="120"
                    r={R - 10}
                    fill="none"
                    stroke={accent}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * (R - 10)}
                    strokeDashoffset={2 * Math.PI * (R - 10) * (1 - progress)}
                    style={{
                      transition: "stroke-dashoffset 1s linear, stroke 0.6s",
                    }}
                  />
                </svg>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 52,
                      fontWeight: 200,
                      letterSpacing: "-0.03em",
                      color: "#e0e0e0",
                      lineHeight: 1,
                      userSelect: "none",
                    }}
                  >
                    <span>{mins}</span>
                    <span style={{ color: "#252525", fontSize: 38 }}>:</span>
                    <span>{secs}</span>
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      color: "#2e2e2e",
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      fontWeight: 600,
                    }}
                  >
                    {MODES[mode].label}
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <button
                  className="btn-icon chrome"
                  style={{ color: "#2e2e2e", opacity: chromeOp }}
                  onClick={resetTimer}
                  aria-label="Reset timer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </button>

                <button
                  className="btn-primary"
                  onClick={toggleRunning}
                  style={{
                    background: accent,
                    color: "#080808",
                    padding: "12px 48px",
                  }}
                >
                  {isRunning ? "Pause" : timeLeft === settings[MODES[mode].key] * 60 ? "Start" : "Resume"}
                </button>

                <button
                  className="btn-icon chrome"
                  style={{ color: "#2e2e2e", opacity: chromeOp }}
                  onClick={() => isRunning && handleSessionEnd(true)}
                  aria-label="Skip session"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polygon points="5 4 15 12 5 20 5 4" />
                    <line x1="19" y1="5" x2="19" y2="19" />
                  </svg>
                </button>
              </div>

              {/* Subject selector */}
              {mode === "work" && (
                <div
                  ref={scrollRef}
                  className={`subj-scroll-container ${isRunning ? "is-running" : ""}`}
                  style={{ opacity: subjectOp, transition: "all 0.6s ease" }}
                >
                  {allSubjects.map((s) => {
                    const isActive = subject === s;
                    if (isRunning && !isActive) return null;
                    return (
                      <button
                        key={s}
                        className={`subj-pill ${isActive ? "active" : ""}`}
                        style={{
                          ...(isActive ? { "--accent-glow": subjectDot(s) + "aa", "--accent-glow-op": subjectDot(s) + "33" } : {}),
                        }}
                        onClick={() => !isRunning && setSubject(s)}
                      >
                        <span className="subj-dot" style={{ background: isActive ? subjectDot(s) : "#2a2a2a" }} />
                        {s}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Task List */}
            <div className="focus-side-panel chrome" style={{ opacity: chromeOp, width: "100%", maxWidth: 280 }}>
              <div className="task-list-container" style={{ width: "100%" }}>
                <span className="stats-title">Focus Tasks</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {focusTasks.map((task, index) => (
                    <div key={task.id} className="task-item">
                      <div
                        className={`task-checkbox ${task.completed ? "completed" : ""}`}
                        onClick={() => handleToggleTask(task.id)}
                      >
                        {task.completed && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="4">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <input
                        className={`task-input ${task.completed ? "completed" : ""}`}
                        placeholder={index === 0 ? "Focus task..." : "Next task..."}
                        value={task.text}
                        onChange={(e) => handleTaskChange(task.id, e.target.value)}
                        onKeyDown={(e) => handleTaskKeyDown(e, task.id, index)}
                      />
                      {focusTasks.length > 1 && (
                        <button className="task-delete" onClick={() => handleRemoveTask(task.id)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                  {focusTasks.length < 5 && focusTasks[focusTasks.length - 1].text.trim() && (
                    <button
                      onClick={handleAddTask}
                      style={{
                        background: "none",
                        border: "1px dashed #141414",
                        color: "#333",
                        fontSize: 10,
                        padding: "6px",
                        borderRadius: 4,
                        cursor: "pointer",
                        marginTop: 4,
                        textAlign: "center"
                      }}
                    >
                      + Add Task
                    </button>
                  )}
                </div>
              </div>

              {/* Music Player Card Integrated below tasks */}
              <div className="music-player" style={{ width: "100%", maxWidth: 280, marginTop: 0, opacity: chromeOp }}>
                <div className="mp-track-info" style={{ padding: "10px 14px 8px" }}>
                  <div className="mp-icon" style={{ width: 24, height: 24 }}>
                    {isLoading ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" style={{ animation: "breathe 1.2s ease-in-out infinite" }}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                    ) : isMusicPlaying ? (
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: 10 }}>
                        {[6, 10, 5].map((h, i) => (
                          <div key={i} style={{ width: 1.5, background: accent, height: h, animation: `pulse-dot 0.6s ease ${i * 0.2}s infinite` }} />
                        ))}
                      </div>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                    )}
                  </div>
                  <div className="mp-text" style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                    <span 
                      className={`mp-title ${trackTitle.length > 25 ? "scrolling" : ""}`}
                      style={{ fontSize: 10, display: "block" }}
                    >
                      <span className="mp-title-inner">
                        {trackTitle}
                        {trackTitle.length > 25 && <span style={{ paddingLeft: 40 }}>{trackTitle}</span>}
                      </span>
                    </span>
                    <div className="mp-subtitle" style={{ fontSize: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {trackArtist}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div className="mp-vol-row" style={{ gap: 4 }}>
                      <button
                        className="mp-ctrl-btn"
                        style={{ padding: 4 }}
                        onClick={() => setMusicVolume(v => v > 0 ? 0 : 0.5)}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={musicVolume > 0 ? "#555" : "#333"} strokeWidth="2">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          {musicVolume === 0 && (
                            <>
                              <line x1="23" y1="9" x2="17" y2="15" />
                              <line x1="17" y1="9" x2="23" y2="15" />
                            </>
                          )}
                        </svg>
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        className="volume-slider"
                        style={{ width: 40, height: 2 }}
                        value={musicVolume}
                        onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                      />
                    </div>
                    <button className="mp-play-btn" style={{ width: 26, height: 26, minWidth: 26 }} onClick={toggleMusic}>
                      {isMusicPlaying ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3" /></svg>
                      )}
                    </button>
                  </div>
                </div>
                {/* Track Selector for local mode */}
                {!isYt && (
                  <div className="mp-track-row" style={{ padding: "0 14px 10px", justifyContent: "flex-start", gap: 4 }}>
                    {AMBIANCE_TRACKS.map((t) => (
                      <button
                        key={t.id}
                        className={`mp-track-btn ${currentTrack.id === t.id ? "active" : ""}`}
                        style={{ fontSize: 7, padding: "2px 6px" }}
                        onClick={() => switchTrack(t)}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <StatsDashboard
              history={history}
              allSubjects={allSubjects}
              subjectDot={subjectDot}
              onClearAllData={isClearingData ? null : clearAllData}
              onClearToday={isClearingData ? null : clearTodayData}
            />
            {/* Mini music player shown at bottom of Stats view when music is active */}
            {hasMusicActive && (
              <MiniMusicPlayer
                accent={accent}
                isYt={isYt}
                isMusicPlaying={isMusicPlaying}
                trackTitle={trackTitle}
                trackArtist={trackArtist}
                currentTimeSec={currentTimeSec}
                durationSec={durationSec}
                musicVolume={musicVolume}
                toggleMusic={toggleMusic}
                seekMusic={seekMusic}
                setMusicVolume={setMusicVolume}
                fmtTime={fmtTime}
                isLoading={isLoading}
                ytNextTrack={ytNextTrack}
                ytPrevTrack={ytPrevTrack}
              />
            )}
          </>
        )}
      </div>

      {/* ── Settings drawer ── */}
      <div className={`settings-drawer ${showSettings ? "open" : ""}`}>
        <button
          className="btn-icon"
          style={{ position: "absolute", top: 16, right: 16, color: "#333" }}
          onClick={() => setShowSettings(false)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Durations */}
        <span className="s-label">Durations</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="s-hint">Quick presets</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button
              className="s-add-btn"
              onClick={() =>
                applyPreset({
                  workDuration: 25,
                  shortBreak: 5,
                  longBreak: 15,
                })
              }
            >
              25 / 5 / 15
            </button>
            <button
              className="s-add-btn"
              onClick={() =>
                applyPreset({
                  workDuration: 50,
                  shortBreak: 10,
                  longBreak: 20,
                })
              }
            >
              50 / 10 / 20
            </button>
            <button
              className="s-add-btn"
              onClick={() =>
                applyPreset({
                  workDuration: 15,
                  shortBreak: 3,
                  longBreak: 10,
                })
              }
            >
              15 / 3 / 10
            </button>
          </div>
        </div>
        {[
          { label: "Focus", key: "workDuration" },
          { label: "Short Break", key: "shortBreak" },
          { label: "Long Break", key: "longBreak" },
        ].map(({ label, key }) => (
          <div key={key} className="s-row">
            <span className="s-name">{label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                className="s-input"
                type="number"
                min={1}
                max={120}
                value={settingsInput[key]}
                onChange={(e) =>
                  setSettingsInput((s) => ({ ...s, [key]: e.target.value }))
                }
                onFocus={(e) => (e.target.style.borderColor = accent)}
                onBlur={(e) => (e.target.style.borderColor = "#1c1c1c")}
              />
              <span style={{ fontSize: 10, color: "#2e2e2e" }}>min</span>
            </div>
          </div>
        ))}

        <hr className="s-divider" />

        {/* Subjects */}
        <span className="s-label">Subjects</span>

        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {DEFAULT_SUBJECTS.map((s) => (
            <div key={s} className="s-subj-default">
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: subjectDot(s),
                    display: "inline-block",
                  }}
                />
                {s}
              </span>
            </div>
          ))}
        </div>

        {(settingsInput.customSubjects || []).length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {(settingsInput.customSubjects || []).map((s) => (
              <div key={s} className="s-subj-tag">
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    color: "#444",
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background:
                        SUBJECT_DOTS[
                          (DEFAULT_SUBJECTS.length +
                            (settingsInput.customSubjects || []).indexOf(s)) %
                            SUBJECT_DOTS.length
                        ],
                      display: "inline-block",
                    }}
                  />
                  {s}
                </span>
                <button
                  className="s-subj-remove"
                  onClick={() => removeCustomSubject(s)}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 6 }}>
          <input
            className="s-text-input"
            placeholder="Add subject..."
            value={newSubjectInput}
            onChange={(e) => setNewSubjectInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustomSubject(false)}
            maxLength={30}
          />
          <button className="s-add-btn" onClick={() => addCustomSubject(false)}>
            Add
          </button>
        </div>
        {allSubjects.length >= 20 && (
          <div className="s-error">Maximum 20 subjects reached</div>
        )}

        <hr className="s-divider" />

        {/* Options */}
        <span className="s-label">Options</span>
        <div className="s-row">
          <div>
            <div className="s-name">Clock tick</div>
            <div className="s-hint">Subtle tick every second</div>
          </div>
          <button
            className="toggle"
            style={{ background: settingsInput.tickSound ? accent : "#1a1a1a" }}
            onClick={() =>
              setSettingsInput((s) => ({ ...s, tickSound: !s.tickSound }))
            }
          >
            <div
              className="toggle-knob"
              style={{ left: settingsInput.tickSound ? "16px" : "2px" }}
            />
          </button>
        </div>

        <div className="s-row">
          <div>
            <div className="s-name">Auto-start</div>
            <div className="s-hint">Automatically start next session</div>
          </div>
          <button
            className="toggle"
            style={{ background: settingsInput.autoStart ? accent : "#1a1a1a" }}
            onClick={() =>
              setSettingsInput((s) => ({ ...s, autoStart: !s.autoStart }))
            }
          >
            <div
              className="toggle-knob"
              style={{ left: settingsInput.autoStart ? "16px" : "2px" }}
            />
          </button>
        </div>

        <div className="s-row">
          <div>
            <div className="s-name">Auto-play Music</div>
            <div className="s-hint">Start music when focus begins</div>
          </div>
          <button
            className="toggle"
            style={{
              background: settingsInput.autoPlayMusic ? accent : "#1a1a1a",
            }}
            onClick={() =>
              setSettingsInput((s) => ({
                ...s,
                autoPlayMusic: !s.autoPlayMusic,
              }))
            }
          >
            <div
              className="toggle-knob"
              style={{ left: settingsInput.autoPlayMusic ? "16px" : "2px" }}
            />
          </button>
        </div>

        <hr className="s-divider" />

        {/* Music Source */}
        <span className="s-label">Music Source</span>
        <div
          style={{
            display: "flex",
            background: "#080808",
            borderRadius: 4,
            padding: 2,
            border: "1px solid #1c1c1c",
          }}
        >
          <button
            onClick={() =>
              setSettingsInput((s) => ({ ...s, musicSource: "local" }))
            }
            style={{
              flex: 1,
              border: "none",
              padding: "6px",
              borderRadius: 3,
              fontSize: 9,
              fontWeight: 700,
              cursor: "pointer",
              background:
                settingsInput.musicSource === "local"
                  ? "#1a1a1a"
                  : "transparent",
              color: settingsInput.musicSource === "local" ? "#d8d8d8" : "#333",
              transition: "all 0.2s",
            }}
          >
            AMBIANCE
          </button>
          <button
            onClick={() =>
              setSettingsInput((s) => ({ ...s, musicSource: "youtube" }))
            }
            style={{
              flex: 1,
              border: "none",
              padding: "6px",
              borderRadius: 3,
              fontSize: 9,
              fontWeight: 700,
              cursor: "pointer",
              background:
                settingsInput.musicSource === "youtube"
                  ? "#1a1a1a"
                  : "transparent",
              color:
                settingsInput.musicSource === "youtube" ? "#d8d8d8" : "#333",
              transition: "all 0.2s",
            }}
          >
            YOUTUBE
          </button>
        </div>

        {settingsInput.musicSource === "youtube" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              animation: "fadeUp 0.2s ease",
            }}
          >
            <span className="s-name">YouTube URL / ID</span>
            <input
              className="s-text-input"
              value={settingsInput.youtubeUrl}
              onChange={(e) => {
                setSettingsInput((s) => ({ ...s, youtubeUrl: e.target.value }));
                setYtUrlError("");
              }}
              placeholder="Paste URL or ID..."
            />
            {ytUrlError && <div className="s-error">{ytUrlError}</div>}
            <div className="s-hint" style={{ fontSize: 8 }}>
              Supports Videos & Playlists. Use playlist URLs for prev/next
              controls.
            </div>
          </div>
        )}

        <button
          className="btn-primary"
          onClick={saveSettings}
          style={{
            background: accent,
            color: "#080808",
            padding: "10px 18px",
            marginTop: 4,
          }}
        >
          Save
        </button>

        <div
          style={{
            marginTop: "auto",
            paddingTop: 16,
            borderTop: "1px solid #141414",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "#282828",
              lineHeight: 1.9,
              letterSpacing: "0.04em",
            }}
          >
            Long break every 4 sessions.
            <br />
            Sessions saved automatically.
            <br />
            Stop timer to switch modes.
            <br />
            Music persists across tabs.
          </div>
        </div>
      </div>

      {showSettings && (
        <div
          onClick={() => setShowSettings(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99,
            background: "rgba(0,0,0,0.55)",
          }}
        />
      )}

      {/* ── Confirm Modal ── */}
      {confirmConfig && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(4px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            animation: "fadeUp 0.2s ease",
          }}
        >
          <div
            style={{
              background: "#0d0d0d",
              border: "1px solid #1c1c1c",
              borderRadius: 8,
              padding: 24,
              maxWidth: 320,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "#888",
                lineHeight: 1.6,
                letterSpacing: "0.02em",
              }}
            >
              {confirmConfig.message}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn-stats-tab"
                style={{ flex: 1, padding: "10px" }}
                onClick={() => setConfirmConfig(null)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                style={{
                  flex: 1,
                  background: accent,
                  color: "#080808",
                  padding: "10px",
                }}
                onClick={() => {
                  confirmConfig.onConfirm();
                  setConfirmConfig(null);
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
