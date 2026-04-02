export interface SoundEntry {
  id: string;
  name: string;
}

let audioCtx: AudioContext | null = null;
let gainNode: GainNode | null = null;
let defaultAudioBuffer: AudioBuffer | null = null;
const soundBuffers = new Map<string, AudioBuffer>();
const soundEntries: SoundEntry[] = [];
let currentVolume = 0.7;

const VOLUME_KEY = "school-chime-volume";

const DB_NAME = "school-chime-db";
const DB_VERSION = 2;
const SOUNDS_STORE = "sounds";

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    gainNode = audioCtx.createGain();
    gainNode.gain.value = currentVolume;
    gainNode.connect(audioCtx.destination);
  }
  return audioCtx;
}

function getGainNode(): GainNode {
  getAudioContext();
  return gainNode!;
}

export function setVolume(v: number) {
  currentVolume = Math.max(0, Math.min(1, v));
  if (gainNode) gainNode.gain.value = currentVolume;
  localStorage.setItem(VOLUME_KEY, String(currentVolume));
}

export function getVolume(): number {
  return currentVolume;
}

function loadVolume() {
  const saved = localStorage.getItem(VOLUME_KEY);
  if (saved !== null) currentVolume = parseFloat(saved);
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      // v1 store cleanup
      if (e.oldVersion < 2) {
        if (db.objectStoreNames.contains("audio")) db.deleteObjectStore("audio");
      }
      if (!db.objectStoreNames.contains(SOUNDS_STORE)) {
        db.createObjectStore(SOUNDS_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// 音源を保存
export async function addSound(file: File): Promise<SoundEntry> {
  const id = `sound_${Date.now()}`;
  const data = await file.arrayBuffer();
  const ctx = getAudioContext();
  const buffer = await ctx.decodeAudioData(data.slice(0));

  const db = await openDB();
  const tx = db.transaction(SOUNDS_STORE, "readwrite");
  tx.objectStore(SOUNDS_STORE).put({ id, name: file.name, data });
  await new Promise<void>((r) => { tx.oncomplete = () => r(); });

  soundBuffers.set(id, buffer);
  const entry = { id, name: file.name };
  soundEntries.push(entry);
  return entry;
}

// 音源を削除
export async function removeSound(id: string) {
  const db = await openDB();
  const tx = db.transaction(SOUNDS_STORE, "readwrite");
  tx.objectStore(SOUNDS_STORE).delete(id);
  await new Promise<void>((r) => { tx.oncomplete = () => r(); });

  soundBuffers.delete(id);
  const idx = soundEntries.findIndex((e) => e.id === id);
  if (idx !== -1) soundEntries.splice(idx, 1);
}

// 全音源をロード
export async function initAudio() {
  loadVolume();
  const ctx = getAudioContext();

  // デフォルト音源
  const res = await fetch("/sounds/chime-default.mp3");
  const data = await res.arrayBuffer();
  defaultAudioBuffer = await ctx.decodeAudioData(data);

  // カスタム音源
  const db = await openDB();
  const tx = db.transaction(SOUNDS_STORE, "readonly");
  const all: { id: string; name: string; data: ArrayBuffer }[] = await new Promise((r) => {
    const req = tx.objectStore(SOUNDS_STORE).getAll();
    req.onsuccess = () => r(req.result);
  });

  for (const item of all) {
    try {
      const buffer = await ctx.decodeAudioData(item.data.slice(0));
      soundBuffers.set(item.id, buffer);
      soundEntries.push({ id: item.id, name: item.name });
    } catch {
      // 壊れたデータはスキップ
    }
  }
}

export function getSoundEntries(): SoundEntry[] {
  return [...soundEntries];
}

export function getSoundName(soundId: string | null): string {
  if (!soundId) return "デフォルト";
  const entry = soundEntries.find((e) => e.id === soundId);
  return entry?.name || "デフォルト";
}

function playBuffer(buffer: AudioBuffer): Promise<void> {
  const ctx = getAudioContext();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(getGainNode());
  source.start();
  return new Promise((resolve) => { source.onended = () => resolve(); });
}

export function playChime(soundId?: string | null): Promise<void> {
  let buffer: AudioBuffer | null | undefined;
  if (soundId) {
    buffer = soundBuffers.get(soundId);
  }
  if (!buffer) buffer = defaultAudioBuffer;
  if (!buffer) return Promise.resolve();
  return playBuffer(buffer);
}

export function playTestChime(soundId?: string | null) {
  playChime(soundId);
}
