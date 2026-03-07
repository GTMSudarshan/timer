import { useState, useEffect, useRef, useCallback, useMemo } from "react";
// Recharts imports handled by preview wrapper globally

// ── Audio ─────────────────────────────────────────────────────────────────────
// TODO: Replace with distinct sounds:
//   - playFocusEnd  → something sharp/rewarding (e.g. ascending chime, bowl bell)
//   - playBreakEnd  → something gentle/alerting (e.g. soft bell, low tone nudge)
// Current playEnd is a placeholder used for both. Fix in a future audio pass.

function playTone(freqs, vol = 0.18, spacing = 0.18, type = "sine") {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = type;
      const t = ctx.currentTime + i * spacing;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.start(t); osc.stop(t + 0.22);
    });
  } catch {}
}
// TODO: Split into playFocusEnd() and playBreakEnd() with different tones
const playEnd   = () => playTone([528, 660, 528]);
const playStart = () => playTone([440, 550], 0.10, 0.10);
const playPause = () => playTone([330, 260], 0.08, 0.10);

function playTick() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 900; osc.type = "square";
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.05);
  } catch {}
}

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_SUBJECTS = ["Physics", "Chemistry", "Math"];
const DEFAULT_SETTINGS = {
  workDuration: 25, shortBreak: 5, longBreak: 15,
  customSubjects: [], tickSound: false, autoStart: false,
  autoPlayMusic: false,
  musicSource: "local", // "local" or "youtube"
  youtubeUrl: "https://www.youtube.com/watch?v=jfKfPfyJRdk", // Default Lofi Girl
};

const MODES = {
  work:  { label: "Focus",       key: "workDuration" },
  short: { label: "Short Break", key: "shortBreak"   },
  long:  { label: "Long Break",  key: "longBreak"    },
};

const ACCENT   = { work: "#e8c547", short: "#5bbfb5", long: "#8b8fe8" };
const AMBIANCE = {
  work:  { bg: "#080808", glowBlur: 3,  glowOp: 0.12, breathe: false },
  short: { bg: "#07090a", glowBlur: 8,  glowOp: 0.22, breathe: true,  bspeed: "4s" },
  long:  { bg: "#07080c", glowBlur: 14, glowOp: 0.32, breathe: true,  bspeed: "7s" },
};

// Subject accent dot colors (cycles for custom subjects)
const SUBJECT_DOTS = ["#e8c547", "#5bbfb5", "#8b8fe8", "#e87d5b", "#7be89a", "#e85b9a"];

const AMBIANCE_TRACKS = [
  { id: "none",    name: "None",       url: "" },
  { id: "lofi",    name: "Lo-Fi",      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" }, // Placeholder high-quality URL
  { id: "rain",    name: "Rain",       url: "https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3" }, 
  { id: "forest",  name: "Forest",     url: "https://assets.mixkit.co/active_storage/sfx/1234/1234-preview.mp3" },
  { id: "noise",   name: "Deep Noise", url: "https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3" },
];

function StatsDashboard({ history, allSubjects, subjectDot }) {
  const [range, setRange] = useState("year"); // week, month, year
  const [selectedDay, setSelectedDay] = useState(null);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todaySessions = history.filter(s => s.completedAt.startsWith(today) && s.type === "work");
    const todayMins = todaySessions.reduce((acc, s) => acc + (parseInt(s.duration) || 0), 0);
    const totalMins = history.reduce((acc, s) => acc + (parseInt(s.duration) || 0), 0);
    
    // Subject breakdown
    const breakdown = allSubjects.map(name => ({
      name,
      value: history.filter(s => s.subject === name && s.type === "work").reduce((acc, s) => acc + (parseInt(s.duration) || 0), 0),
      color: subjectDot(name)
    })).filter(s => s.value >= 0); // Keep all subjects even with 0 to show the chart structure

    // Heatmap / Activity Logic
    const days = range === "week" ? 7 : range === "month" ? 30 : 365;
    const activity = [];
    const now = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - (days - 1 - i));
      const ds = d.toISOString().slice(0, 10);
      const count = history.filter(s => s.completedAt.startsWith(ds) && s.type === "work").length;
      activity.push({ date: ds, count });
    }

    // Advanced Stats Logic
    const dailyCounts = {};
    const dailyMins = {};
    history.filter(s => s.type === "work").forEach(s => {
      const date = s.completedAt.slice(0, 10);
      dailyCounts[date] = (dailyCounts[date] || 0) + 1;
      dailyMins[date] = (dailyMins[date] || 0) + (parseInt(s.duration) || 0);
    });
    
    const peakSessionsInADay = Math.max(0, ...Object.values(dailyCounts));
    // Find the total minutes study on that specific peak day
    const peakDayDate = Object.keys(dailyCounts).find(d => dailyCounts[d] === peakSessionsInADay);
    const peakDayMins = peakDayDate ? dailyMins[peakDayDate] : 0;
    
    const uniqueDays = new Set(history.filter(s => s.type === "work").map(s => s.completedAt.slice(0, 10))).size;
    const avgSessions = uniqueDays > 0 ? (history.filter(s => s.type === "work").length / uniqueDays).toFixed(1) : 0;

    return { todaySessions, todayMins, totalMins, breakdown, activity, peakSessionsInADay, peakDayMins, avgSessions };
  }, [history, allSubjects, subjectDot, range]);

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%", paddingBottom: 40 }}>
      {/* Overview Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
        <div className="stats-card">
          <span className="stats-title">Today</span>
          <span className="stats-value">{stats.todaySessions.length}</span>
          <span className="stats-label">Sessions</span>
        </div>
        <div className="stats-card">
          <span className="stats-title">Today's Time</span>
          <span className="stats-value">{Math.floor(stats.todayMins / 60)}h {stats.todayMins % 60}m</span>
          <span className="stats-label">Focused today</span>
        </div>
        <div className="stats-card">
          <span className="stats-title">Total Time</span>
          <span className="stats-value">{Math.floor(stats.totalMins / 60)}h {stats.totalMins % 60}m</span>
          <span className="stats-label">Focused all-time</span>
        </div>
        <div className="stats-card">
          <span className="stats-title">Average</span>
          <span className="stats-value">{stats.avgSessions}</span>
          <span className="stats-label">Sessions / Day</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        {/* Breakdown Chart */}
        <div className="stats-card" style={{ height: 320 }}>
          <span className="stats-title">Subject Breakdown (min)</span>
          <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 12, padding: "20px 10px 10px", minHeight: 200, height: "100%" }}>
            {(() => {
              const maxVal = Math.max(...stats.breakdown.map(x => x.value), 1);
              return stats.breakdown.map((s, i) => {
                const hPct = (s.value / maxVal) * 100;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 8, height: "100%" }}>
                    <div style={{ 
                      width: "100%", 
                      height: `${hPct}%`, 
                      minHeight: s.value > 0 ? 4 : 2,
                      background: s.value > 0 ? s.color : "#1a1a1a",
                      borderRadius: "4px 4px 0 0",
                      transition: "height 1s cubic-bezier(0.4, 0, 0.2, 1)",
                      position: "relative"
                    }}>
                      {s.value > 0 && (
                        <div style={{ position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)", fontSize: 10, color: "#666", fontFamily: "JetBrains Mono", whiteSpace: "nowrap" }}>
                          {s.value}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", width: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Productivity Peak Card */}
        <div className="stats-card" style={{ justifyContent: "center" }}>
          <span className="stats-title">Productivity Peak</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 10 }}>
            <div className="peak-stat">
              <span className="stats-label" style={{ width: 100 }}>Peak Record</span>
              <span className="peak-hour">{stats.peakSessionsInADay}</span>
              <span className="peak-count">sessions / day</span>
            </div>
            <div className="peak-stat">
              <span className="stats-label" style={{ width: 100 }}>Peak Time</span>
              <span className="peak-hour">{Math.floor(stats.peakDayMins / 60)}h {stats.peakDayMins % 60}m</span>
              <span className="peak-count">Total focused</span>
            </div>
          </div>
          {/* TODO: Add more visualization tools for consistency analysis here 
              (e.g., Scatterplot for session distribution, Histogram for session lengths, 
              Mathematical consistency score based on daily variance) */}
        </div>
      </div>

      {/* Activity Heatmap */}
      <div className="stats-card" style={{ position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span className="stats-title">Activity</span>
            <span style={{ fontSize: 9, color: "#222", marginTop: 2, fontWeight: 500 }}>
              {new Date().getFullYear()} Timeline
            </span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {["week", "month", "year"].map(r => (
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
        <div className="heatmap" style={{ 
          gridTemplateColumns: range === "week" ? "repeat(7, 1fr)" : range === "month" ? "repeat(30, 1fr)" : "repeat(53, 1fr)",
          marginTop: 10 
        }}>
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

        {/* Detailed Day View (Modal Overlay) */}
        {selectedDay && (
          <div style={{ 
            position: "absolute", inset: 0, background: "#0d0d0d", borderRadius: 8, 
            padding: 20, zIndex: 5, display: "flex", flexDirection: "column", gap: 12,
            animation: "fadeUp 0.3s ease"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="stats-title" style={{ color: "#888" }}>Details — {selectedDay}</span>
              <button className="btn-icon" onClick={() => setSelectedDay(null)} style={{ color: "#444" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
              <div className="stats-label">Focus Sessions: {history.filter(s => s.completedAt.startsWith(selectedDay) && s.type === "work").length}</div>
              <div className="stats-label">Total Duration: {history.filter(s => s.completedAt.startsWith(selectedDay) && s.type === "work").reduce((acc, s) => acc + (parseInt(s.duration) || 0), 0)} min</div>
              
              {/* TODO: Integrate Phase 4 (Music) analysis here:
                  - Frequent songs/artists for this day
                  - Genre distribution
                  - Ideal focus period identification
              */}
              <div style={{ marginTop: 10, padding: 12, background: "#111", borderRadius: 4, border: "1px dashed #222", color: "#333", fontSize: 10, textAlign: "center" }}>
                More analytical tools (Songs, Ideal Period, Consistency) coming soon...
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PomodoroApp() {
  const [settings, setSettings]             = useState(DEFAULT_SETTINGS);
  const [mode, setMode]                     = useState("work");
  const [timeLeft, setTimeLeft]             = useState(25 * 60);
  const [isRunning, setIsRunning]           = useState(false);
  const [sessionCount, setSessionCount]     = useState(0);
  const [pomodoroCount, setPomodoroCount]   = useState(0);
  const [showSettings, setShowSettings]     = useState(false);
  const [settingsInput, setSettingsInput]   = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded]                 = useState(false);
  const [lockedNotice, setLockedNotice]     = useState(false);
  // Phase 2
  const [subject, setSubject]               = useState("Physics");
  const [newSubjectInput, setNewSubjectInput] = useState("");
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [view, setView]                     = useState("timer"); // "timer" or "stats"
  const [history, setHistory]               = useState([]);
  const [currentTrack, setCurrentTrack]     = useState(AMBIANCE_TRACKS[0]);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [musicVolume, setMusicVolume]       = useState(0.5);
  const [ytPlayer, setYtPlayer]             = useState(null);
  const howlsRef = useRef({});
  const scrollRef = useRef(null);

  const modeRef    = useRef(mode);
  const settingsRef = useRef(settings);
  const subjectRef  = useRef(subject);
  
  useEffect(() => {
    modeRef.current = mode;
    settingsRef.current = settings;
    subjectRef.current = subject;
  }, [mode, settings, subject]);

  // ── Derived — moved up for useEffect access ────────────────────────────────
  const allSubjects  = useMemo(() => [...DEFAULT_SUBJECTS, ...(settings.customSubjects || [])], [settings.customSubjects]);
  const subjectDot   = useCallback((s) => SUBJECT_DOTS[allSubjects.indexOf(s) % SUBJECT_DOTS.length], [allSubjects]);

  const accent       = mode === "work" ? subjectDot(subject) : ACCENT[mode];
  const amb          = AMBIANCE[mode];
  const totalSecs    = settings[MODES[mode].key] * 60;
  const progress     = totalSecs > 0 ? (totalSecs - timeLeft) / totalSecs : 0;
  const R            = 110;
  const CIRC         = 2 * Math.PI * R;
  const dashOffset   = CIRC * (1 - progress);
  const mins         = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const secs         = String(timeLeft % 60).padStart(2, "0");
  const pipsFilled   = pomodoroCount % 4;
  const chromeOp     = isRunning ? 0.07 : 1;
  const subjectOp    = isRunning ? 0.35 : 1; // subject stays slightly visible while running

  // ── Load settings ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("settings");
        if (r) {
          const s = { ...DEFAULT_SETTINGS, ...JSON.parse(r.value) };
          setSettings(s); setSettingsInput(s);
          setTimeLeft(s.workDuration * 60);
        } else { setTimeLeft(25 * 60); }
      } catch { setTimeLeft(25 * 60); }
      setLoaded(true);
    })();
  }, []);

  // ── Load today's session count ─────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const r = await window.storage.list(`sessions:${today}`);
        if (r?.keys) {
          // Fetch values to filter only work sessions
          const data = await Promise.all(
            r.keys.map(async k => {
              const val = await window.storage.get(k.replace("pomodoro_", ""));
              return val ? JSON.parse(val.value) : null;
            })
          );
          setSessionCount(data.filter(s => s?.type === "work").length);
        }
      } catch {}
    })();
  }, []);

  // ── Load session history ──────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    try {
      const r = await window.storage.list("sessions:");
      if (r?.keys) {
        const sorted = r.keys.sort().reverse();
        const data = await Promise.all(
          sorted.slice(0, 100).map(async k => {
            const val = await window.storage.get(k.replace("pomodoro_", ""));
            return val ? JSON.parse(val.value) : null;
          })
        );
        setHistory(data.filter(Boolean));
      }
    } catch {}
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory, sessionCount]);

  // ── YouTube Logic ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (settings.musicSource !== "youtube") return;
    
    // Load YouTube API if not already present
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    window.onYouTubeIframeAPIReady = () => {
      initYtPlayer();
    };

    if (window.YT && window.YT.Player) {
      initYtPlayer();
    }

    return () => {
      if (ytPlayer) ytPlayer.destroy();
    };
  }, [settings.musicSource, settings.youtubeUrl]);

  const initYtPlayer = () => {
    // Extract video ID or playlist ID
    let videoId = "";
    let listId = "";
    try {
      const url = new URL(settings.youtubeUrl);
      videoId = url.searchParams.get("v") || "";
      listId = url.searchParams.get("list") || "";
    } catch {
      videoId = settings.youtubeUrl; // Assume it's an ID if URL fails
    }

    const player = new window.YT.Player('yt-player-hidden', {
      height: '0',
      width: '0',
      videoId: videoId,
      playerVars: {
        listType: listId ? 'playlist' : '',
        list: listId,
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        enablejsapi: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: (event) => {
          setYtPlayer(event.target);
          event.target.setVolume(musicVolume * 100);
        },
        onStateChange: (event) => {
          if (event.data === window.YT.PlayerState.PLAYING) setIsMusicPlaying(true);
          else if (event.data === window.YT.PlayerState.PAUSED) setIsMusicPlaying(false);
          else if (event.data === window.YT.PlayerState.ENDED) {
            // Handle playlist end or loop
            if (listId) event.target.playVideo();
          }
        }
      }
    });
  };

  const toggleMusic = useCallback(() => {
    if (settings.musicSource === "youtube") {
      if (!ytPlayer) return;
      if (isMusicPlaying) {
        ytPlayer.pauseVideo();
      } else {
        ytPlayer.playVideo();
      }
      return;
    }

    if (currentTrack.id === "none") return;
    
    let howl = howlsRef.current[currentTrack.id];
    if (!howl) {
      howl = new window.Howl({
        src: [currentTrack.url],
        html5: true,
        loop: true,
        volume: musicVolume,
      });
      howlsRef.current[currentTrack.id] = howl;
    }

    if (isMusicPlaying) {
      howl.pause();
      setIsMusicPlaying(false);
    } else {
      howl.play();
      setIsMusicPlaying(true);
    }
  }, [settings.musicSource, ytPlayer, currentTrack, isMusicPlaying, musicVolume]);

  const switchTrack = (track) => {
    if (settings.musicSource === "youtube") return; // Local tracks disabled in YT mode

    // Stop previous
    if (howlsRef.current[currentTrack.id]) {
      howlsRef.current[currentTrack.id].stop();
    }
    
    setCurrentTrack(track);
    setIsMusicPlaying(false);

    if (track.id !== "none") {
      const howl = new window.Howl({
        src: [track.url],
        html5: true,
        loop: true,
        volume: musicVolume,
      });
      howlsRef.current[track.id] = howl;
      howl.play();
      setIsMusicPlaying(true);
    }
  };

  useEffect(() => {
    if (settings.musicSource === "youtube" && ytPlayer) {
      ytPlayer.setVolume(musicVolume * 100);
    } else if (howlsRef.current[currentTrack.id]) {
      howlsRef.current[currentTrack.id].volume(musicVolume);
    }
  }, [musicVolume, currentTrack, settings.musicSource, ytPlayer]);

  // ── Session end ────────────────────────────────────────────────────────────
  const handleSessionEnd = useCallback(async () => {
    playEnd();
    setIsRunning(false);
    const m = modeRef.current;
    const s = settingsRef.current;
    const sub = subjectRef.current;

    if (m === "work") {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      try {
        await window.storage.set(
          `sessions:${dateStr}-${now.getTime()}`,
          JSON.stringify({
            subject: sub,
            duration: s.workDuration,
            completedAt: now.toISOString(),
            type: "work",
          })
        );
      } catch {}
      setSessionCount(c => c + 1);
      setPomodoroCount(p => {
        const next = p + 1;
        if (next % 4 === 0) { setMode("long");  setTimeLeft(s.longBreak * 60); }
        else                 { setMode("short"); setTimeLeft(s.shortBreak * 60); }
        return next;
      });
    } else {
      setMode("work");
      setTimeLeft(s.workDuration * 60);
    }

    if (s.autoStart) {
      setTimeout(() => {
        playStart();
        setIsRunning(true);
      }, 1000);
    }
  }, []);

  // ── Timer tick ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      if (settingsRef.current.tickSound) playTick();
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(id); handleSessionEnd(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning, handleSessionEnd]);

  // ── Space key ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        setIsRunning(r => { r ? playPause() : playStart(); return !r; });
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // ── Scroll selected subject to center ─────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!scrollRef.current) return;
      const container = scrollRef.current;
      const activeItem = container.querySelector(".subj-pill.active");
      if (activeItem) {
        const center = container.offsetWidth / 2;
        const itemCenter = activeItem.offsetLeft + (activeItem.offsetWidth / 2);
        container.scrollTo({ left: itemCenter - center, behavior: "smooth" });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [subject, isAddingCustom, allSubjects.length]);

  // ── Mode switch — blocked while running ────────────────────────────────────
  const switchMode = (m) => {
    if (isRunning) {
      setLockedNotice(true);
      setTimeout(() => setLockedNotice(false), 2000);
      return;
    }
    setMode(m);
    setTimeLeft(settings[MODES[m].key] * 60);
  };

  const resetTimer = () => {
    if (isRunning) playPause();
    setIsRunning(false);
    setTimeLeft(settings[MODES[mode].key] * 60);
  };

  const toggleRunning = () => {
    setIsRunning(r => { 
      const next = !r;
      if (next) {
        playStart();
        // Auto-play music if enabled and a track is selected
        if (settings.autoPlayMusic && currentTrack.id !== "none" && !isMusicPlaying) {
          toggleMusic();
        }
      } else {
        playPause();
      }
      return next; 
    });
  };

  // ── Settings save ──────────────────────────────────────────────────────────
  const saveSettings = async () => {
    const s = { ...settingsInput };
    ["workDuration","shortBreak","longBreak"].forEach(k => {
      s[k] = Math.max(1, Math.min(120, parseInt(s[k]) || 1));
    });
    setSettings(s);
    try { await window.storage.set("settings", JSON.stringify(s)); } catch {}
    setTimeLeft(s[MODES[mode].key] * 60);
    setIsRunning(false);
    setShowSettings(false);
  };

  // ── Custom subject management ──────────────────────────────────────────────
  const addCustomSubject = async (fromMain = false) => {
    const val = newSubjectInput.trim();
    if (!val) {
      if (fromMain) setIsAddingCustom(false);
      return;
    }
    const all = [...DEFAULT_SUBJECTS, ...(settings.customSubjects || [])];
    if (all.map(s => s.toLowerCase()).includes(val.toLowerCase())) {
      setSubject(all.find(s => s.toLowerCase() === val.toLowerCase()));
      setNewSubjectInput("");
      if (fromMain) setIsAddingCustom(false);
      return;
    }
    
    const newSettings = { ...settings, customSubjects: [...(settings.customSubjects || []), val] };
    setSettings(newSettings);
    setSettingsInput(newSettings);
    setSubject(val);
    setNewSubjectInput("");
    if (fromMain) setIsAddingCustom(false);
    
    try { await window.storage.set("settings", JSON.stringify(newSettings)); } catch {}
  };

  const removeCustomSubject = (subj) => {
    setSettingsInput(s => ({ ...s, customSubjects: s.customSubjects.filter(x => x !== subj) }));
    // If currently selected, fall back to first default
    if (subject === subj) setSubject("Physics");
  };

  if (!loaded) return <div style={{ background: "#080808", height: "100vh" }} />;

  return (
    <div 
      className="pomodoro-app-container"
      style={{
        minHeight: "100vh", background: amb.bg, color: "#d8d8d8",
        fontFamily: "'Syne', sans-serif",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        position: "relative", overflow: "hidden",
        transition: "background 1.4s ease",
        "--accent": accent,
        "--accent-glow": accent + "aa",
        "--accent-glow-op": accent + "33",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@200;300;400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        .pomodoro-app-container {
          transition: background 1.4s ease;
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

        /* Subject pills */
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

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.45s ease forwards; }

        @keyframes breathe {
          0%,100% { opacity: 0.4; }
          50%      { opacity: 1; }
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
        .music-player {
          display: flex; align-items: center; gap: 12px;
          background: #0d0d0d; border: 1px solid #181818;
          border-radius: 20px; padding: 4px 14px;
          margin-top: 10px; opacity: var(--music-op, 1);
          transition: all 0.4s ease;
        }
        .music-btn {
          background: none; border: none; cursor: pointer;
          color: #444; font-size: 10px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.05em;
          padding: 4px 8px; transition: all 0.2s;
        }
        .music-btn.active { color: var(--accent); }
        .music-btn:hover:not(.active) { color: #888; }
        
        .volume-slider {
          -webkit-appearance: none; width: 60px; height: 2px;
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
        }
        .stats-title { font-size: 11px; font-weight: 700; color: #444; text-transform: uppercase; letter-spacing: 0.1em; }
        .stats-value { font-size: 24px; font-weight: 300; color: #d8d8d8; font-family: 'JetBrains Mono', monospace; }
        .stats-label { font-size: 10px; color: #2a2a2a; text-transform: uppercase; letter-spacing: 0.05em; }
        
        .heatmap { display: grid; grid-template-columns: repeat(53, 1fr); gap: 2px; width: 100%; }
        .heatmap-cell { aspect-ratio: 1/1; border-radius: 1px; background: #111; }
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
      `}</style>

      {/* Breathing bg glow for breaks */}
      {amb.breathe && (
        <div style={{
          position: "fixed", inset: 0, pointerEvents: "none",
          background: `radial-gradient(ellipse 65% 55% at 50% 50%, ${accent}1a 0%, transparent 70%)`,
          animation: `breathe ${amb.bspeed} ease-in-out infinite`,
        }}/>
      )}

      {lockedNotice && <div className="lock-toast">Stop timer to switch mode</div>}

      {/* ── Top bar ── */}
      <div className="chrome" style={{
        position: "fixed", top: 0, left: 0, right: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "18px 28px", zIndex: 10, opacity: chromeOp,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", color: "#3a3a3a", textTransform: "uppercase" }}>
              Pomodoro
            </span>
            <span style={{ fontSize: 9, color: "#222", fontWeight: 500, marginTop: 2 }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>
          <div style={{ display: "flex", background: "#0d0d0d", border: "1px solid #181818", borderRadius: 4, padding: 2 }}>
            <button 
              onClick={() => setView("timer")}
              style={{ 
                background: view === "timer" ? "#1a1a1a" : "transparent",
                border: "none", padding: "4px 10px", borderRadius: 3,
                color: view === "timer" ? "#d8d8d8" : "#333",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer",
                textTransform: "uppercase", transition: "all 0.2s"
              }}>
              Focus
            </button>
            <button 
              onClick={() => setView("stats")}
              style={{ 
                background: view === "stats" ? "#1a1a1a" : "transparent",
                border: "none", padding: "4px 10px", borderRadius: 3,
                color: view === "stats" ? "#d8d8d8" : "#333",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer",
                textTransform: "uppercase", transition: "all 0.2s"
              }}>
              Stats
            </button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#3a3a3a" }}>
            {sessionCount} <span style={{ color: "#282828" }}>today</span>
          </span>
          <button className="btn-icon" style={{ color: "#3a3a3a" }} onClick={() => setShowSettings(v => !v)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Main View Switcher ── */}
      <div style={{ width: "100%", maxWidth: view === "stats" ? 800 : "unset", padding: "80px 20px 40px" }}>
        {view === "timer" ? (
          <div className="fade-up" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32, zIndex: 1 }}>
            {/* Mode tabs */}
            <div className="chrome" style={{
              display: "flex", gap: 2,
              background: "#0d0d0d", border: "1px solid #181818",
              borderRadius: 5, padding: 3, opacity: chromeOp,
            }}>
              {Object.entries(MODES).map(([k, { label }]) => (
                <button key={k} className="btn-mode"
                  style={{ color: mode === k ? accent : "#2e2e2e" }}
                  onClick={() => switchMode(k)}>
                  {label}
                </button>
              ))}
            </div>

            {/* Ring */}
            <div style={{ position: "relative", width: 260, height: 260 }}>
              <svg width="260" height="260" style={{ transform: "rotate(-90deg)" }}>
                <defs>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation={amb.glowBlur} result="b"/>
                    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                </defs>
                <circle cx="130" cy="130" r={R} fill="none" stroke="#141414" strokeWidth="1.5"/>
                <circle cx="130" cy="130" r={R} fill="none" stroke={accent} strokeWidth="2"
                  strokeDasharray={CIRC} strokeDashoffset={dashOffset}
                  opacity={amb.glowOp} filter="url(#glow)"
                  style={{ transition: "stroke-dashoffset 1s linear, stroke 0.6s, opacity 0.8s" }}
                />
                <circle cx="130" cy="130" r={R} fill="none" stroke={accent} strokeWidth="1.5"
                  strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={dashOffset}
                  style={{ transition: "stroke-dashoffset 1s linear, stroke 0.6s" }}
                />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 60, fontWeight: 200, letterSpacing: "-0.03em", color: "#e0e0e0", lineHeight: 1, userSelect: "none" }}>
                  <span>{mins}</span>
                  <span style={{ color: "#252525", fontSize: 44 }}>:</span>
                  <span>{secs}</span>
                </div>
                <div style={{ fontSize: 10, color: "#2e2e2e", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600 }}>
                  {MODES[mode].label}
                </div>
              </div>
            </div>

            {/* ── Subject selector ── */}
            {mode === "work" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                <div 
                  ref={scrollRef}
                  className={`subj-scroll-container ${isRunning ? "is-running" : ""}`}
                  style={{
                    opacity: subjectOp, 
                    transition: "all 0.6s ease",
                  }}
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
                          ...(isRunning && isActive ? { transform: "scale(1.1)", margin: "0 auto" } : {})
                        }}
                        onClick={() => !isRunning && setSubject(s)}
                      >
                        <span className="subj-dot" style={{ background: isActive ? subjectDot(s) : "#2a2a2a" }}/>
                        {s}
                      </button>
                    );
                  })}
                </div>

                {isAddingCustom || isRunning ? null : (
                  <button
                    className="subj-pill"
                    style={{ borderStyle: "dashed", borderColor: "#1c1c1c", fontSize: 10, padding: "5px 12px", opacity: subjectOp }}
                    onClick={() => !isRunning && setIsAddingCustom(true)}
                  >
                    + Custom
                  </button>
                )}

                {isAddingCustom && !isRunning && (
                  <div style={{ display: "flex", gap: 4, alignItems: "center", animation: "fadeUp 0.2s ease" }}>
                    <input
                      autoFocus
                      className="s-text-input"
                      style={{ width: 130, padding: "7px 14px", fontSize: 11, height: 32, borderRadius: 20 }}
                      placeholder="Add subject…"
                      value={newSubjectInput}
                      onChange={e => setNewSubjectInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") addCustomSubject(true);
                        if (e.key === "Escape") setIsAddingCustom(false);
                      }}
                      onBlur={() => !newSubjectInput && setIsAddingCustom(false)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Pips */}
            <div className="chrome" style={{ display: "flex", gap: 7, opacity: chromeOp }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: i < pipsFilled ? accent : "#1a1a1a", transition: "background 0.3s" }}/>
              ))}
            </div>

            {/* Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <button className="btn-icon chrome" style={{ color: "#2e2e2e", opacity: chromeOp }} onClick={resetTimer}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
              </button>

              <button className="btn-primary" onClick={toggleRunning}
                style={{ background: accent, color: "#080808", padding: "13px 52px" }}>
                {isRunning ? "Pause" : timeLeft === settings[MODES[mode].key] * 60 ? "Start" : "Resume"}
              </button>

              <button className="btn-icon chrome" style={{ color: "#2e2e2e", opacity: chromeOp }} onClick={handleSessionEnd}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 4 15 12 5 20 5 4"/>
                  <line x1="19" y1="5" x2="19" y2="19"/>
                </svg>
              </button>
            </div>

            {/* Music Player */}
            <div className="music-player chrome" style={{ opacity: chromeOp, "--music-op": chromeOp }}>
              {settings.musicSource === "local" ? (
                <div style={{ display: "flex", gap: 4 }}>
                  {AMBIANCE_TRACKS.map(t => (
                    <button 
                      key={t.id} 
                      className={`music-btn ${currentTrack.id === t.id ? "active" : ""}`}
                      onClick={() => switchTrack(t)}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button className={`music-btn ${isMusicPlaying ? "active" : ""}`} onClick={toggleMusic}>
                    {isMusicPlaying ? "PAUSE YOUTUBE" : "PLAY YOUTUBE"}
                  </button>
                  <div id="yt-player-hidden" style={{ display: "none" }}></div>
                </div>
              )}
              
              <div style={{ width: 1, height: 12, background: "#1a1a1a" }} />
              
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={isMusicPlaying ? accent : "#333"} strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
                <input 
                  type="range" min="0" max="1" step="0.01" 
                  className="volume-slider" 
                  value={musicVolume}
                  onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                />
              </div>
            </div>

            <span className="chrome" style={{ fontSize: 10, color: "#222", letterSpacing: "0.14em", textTransform: "uppercase", opacity: chromeOp }}>
              Space to start / pause
            </span>
          </div>
        ) : (
          <StatsDashboard history={history} allSubjects={allSubjects} subjectDot={subjectDot} />
        )}
      </div>

      {/* ── Settings drawer ── */}
      <div className={`settings-drawer ${showSettings ? "open" : ""}`}>
        <button className="btn-icon" style={{ position: "absolute", top: 16, right: 16, color: "#333" }} onClick={() => setShowSettings(false)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {/* Durations */}
        <span className="s-label">Durations</span>
        {[
          { label: "Focus", key: "workDuration" },
          { label: "Short Break", key: "shortBreak" },
          { label: "Long Break", key: "longBreak" },
        ].map(({ label, key }) => (
          <div key={key} className="s-row">
            <span className="s-name">{label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input className="s-input" type="number" min={1} max={120}
                value={settingsInput[key]}
                onChange={e => setSettingsInput(s => ({ ...s, [key]: e.target.value }))}
                onFocus={e => e.target.style.borderColor = accent}
                onBlur={e => e.target.style.borderColor = "#1c1c1c"}
              />
              <span style={{ fontSize: 10, color: "#2e2e2e" }}>min</span>
            </div>
          </div>
        ))}

        <hr className="s-divider"/>

        {/* Subjects */}
        <span className="s-label">Subjects</span>

        {/* Default subjects — read only */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {DEFAULT_SUBJECTS.map(s => (
            <div key={s} className="s-subj-default">
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: subjectDot(s), display: "inline-block" }}/>
                {s}
              </span>
            </div>
          ))}
        </div>

        {/* Custom subjects */}
        {(settingsInput.customSubjects || []).length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {(settingsInput.customSubjects || []).map(s => (
              <div key={s} className="s-subj-tag">
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#444" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: SUBJECT_DOTS[(DEFAULT_SUBJECTS.length + (settingsInput.customSubjects || []).indexOf(s)) % SUBJECT_DOTS.length], display: "inline-block" }}/>
                  {s}
                </span>
                <button className="s-subj-remove" onClick={() => removeCustomSubject(s)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add custom subject */}
        <div style={{ display: "flex", gap: 6 }}>
          <input
            className="s-text-input"
            placeholder="Add subject…"
            value={newSubjectInput}
            onChange={e => setNewSubjectInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addCustomSubject(false)}
            maxLength={24}
          />
          <button className="s-add-btn" onClick={() => addCustomSubject(false)}>Add</button>
        </div>

        <hr className="s-divider"/>

        {/* Sound */}
        <span className="s-label">Options</span>
        <div className="s-row">
          <div>
            <div className="s-name">Clock tick</div>
            <div className="s-hint">Subtle tick every second</div>
          </div>
          <button className="toggle"
            style={{ background: settingsInput.tickSound ? accent : "#1a1a1a" }}
            onClick={() => setSettingsInput(s => ({ ...s, tickSound: !s.tickSound }))}
          >
            <div className="toggle-knob" style={{ left: settingsInput.tickSound ? "16px" : "2px" }}/>
          </button>
        </div>

        <div className="s-row">
          <div>
            <div className="s-name">Auto-start</div>
            <div className="s-hint">Automatically start next session</div>
          </div>
          <button className="toggle"
            style={{ background: settingsInput.autoStart ? accent : "#1a1a1a" }}
            onClick={() => setSettingsInput(s => ({ ...s, autoStart: !s.autoStart }))}
          >
            <div className="toggle-knob" style={{ left: settingsInput.autoStart ? "16px" : "2px" }}/>
          </button>
        </div>

        <div className="s-row">
          <div>
            <div className="s-name">Auto-play Music</div>
            <div className="s-hint">Start music when focus begins</div>
          </div>
          <button className="toggle"
            style={{ background: settingsInput.autoPlayMusic ? accent : "#1a1a1a" }}
            onClick={() => setSettingsInput(s => ({ ...s, autoPlayMusic: !s.autoPlayMusic }))}
          >
            <div className="toggle-knob" style={{ left: settingsInput.autoPlayMusic ? "16px" : "2px" }}/>
          </button>
        </div>

        <hr className="s-divider"/>

        {/* Music Source */}
        <span className="s-label">Music Source</span>
        <div style={{ display: "flex", background: "#080808", borderRadius: 4, padding: 2, border: "1px solid #1c1c1c" }}>
          <button 
            onClick={() => setSettingsInput(s => ({ ...s, musicSource: "local" }))}
            style={{ 
              flex: 1, border: "none", padding: "6px", borderRadius: 3, fontSize: 9, fontWeight: 700, cursor: "pointer",
              background: settingsInput.musicSource === "local" ? "#1a1a1a" : "transparent",
              color: settingsInput.musicSource === "local" ? "#d8d8d8" : "#333",
              transition: "all 0.2s"
            }}>
            AMBIANCE
          </button>
          <button 
            onClick={() => setSettingsInput(s => ({ ...s, musicSource: "youtube" }))}
            style={{ 
              flex: 1, border: "none", padding: "6px", borderRadius: 3, fontSize: 9, fontWeight: 700, cursor: "pointer",
              background: settingsInput.musicSource === "youtube" ? "#1a1a1a" : "transparent",
              color: settingsInput.musicSource === "youtube" ? "#d8d8d8" : "#333",
              transition: "all 0.2s"
            }}>
            YOUTUBE
          </button>
        </div>

        {settingsInput.musicSource === "youtube" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, animation: "fadeUp 0.2s ease" }}>
            <span className="s-name">YouTube URL / ID</span>
            <input 
              className="s-text-input"
              value={settingsInput.youtubeUrl}
              onChange={e => setSettingsInput(s => ({ ...s, youtubeUrl: e.target.value }))}
              placeholder="Paste URL or ID..."
            />
            <div className="s-hint" style={{ fontSize: 8 }}>Supports Videos & Playlists</div>
          </div>
        )}

        <button className="btn-primary" onClick={saveSettings}
          style={{ background: accent, color: "#080808", padding: "10px 18px", marginTop: 4 }}>
          Save
        </button>

        <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid #141414" }}>
          <div style={{ fontSize: 10, color: "#282828", lineHeight: 1.9, letterSpacing: "0.04em" }}>
            Long break every 4 sessions.<br/>
            Sessions saved automatically.<br/>
            Stop timer to switch modes.
          </div>
        </div>
      </div>

      {showSettings && (
        <div onClick={() => setShowSettings(false)} style={{ position: "fixed", inset: 0, zIndex: 99, background: "rgba(0,0,0,0.55)" }}/>
      )}
    </div>
  );
}
