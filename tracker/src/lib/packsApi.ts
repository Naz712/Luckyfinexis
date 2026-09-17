// Meeting Pack API client. The app never holds a key: it talks to the small
// server in tracker/server, which holds the keys and calls the speech-to-text
// and report services. Where the server is comes from VITE_PACKS_API at build
// time, or from the Connect box on the New pack screen (kept in localStorage),
// or once from ?api=…&code=… on the app's URL.
import type { PackKind, PackSource, ReportContent } from "../mock/packs";

export interface ApiSettings {
  /** "http://192.168.1.20:8787" or a tunnel URL. Empty means the stand-in pipeline. */
  url: string;
  /** Sent as X-Access-Code when the server requires one. */
  code: string;
}

const STORE_KEY = "finexis.packsApi";
const BUILD_DEFAULT = String((import.meta.env.VITE_PACKS_API as string | undefined) ?? "").trim();

function readStore(): ApiSettings | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<ApiSettings>;
    return { url: String(s.url ?? "").trim(), code: String(s.code ?? "") };
  } catch {
    return null;
  }
}

export function saveApiSettings(s: ApiSettings): void {
  try {
    if (!s.url && !s.code) localStorage.removeItem(STORE_KEY);
    else localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    // Private mode or blocked storage: the setting lasts for this visit only.
  }
}

/** ?api=https://…&code=… on the app URL sets the server once, then leaves the address bar. */
function applyQueryOverride(): void {
  try {
    const u = new URL(window.location.href);
    const api = u.searchParams.get("api");
    const code = u.searchParams.get("code");
    if (api === null && code === null) return;
    const prev = readStore() ?? { url: BUILD_DEFAULT, code: "" };
    saveApiSettings({ url: normaliseUrl(api ?? prev.url), code: code ?? prev.code });
    u.searchParams.delete("api");
    u.searchParams.delete("code");
    window.history.replaceState(null, "", u.toString());
  } catch {
    // Not in a browser, or a URL we cannot rewrite.
  }
}

export function loadApiSettings(): ApiSettings {
  applyQueryOverride();
  return readStore() ?? { url: normaliseUrl(BUILD_DEFAULT), code: "" };
}

export function normaliseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function hostLabel(url: string): string {
  try {
    const u = new URL(url);
    return u.port && !["80", "443"].includes(u.port) ? `${u.hostname}:${u.port}` : u.hostname;
  } catch {
    return url;
  }
}

// ── Requests and responses (mirrored by tracker/server/index.mjs) ──

export interface ApiInput {
  id: string;
  kind: PackSource;
  filename?: string;
  media_type?: string;
  /** Base64 of the file, for recap, photo and document. */
  data?: string;
  /** The typed lines. */
  text?: string;
  duration_sec?: number;
}

export interface MakeRequest {
  client: { name: string; since: string };
  advisor: { name: string };
  /** ISO date of the meeting. */
  met_on: string;
  products: { id: string; name: string }[];
  inputs: ApiInput[];
}

export type ApiReport = Omit<ReportContent, "attachments">;

export interface ApiNumber {
  label: string;
  value: string;
  source: PackSource;
  source_note: string;
}

export interface MakeResponse {
  meeting: { kind: PackKind };
  /** "12:41" once the recap was transcribed and the audio dropped; null when there was no recap. */
  recording_deleted_at: string | null;
  transcript: string | null;
  /** Page counts by input id, for PDFs. */
  pages: Record<string, number>;
  timings: Record<string, number>;
  numbers: ApiNumber[];
  report: ApiReport;
}

export type ReworkCards = Partial<Omit<ApiReport, "private">>;

export interface HealthResponse {
  ok: boolean;
  mock: boolean;
  transcribe: string | null;
  report: string | null;
  access_code: boolean;
}

async function call<T>(settings: ApiSettings, path: string, init: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (settings.code) headers["X-Access-Code"] = settings.code;
  let res: Response;
  try {
    res = await fetch(`${settings.url}${path}`, { ...init, headers });
  } catch {
    throw new Error(`Could not reach the server at ${hostLabel(settings.url)}. Is it running, and is this phone on the same Wi-Fi?`);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON: fall through to the status message.
  }
  if (!res.ok) {
    const message = json && typeof json === "object" && typeof (json as { error?: unknown }).error === "string" ? (json as { error: string }).error : `The server replied ${res.status}.`;
    throw new Error(message);
  }
  return json as T;
}

export function checkHealth(settings: ApiSettings): Promise<HealthResponse> {
  return call<HealthResponse>(settings, "/health", { method: "GET" });
}

export function makePack(settings: ApiSettings, req: MakeRequest): Promise<MakeResponse> {
  return call<MakeResponse>(settings, "/packs/make", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
}

export async function reworkPack(settings: ApiSettings, report: ReportContent, notes: Record<string, string>): Promise<ReworkCards> {
  const { attachments: _attachments, ...rest } = report;
  const res = await call<{ cards: ReworkCards }>(settings, "/packs/rework", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report: rest, notes }) });
  return res.cards ?? {};
}

// ── Ask: the assistant's tool loop runs in the app; the server only talks to the model ──

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export function askServer(settings: ApiSettings, body: { advisor: { name: string }; today: string; messages: ChatMessage[]; tools: readonly unknown[] }): Promise<{ message: ChatMessage }> {
  return call<{ message: ChatMessage }>(settings, "/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

// ── Media helpers for the New pack screen ──

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(blob);
  });
}

/** Shrinks a photo to at most `max` px on its long side as a JPEG, so uploads stay small and under the model's image limits. Returns the original if anything fails. */
export async function downscaleImage(blob: Blob, max = 2000): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && blob.type === "image/jpeg" && blob.size < 4 * 1024 * 1024) return blob;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    return out ?? blob;
  } catch {
    return blob;
  }
}

/** True when the browser can record here: a secure context (HTTPS or localhost) with a microphone API. */
export function canRecord(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

/** The first recording format this browser supports; Safari gives audio/mp4, Chrome audio/webm. */
export function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/wav"].find((m) => MediaRecorder.isTypeSupported(m));
}

export function recapFilename(mime: string | undefined): string {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("webm")) return "recap.webm";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "recap.m4a";
  if (m.includes("ogg")) return "recap.ogg";
  if (m.includes("wav")) return "recap.wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "recap.mp3";
  return "recap.bin";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

/** "2 min 14 s", "48 s" */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`;
}

/** "0:42" for the recording clock. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
