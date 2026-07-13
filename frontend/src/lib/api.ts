import type { Attachment, LoginResponse, Me, RunResponse } from "./types";

const TOKEN_KEY = "webchat_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("webchat_user");
}

function authHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken() ?? ""}`,
  };
}

export class AuthError extends Error {}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (res.status === 401) throw new AuthError("Unauthorized");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return jsonOrThrow<LoginResponse>(res);
}

export async function fetchMe(): Promise<Me> {
  const res = await fetch("/api/auth/me", { headers: authHeaders() });
  return jsonOrThrow<Me>(res);
}

export interface HistoryItem {
  role: "user" | "agent" | "file" | "system";
  text?: string;
  filename?: string;
  url?: string;
}

export async function fetchHistory(): Promise<HistoryItem[]> {
  const res = await fetch("/api/history", { headers: authHeaders() });
  const data = await jsonOrThrow<{ items: HistoryItem[] }>(res);
  return data.items ?? [];
}

export async function runAgent(
  text: string,
  attachments: Attachment[],
): Promise<RunResponse> {
  const res = await fetch("/api/run", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ text, attachments }),
  });
  return jsonOrThrow<RunResponse>(res);
}

export async function uploadFile(file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    body: formData,
  });
  return jsonOrThrow<Attachment>(res);
}

export async function resetSession(): Promise<void> {
  await fetch("/api/session", { method: "DELETE", headers: authHeaders() });
}
