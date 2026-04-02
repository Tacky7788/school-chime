import { useState, useEffect, useRef, useCallback } from "react";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import {
  playChime,
  playTestChime,
  initAudio,
  addSound,
  removeSound,
  getSoundEntries,
  getSoundName,
  setVolume,
  getVolume,
  type SoundEntry,
} from "./chime";
import "./styles.css";

interface ChimeTime {
  id: string;
  hour: number;
  minute: number;
  label: string;
  enabled: boolean;
  soundId: string | null;
}

const DEFAULT_SCHEDULE: ChimeTime[] = [
  { id: "1", hour: 8, minute: 30, label: "1限開始", enabled: true, soundId: null },
  { id: "2", hour: 9, minute: 20, label: "1限終了", enabled: true, soundId: null },
  { id: "3", hour: 9, minute: 30, label: "2限開始", enabled: true, soundId: null },
  { id: "4", hour: 10, minute: 20, label: "2限終了", enabled: true, soundId: null },
  { id: "5", hour: 10, minute: 30, label: "3限開始", enabled: true, soundId: null },
  { id: "6", hour: 11, minute: 20, label: "3限終了", enabled: true, soundId: null },
  { id: "7", hour: 11, minute: 30, label: "4限開始", enabled: true, soundId: null },
  { id: "8", hour: 12, minute: 20, label: "昼休み", enabled: true, soundId: null },
  { id: "9", hour: 13, minute: 10, label: "5限開始", enabled: true, soundId: null },
  { id: "10", hour: 14, minute: 0, label: "5限終了", enabled: true, soundId: null },
  { id: "11", hour: 14, minute: 10, label: "6限開始", enabled: true, soundId: null },
  { id: "12", hour: 15, minute: 0, label: "6限終了", enabled: true, soundId: null },
];

const STORAGE_KEY = "school-chime-schedule";
const DAYS = ["日", "月", "火", "水", "木", "金", "土"];

function loadSchedule(): ChimeTime[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // v1 → v1.1 migration: soundIdがないデータにnullを追加
      return parsed.map((item: ChimeTime) => ({
        ...item,
        soundId: item.soundId ?? null,
      }));
    }
  } catch {}
  return DEFAULT_SCHEDULE;
}

function saveSchedule(schedule: ChimeTime[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
}

function formatTime(h: number, m: number) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function getNow() {
  const d = new Date();
  return {
    hour: d.getHours(),
    minute: d.getMinutes(),
    second: d.getSeconds(),
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    date: d.getDate(),
    day: DAYS[d.getDay()],
  };
}

export default function App() {
  const [schedule, setSchedule] = useState<ChimeTime[]>(loadSchedule);
  const [running, setRunning] = useState(true);
  const [now, setNow] = useState(getNow);
  const [lastChime, setLastChime] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sounds, setSounds] = useState<SoundEntry[]>([]);
  const [volume, setVolumeState] = useState(getVolume());
  const [autostart, setAutostart] = useState(false);
  const [ready, setReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    initAudio().then(() => {
      setSounds(getSoundEntries());
      setVolumeState(getVolume());
      setReady(true);
    });
    isEnabled().then(setAutostart).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(getNow()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!running || !ready) return;
    const key = formatTime(now.hour, now.minute);
    if (now.second !== 0) return;

    for (const item of schedule) {
      if (!item.enabled) continue;
      const itemKey = formatTime(item.hour, item.minute);
      if (itemKey === key && !firedRef.current.has(itemKey)) {
        firedRef.current.add(itemKey);
        setLastChime(`${itemKey} ${item.label}`);
        playChime(item.soundId);
        setTimeout(() => firedRef.current.delete(itemKey), 61000);
        break;
      }
    }
  }, [now, running, schedule, ready]);

  const nextChime = useCallback(() => {
    const nowMin = now.hour * 60 + now.minute;
    const upcoming = schedule
      .filter((s) => s.enabled && s.hour * 60 + s.minute > nowMin)
      .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
    return upcoming[0] || null;
  }, [schedule, now]);

  const updateItem = (id: string, updates: Partial<ChimeTime>) => {
    setSchedule((prev) => {
      const next = prev.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      );
      saveSchedule(next);
      return next;
    });
  };

  const addItem = () => {
    const id = String(Date.now());
    const lastItem = sorted[sorted.length - 1];
    const newHour = lastItem
      ? lastItem.minute >= 50
        ? lastItem.hour + 1
        : lastItem.hour
      : 8;
    const newMinute = lastItem ? (lastItem.minute + 10) % 60 : 0;
    setSchedule((prev) => {
      const next = [
        ...prev,
        { id, hour: newHour, minute: newMinute, label: "新規", enabled: true, soundId: null },
      ];
      saveSchedule(next);
      return next;
    });
    setEditingId(id);
  };

  const removeItem = (id: string) => {
    setSchedule((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveSchedule(next);
      return next;
    });
    setEditingId(null);
  };

  const resetSchedule = () => {
    setSchedule(DEFAULT_SCHEDULE);
    saveSchedule(DEFAULT_SCHEDULE);
    setEditingId(null);
  };

  const handleAutostart = async (val: boolean) => {
    try {
      if (val) await enable();
      else await disable();
      setAutostart(val);
    } catch {}
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    setVolumeState(v);
  };

  const handleAddSound = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await addSound(file);
    setSounds(getSoundEntries());
    e.target.value = "";
  };

  const handleRemoveSound = async (id: string) => {
    await removeSound(id);
    setSounds(getSoundEntries());
    // この音源を使ってたチャイムをデフォルトに戻す
    setSchedule((prev) => {
      const next = prev.map((item) =>
        item.soundId === id ? { ...item, soundId: null } : item
      );
      saveSchedule(next);
      return next;
    });
  };

  const next = nextChime();
  const sorted = [...schedule].sort(
    (a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)
  );

  return (
    <div className="app">
      <div className="blackboard">
        <header className="header">
          <h1>SchoolChime</h1>
          <div className="clock">
            {formatTime(now.hour, now.minute)}
            <span style={{ fontSize: "0.5em", opacity: 0.6 }}>
              :{String(now.second).padStart(2, "0")}
            </span>
          </div>
          <div className="date-display">
            {now.year}年{now.month}月{now.date}日（{now.day}）
          </div>
        </header>

        <div className="status-bar">
          <div className="status-left">
            <button
              className={`toggle-btn ${running ? "active" : ""}`}
              onClick={() => setRunning(!running)}
            >
              {running ? "ON" : "OFF"}
            </button>
            <span className="status-text">
              {running
                ? next
                  ? `次: ${formatTime(next.hour, next.minute)} ${next.label}`
                  : "本日のチャイム終了"
                : "停止中"}
            </span>
          </div>
          <div className="status-right">
            {lastChime && <span className="last-chime">前回: {lastChime}</span>}
            <button className="test-btn" onClick={() => playTestChime()}>
              テスト
            </button>
          </div>
        </div>

        <div className="volume-bar">
          <span className="volume-icon">{volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={handleVolume}
            className="volume-slider"
          />
          <span className="volume-value">{Math.round(volume * 100)}%</span>
        </div>

        <div className="schedule-header">
          <span className="schedule-label">時間割</span>
          <button className="reset-link" onClick={resetSchedule}>
            リセット
          </button>
        </div>

        <div className="schedule">
          {sorted.map((item, i) => (
            <div
              key={item.id}
              className={`schedule-item ${!item.enabled ? "disabled" : ""} ${
                next?.id === item.id ? "next" : ""
              } ${editingId === item.id ? "editing" : ""}`}
              onClick={() => {
                if (editingId !== item.id) setEditingId(item.id);
              }}
            >
              {editingId === item.id ? (
                <div className="edit-row">
                  <div className="edit-row-top">
                    <input
                      type="time"
                      value={formatTime(item.hour, item.minute)}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const [h, m] = e.target.value.split(":").map(Number);
                        if (!isNaN(h) && !isNaN(m)) updateItem(item.id, { hour: h, minute: m });
                      }}
                      className="time-input"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <input
                      type="text"
                      value={item.label}
                      onChange={(e) =>
                        updateItem(item.id, { label: e.target.value })
                      }
                      className="label-input"
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                    <label className="switch" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={(e) =>
                          updateItem(item.id, { enabled: e.target.checked })
                        }
                      />
                      <span className="slider" />
                    </label>
                  </div>
                  <div className="edit-row-bottom">
                    <select
                      className="sound-select"
                      value={item.soundId || ""}
                      onChange={(e) =>
                        updateItem(item.id, {
                          soundId: e.target.value || null,
                        })
                      }
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="">デフォルト</option>
                      {sounds.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="preview-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        playTestChime(item.soundId);
                      }}
                    >
                      ▶
                    </button>
                    <button
                      className="remove-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeItem(item.id);
                      }}
                    >
                      ×
                    </button>
                    <button
                      className="done-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(null);
                      }}
                    >
                      OK
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="period-num">{i + 1}</span>
                  <span className="time">
                    {formatTime(item.hour, item.minute)}
                  </span>
                  <span className="label">{item.label}</span>
                  {item.soundId && (
                    <span className="sound-tag">
                      {getSoundName(item.soundId)}
                    </span>
                  )}
                  {!item.enabled && <span className="off-badge">OFF</span>}
                  {next?.id === item.id && (
                    <span className="next-badge">NEXT</span>
                  )}
                </>
              )}
            </div>
          ))}

          <button className="add-row" onClick={addItem}>
            + チャイムを追加
          </button>
        </div>

        <div className="sound-section">
          <div className="sound-header">
            <span className="sound-label">音源ライブラリ</span>
            <button
              className="sound-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              + 追加
            </button>
          </div>

          <div className="sound-list">
            <div className="sound-item default">
              <span className="sound-item-name">デフォルト（OtoLogic）</span>
              <button
                className="preview-btn"
                onClick={() => playTestChime(null)}
              >
                ▶
              </button>
            </div>
            {sounds.map((s) => (
              <div key={s.id} className="sound-item">
                <span className="sound-item-name">{s.name}</span>
                <button
                  className="preview-btn"
                  onClick={() => playTestChime(s.id)}
                >
                  ▶
                </button>
                <button
                  className="remove-btn small"
                  onClick={() => handleRemoveSound(s.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleAddSound}
            style={{ display: "none" }}
          />
        </div>

        <div className="settings-row">
          <span className="settings-label">Windows起動時に自動起動</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={autostart}
              onChange={(e) => handleAutostart(e.target.checked)}
            />
            <span className="slider" />
          </label>
        </div>

        <div className="chalk-tray">
          <div className="chalk-piece white" />
          <div className="chalk-piece yellow" />
          <div className="chalk-piece pink" />
          <div className="chalk-piece blue" />
        </div>

        <footer className="credit">
          効果音:{" "}
          <a
            href="https://otologic.jp"
            target="_blank"
            rel="noopener noreferrer"
          >
            OtoLogic
          </a>{" "}
          (CC BY 4.0)
        </footer>
      </div>
    </div>
  );
}
