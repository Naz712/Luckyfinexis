// The app's side of the server: where it is, who is signed in, and the two
// calls (the signed-in FA's production rows, and one assistant turn). The
// app never holds an API key; the server does. Without a server the app runs
// on the bundled sample import (the "stand-in").
//
// Sign-in for the prototype is an individual link: the admin generates one
// per FA from the server (their FC code plus a key the server derives), so
// opening it shows that FA's own book and nothing else. Real single sign-on
// with the firm's existing accounts belongs to the deployment choice.
import type { ImportRow } from "../mock/data";

export interface ApiSettings {
  /** "https://finexis-packs-api.onrender.com" or a tunnel URL. Empty means the stand-in. */
  url: string;
  /** Sent as X-Access-Code when the server requires one. */
  code: string;
}

/** Where the rows on screen came from: the bundled sample, the server (the signed-in FA's own rows), or the sample because the server could not be used. */
export type DataSource = { kind: "sample" } | { kind: "server"; as_of: string | null } | { kind: "team"; as_of: string } | { kind: "error"; message: string };

export interface Session {
  fc_code: string;
  /** The per-FA key from their individual link. */
  key: string;
}

const STORE_KEY = "finexis.api";
const SESSION_KEY = "finexis.session";
const BUILD_DEFAULT = String((import.meta.env.VITE_PACKS_API as string | undefined) ?? "").trim();

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: the setting lasts for this visit only.
  }
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

/** ?api=…&code=… sets the server once; ?fc=…&key=… signs in once. Both leave the address bar afterwards. */
function applyQueryOverride(): void {
  try {
    const u = new URL(window.location.href);
    const api = u.searchParams.get("api");
    const code = u.searchParams.get("code");
    const fc = u.searchParams.get("fc");
    const key = u.searchParams.get("key");
    if (api === null && code === null && fc === null && key === null) return;
    if (api !== null || code !== null) {
      const prev = readJson<ApiSettings>(STORE_KEY) ?? { url: BUILD_DEFAULT, code: "" };
      writeJson(STORE_KEY, { url: normaliseUrl(api ?? prev.url), code: code ?? prev.code });
    }
    if (fc !== null && key !== null) writeJson(SESSION_KEY, { fc_code: fc.toUpperCase(), key });
    for (const k of ["api", "code", "fc", "key"]) u.searchParams.delete(k);
    window.history.replaceState(null, "", u.toString());
  } catch {
    // Not in a browser, or a URL we cannot rewrite.
  }
}

export function loadApiSettings(): ApiSettings {
  applyQueryOverride();
  const s = readJson<ApiSettings>(STORE_KEY);
  return s ? { url: normaliseUrl(String(s.url ?? "")), code: String(s.code ?? "") } : { url: normaliseUrl(BUILD_DEFAULT), code: "" };
}
export function saveApiSettings(s: ApiSettings): void {
  writeJson(STORE_KEY, !s.url && !s.code ? null : s);
}
export function loadSession(): Session | null {
  applyQueryOverride();
  const s = readJson<Session>(SESSION_KEY);
  return s && s.fc_code && s.key ? { fc_code: String(s.fc_code).toUpperCase(), key: String(s.key) } : null;
}
export function saveSession(s: Session | null): void {
  writeJson(SESSION_KEY, s);
}

// ── Calls ──

async function call<T>(settings: ApiSettings, path: string, init: RequestInit, session?: Session | null): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (settings.code) headers["X-Access-Code"] = settings.code;
  if (session) headers["X-FC"] = `${session.fc_code}:${session.key}`;
  let res: Response;
  try {
    res = await fetch(`${settings.url}${path}`, { ...init, headers });
  } catch {
    throw new Error(`Could not reach the server at ${hostLabel(settings.url)}. Is it running, and is this phone online?`);
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
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return json as T;
}

export interface HealthResponse {
  ok: boolean;
  mock: boolean;
  report: string | null;
  access_code: boolean;
  /** How many FAs the server's import holds, and its latest month. */
  import?: { advisers: number; as_of: string | null };
}

export function checkHealth(settings: ApiSettings): Promise<HealthResponse> {
  return call<HealthResponse>(settings, "/health", { method: "GET" });
}

export interface MeResponse {
  fc_code: string;
  name: string;
  /** The FA's own rows and, for a manager, their team's. */
  rows: ImportRow[];
  as_of: string | null;
}

/** The signed-in FA's production. 401 means the link's key is wrong or was rotated. */
export function fetchMe(settings: ApiSettings, session: Session): Promise<MeResponse> {
  return call<MeResponse>(settings, "/me", { method: "GET" }, session);
}

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
