// Typed API client. Types come from src/api/schema.d.ts, generated from backend/openapi.json
// (`npm run gen:api`); never hand-write API shapes here.
import type { components } from "./schema";
import { createPasskey, getPasskey } from "../webauthn";

export type S = components["schemas"];
export type Role = S["LoginOut"]["role"];

export interface Session {
  token: string;
  role: Role;
  institution_id: string | null;
  display_name: string;
  user_id: string;
}

const KEY = "apaar.session";

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session | null) {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: session lives in memory only */
  }
}

/** application/problem+json error from the backend */
export class ApiError extends Error {
  constructor(public status: number, public title: string, public detail: unknown) {
    super(title);
  }
  get text(): string {
    if (typeof this.detail === "string") return `${this.title}: ${this.detail}`;
    if (this.detail && typeof this.detail === "object" && "missing" in this.detail)
      return `${this.title}: ${(this.detail as { missing: string[] }).missing.join(", ")}`;
    return this.title;
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const s = loadSession();
  const headers = new Headers(init.headers);
  if (s && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${s.token}`);
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    let title = res.statusText, detail: unknown = null;
    try {
      const p = await res.json();
      title = p.title ?? title;
      detail = p.detail ?? null;
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 401 && s) onUnauthorized();
    throw new ApiError(res.status, title, detail);
  }
  return res;
}

export async function getJson<T>(path: string): Promise<T> {
  return (await request(path)).json() as Promise<T>;
}

export async function sendJson<T>(path: string, method: string, body?: unknown, headers: HeadersInit = {}): Promise<T> {
  const res = await request(path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json() as Promise<T>;
}

export async function login(user_id: string, password: string): Promise<Session> {
  const out = await sendJson<S["LoginOut"]>("/v1/auth/login", "POST", { user_id, password });
  const s: Session = { token: out.access_token, role: out.role, institution_id: out.institution_id, display_name: out.display_name, user_id };
  saveSession(s);
  return s;
}

/** MOCK student sign-in: APAAR ID + date of birth (YYYY-MM-DD). */
export async function studentLogin(apaar_id: string, dob: string): Promise<Session> {
  const out = await sendJson<S["LoginOut"]>("/v1/auth/student-login", "POST", { apaar_id, dob });
  const s: Session = { token: out.access_token, role: out.role, institution_id: null, display_name: out.display_name, user_id: "student" };
  saveSession(s);
  return s;
}

/** Passkeys (P1): redeem a one-time activation code, then register a passkey with the 15-minute setup session. */
export async function activateAndRegister(apaar_id: string, code: string): Promise<S["SetupOut"]> {
  const setup = await sendJson<S["SetupOut"]>("/v1/auth/activate", "POST", { apaar_id, code });
  const h = { Authorization: `Bearer ${setup.setup_token}` };
  const options = await sendJson<unknown>("/v1/passkeys/register/options", "POST", undefined, h);
  const credential = await createPasskey(options);
  await sendJson("/v1/passkeys/register/verify", "POST", { credential }, h);
  return setup;
}

/** Discoverable passkey sign-in: no APAAR typed; the device picks the account. */
export async function passkeyLogin(): Promise<Session> {
  const options = await sendJson<unknown>("/v1/auth/passkey/options", "POST");
  const credential = await getPasskey(options);
  const out = await sendJson<S["LoginOut"]>("/v1/auth/passkey/verify", "POST", { credential });
  const s: Session = { token: out.access_token, role: out.role, institution_id: null, display_name: out.display_name, user_id: out.role };
  saveSession(s);
  return s;
}

/** Approve a consent request with a passkey assertion whose challenge commits to that request. */
export async function approveWithPasskey(consentId: number) {
  const options = await sendJson<unknown>(`/v1/consents/${consentId}/approve/options`, "POST");
  const credential = await getPasskey(options);
  return sendJson(`/v1/consents/${consentId}/approve`, "POST", { credential });
}

/** Upload a CSV. Idempotency-Key = SHA-256 of the file, so re-uploading the same file replays the original batch. */
export async function uploadCsv(file: File): Promise<S["BatchOut"]> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const key = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "text/csv" }), file.name);
  const res = await request("/v1/batches", { method: "POST", body: form, headers: { "Idempotency-Key": key } });
  return res.json() as Promise<S["BatchOut"]>;
}

/** Authenticated file download (the report endpoints need the bearer token, so a plain link won't do). */
export async function download(path: string, filename: string) {
  const blob = await (await request(path)).blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
