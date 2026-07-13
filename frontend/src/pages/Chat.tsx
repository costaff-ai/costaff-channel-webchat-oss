import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AuthError,
  fetchHistory,
  fetchMe,
  getToken,
  resetSession,
  runAgent,
  uploadFile,
} from "@/lib/api";
import type { Attachment, Me } from "@/lib/types";
import { escapeHtml, formatReply } from "@/lib/markdown";
import { useVoiceInput } from "@/hooks/useVoiceInput";

type Role = "user" | "agent" | "system" | "thinking";

interface ChatItem {
  id: number;
  role: Role;
  html: string;
}

interface SlashCommand {
  cmd: string;
  icon: string;
  desc: string;
}

const COMMANDS: SlashCommand[] = [
  { cmd: "/start", icon: "fa-play", desc: "身份驗證並問候" },
  { cmd: "/reset", icon: "fa-rotate-right", desc: "重設對話" },
  { cmd: "/profile", icon: "fa-id-card", desc: "查看個人資料" },
  { cmd: "/list", icon: "fa-list-check", desc: "查看提醒任務" },
  { cmd: "/help", icon: "fa-circle-question", desc: "顯示可用指令" },
  { cmd: "/whoami", icon: "fa-user", desc: "查看帳號資訊" },
];

interface ChatPageProps {
  onLogout: () => void;
}

export default function ChatPage({ onLogout }: ChatPageProps) {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<ChatItem[]>([
    {
      id: 0,
      role: "system",
      html: "Welcome to CoStaff WebChat. Type <code>/help</code> to see available commands.",
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const idRef = useRef(1);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const statusLabel = !me ? "Connecting…" : thinking ? "Thinking…" : "Connected";
  const statusClass = "badge-live";

  function appendItem(role: Role, html: string): number {
    const id = idRef.current++;
    setItems((prev) => [...prev, { id, role, html }]);
    return id;
  }

  function removeItem(id: number) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  // ── Auth + restore transcript on mount ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchMe();
        if (cancelled) return;
        setMe(data);
        // Single persistent thread: replace the seed welcome with the saved
        // conversation so closing and reopening the window resumes it.
        const hist = await fetchHistory();
        if (cancelled || hist.length === 0) return;
        setItems(
          hist.map((h) => {
            const id = idRef.current++;
            if (h.role === "file") {
              const name = h.filename ?? "file";
              const html = h.url
                ? `<a href="${escapeHtml(h.url)}" download="${escapeHtml(name)}" target="_blank" rel="noopener">📎 ${escapeHtml(name)}</a>`
                : `📎 ${escapeHtml(name)}`;
              return { id, role: "agent" as Role, html };
            }
            const text = h.text ?? "";
            const html = h.role === "user" ? escapeHtml(text) : formatReply(text);
            return { id, role: (h.role === "user" ? "user" : "agent") as Role, html };
          }),
        );
      } catch (err) {
        if (err instanceof AuthError) onLogout();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Async push stream (SSE) ───────────────────────────────────────────
  // Background task results the Manager said it would "notify" about are
  // delivered here — WebChat is otherwise request/response, so without this
  // an async result would have nowhere to land.
  useEffect(() => {
    if (!me) return;
    const token = getToken();
    if (!token) return;
    const es = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);
    es.onmessage = (ev) => {
      let frame: { type?: string; text?: string; name?: string; url?: string; agent?: string; status?: string };
      try {
        frame = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (frame.type === "agent_text") {
        if (frame.text) appendItem("agent", formatReply(frame.text));
      } else if (frame.type === "agent_file" && frame.url) {
        appendItem(
          "agent",
          `<a href="${escapeHtml(frame.url)}" download="${escapeHtml(frame.name ?? "file")}" target="_blank" rel="noopener">📎 ${escapeHtml(frame.name ?? "file")}</a>`,
        );
      } else if (frame.type === "agent_progress" && frame.text) {
        const who = frame.agent ? `${escapeHtml(frame.agent)}: ` : "";
        appendItem("system", `⚙️ ${who}${escapeHtml(frame.text)}`);
      }
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  // ── Auto-scroll on new message ────────────────────────────────────────
  useLayoutEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, thinking]);

  // ── Slash menu state ──────────────────────────────────────────────────
  const slashMatches = useMemo(() => {
    if (!input.startsWith("/") || input.includes(" ")) return [];
    return COMMANDS.filter((c) => c.cmd.startsWith(input));
  }, [input]);
  const slashOpen = slashMatches.length > 0;
  const [slashFocus, setSlashFocus] = useState(-1);
  useEffect(() => {
    setSlashFocus(-1);
  }, [input]);

  function selectSlash(cmd: string) {
    setInput(cmd + " ");
    textareaRef.current?.focus();
  }

  // ── Auto-resize textarea (1–6 lines) ──────────────────────────────────
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cs = getComputedStyle(ta);
    const lineHeight = parseFloat(cs.lineHeight || "23") || 23;
    const padding =
      (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const maxH = lineHeight * 6 + padding;
    ta.style.height = "auto";
    const h = Math.min(ta.scrollHeight, maxH);
    ta.style.height = `${h}px`;
    ta.style.overflowY = ta.scrollHeight > maxH ? "auto" : "hidden";
  }, [input]);

  // ── Voice input ────────────────────────────────────────────────────────
  const voice = useVoiceInput({
    onTranscript: (transcript, startOffset) => {
      setInput((prev) => prev.slice(0, startOffset) + transcript);
    },
    getCurrentLength: () => input.length,
    onError: (err) => appendItem("system", `⚠️ Voice error: ${escapeHtml(err)}`),
  });

  // ── File upload ────────────────────────────────────────────────────────
  async function onFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const att = await uploadFile(file);
        att.filename = att.filename || file.name;
        setPending((prev) => [...prev, att]);
      } catch (err) {
        if (err instanceof AuthError) return onLogout();
        appendItem("system", `⚠️ Failed to upload ${escapeHtml(file.name)}.`);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePending(idx: number) {
    setPending((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── Send ───────────────────────────────────────────────────────────────
  async function doRunAgent(prompt: string, attachments: Attachment[]) {
    setBusy(true);
    setThinking(true);
    let thinkingId: number | null = null;
    setItems((prev) => {
      const id = idRef.current++;
      thinkingId = id;
      return [...prev, { id, role: "thinking", html: "" }];
    });
    try {
      const data = await runAgent(prompt, attachments);
      if (thinkingId !== null) removeItem(thinkingId);
      appendItem("agent", formatReply(data.reply || "⚠️ No response."));
      if (data.files?.length) {
        const links = data.files
          .map(
            (f) =>
              `<a href="${escapeHtml(f.url)}" download="${escapeHtml(f.filename)}" target="_blank" rel="noopener">📎 ${escapeHtml(f.filename)}</a>`,
          )
          .join("<br>");
        appendItem("agent", links);
      }
    } catch (err) {
      if (thinkingId !== null) removeItem(thinkingId);
      if (err instanceof AuthError) return onLogout();
      const msg = (err as Error).message || "Connection error.";
      appendItem("system", `⚠️ ${escapeHtml(msg)}`);
    } finally {
      setBusy(false);
      setThinking(false);
    }
  }

  async function runLabeledCmd(label: string, prompt: string) {
    setInput("");
    appendItem("system", `<code>${escapeHtml(label)}</code>`);
    await doRunAgent(prompt, []);
  }

  function showHelp() {
    const lines = COMMANDS.map(
      (c) => `<code>${escapeHtml(c.cmd)}</code> — ${escapeHtml(c.desc)}`,
    ).join("<br>");
    appendItem("system", `<strong>可用指令：</strong><br>${lines}`);
  }

  function showWhoami() {
    if (!me) return;
    appendItem(
      "system",
      `<strong>Signed in as:</strong> ${escapeHtml(me.username)} (${escapeHtml(me.email)})<br><strong>Session ID:</strong> <code>${escapeHtml(me.session_id)}</code>`,
    );
  }

  async function doReset() {
    if (!confirm("Reset this conversation?")) return;
    setItems([]);
    setPending([]);
    appendItem("system", "Session reset.");
    try {
      await resetSession();
    } catch {
      // ignore
    }
  }

  async function handleSend() {
    const raw = input.trim();
    if (!raw && pending.length === 0) return;

    // Built-in slash commands (only if no attachments)
    if (pending.length === 0) {
      if (raw === "/start") return runLabeledCmd("/start", "Please check my identity and greet me.");
      if (raw === "/reset") {
        setInput("");
        return doReset();
      }
      if (raw === "/profile") return runLabeledCmd("/profile", "Show my profile.");
      if (raw === "/list") return runLabeledCmd("/list", "List my reminders.");
      if (raw === "/help") {
        setInput("");
        return showHelp();
      }
      if (raw === "/whoami") {
        setInput("");
        return showWhoami();
      }
    }

    let userHtml = raw ? formatReply(raw) : "";
    if (pending.length > 0) {
      const extra = pending
        .map((a) => {
          if (a.type === "image" && a.data && a.mimeType) {
            return `<img src="data:${a.mimeType};base64,${a.data}" alt="${escapeHtml(a.filename)}" style="max-width:200px;max-height:160px;border-radius:8px;margin-top:6px;display:block">`;
          }
          return `<div style="margin-top:6px"><i class="fas fa-file" style="color:var(--primary)"></i> <code>${escapeHtml(a.filename)}</code></div>`;
        })
        .join("");
      userHtml += extra;
    }
    if (userHtml) appendItem("user", userHtml);

    const attachmentsToSend = pending;
    setPending([]);
    setInput("");
    await doRunAgent(raw, attachmentsToSend);
  }

  function onTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // IME 組字中（注音/拼音/日韓）按 Enter 是「選字確認」，不是送出。
    // isComposing 為組字狀態；keyCode 229 是部分瀏覽器在 IME 未結束時的特徵值。
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (slashOpen) {
      const matches = slashMatches;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashFocus((i) => Math.min(i + 1, matches.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashFocus((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && slashFocus >= 0) {
        e.preventDefault();
        selectSlash(matches[slashFocus].cmd);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setInput("");
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-main)", color: "var(--on-surface)" }}>
      <div className="ambient-blobs pointer-events-none">
        <div className="blob w-[700px] h-[900px] bg-blue-600/10 top-[-10%] left-1/2 -translate-x-1/2" />
      </div>
      <div className="grid-overlay pointer-events-none" />

      {/* Sidebar */}
      <aside
        className="flex flex-col flex-shrink-0"
        style={{ width: 220, background: "var(--surface-low)", borderRight: "1px solid var(--dm-border)" }}
      >
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3" style={{ color: "var(--primary)" }}>
            <i className="fas fa-robot text-2xl" />
            <span
              className="text-xl font-bold"
              style={{ fontFamily: "'Space Grotesk', sans-serif", color: "var(--on-surface)" }}
            >
              CoStaff
            </span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-2">
          <div className="sidebar-group-label">Workspace</div>
          <div className="sidebar-item active w-full flex items-center gap-3 px-4 py-3 rounded-xl">
            <i className="fas fa-comments w-4 text-center" />
            <span>Chat</span>
          </div>
        </nav>

        <div className="p-4 border-t" style={{ borderColor: "var(--dm-border)" }}>
          <div className="px-4 py-2 mb-2 rounded-xl" style={{ background: "var(--surface-container)" }}>
            <div
              className="text-xs font-bold uppercase mb-1"
              style={{
                color: "var(--dm-text-muted)",
                letterSpacing: ".08em",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              Signed in as
            </div>
            <div className="text-sm font-semibold truncate" style={{ color: "var(--on-surface)" }}>
              {me?.username ?? "—"}
            </div>
            <div className="text-xs truncate" style={{ color: "var(--dm-text-muted)" }}>
              {me?.email ?? "—"}
            </div>
          </div>
          <button
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{ color: "var(--dm-text-secondary)" }}
            onClick={() => {
              if (confirm("Logout?")) onLogout();
            }}
          >
            <i className="fas fa-power-off w-4 text-center" /> Logout
          </button>
        </div>
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col min-w-0">
        <header
          className="flex items-center justify-between px-8 h-16 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--dm-border)" }}
        >
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Team Chat
            </h2>
            <span className={`status-badge ${statusClass}`}>
              <span className="badge-dot" /> {statusLabel}
            </span>
          </div>
          <button
            title="Reset conversation"
            onClick={doReset}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              background: "var(--surface-container)",
              color: "var(--dm-text-secondary)",
              border: "1px solid var(--dm-border)",
            }}
          >
            <i className="fas fa-rotate-right" /> Reset
          </button>
        </header>

        <div
          ref={messagesRef}
          className="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-4 custom-scrollbar"
        >
          {items.map((it) =>
            it.role === "thinking" ? (
              <div key={it.id} className="chat-msg thinking">
                <div className="thinking-dots">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ) : (
              <div
                key={it.id}
                className={`chat-msg ${it.role}`}
                dangerouslySetInnerHTML={{ __html: it.html }}
              />
            ),
          )}
        </div>

        <div className="px-8 pb-6 pt-3 flex-shrink-0">
          {slashOpen && (
            <div
              className="mb-2 rounded-xl overflow-hidden"
              style={{
                background: "var(--surface-container)",
                border: "1px solid var(--dm-border)",
                boxShadow: "0 8px 24px rgba(0,0,0,.4)",
              }}
            >
              <div
                className="px-3 py-2 text-xs font-bold uppercase tracking-widest"
                style={{
                  color: "var(--dm-text-muted)",
                  fontFamily: "'Space Grotesk', sans-serif",
                  borderBottom: "1px solid var(--dm-border)",
                }}
              >
                Commands
              </div>
              {slashMatches.map((c, i) => (
                <div
                  key={c.cmd}
                  className={`slash-item ${i === slashFocus ? "focused" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectSlash(c.cmd);
                  }}
                >
                  <i className={`fas ${c.icon} w-4 text-center`} style={{ color: "var(--primary)" }} />
                  <span className="slash-cmd">{c.cmd}</span>
                  <span className="slash-desc">{c.desc}</span>
                </div>
              ))}
            </div>
          )}

          {pending.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {pending.map((att, idx) => (
                <div key={idx} className="file-chip">
                  <i className={`fas ${att.type === "image" ? "fa-image" : "fa-file"}`} />
                  <span>{att.filename}</span>
                  <button
                    className="file-chip-remove"
                    title="Remove"
                    onClick={() => removePending(idx)}
                  >
                    <i className="fas fa-xmark" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div
            className="input-container flex items-end gap-2 rounded-2xl"
            style={{
              background: "var(--surface-container)",
              border: "1px solid var(--dm-border)",
              padding: "8px 10px",
            }}
          >
            <label
              title="Attach file"
              className="flex-shrink-0 flex items-center justify-center transition-all cursor-pointer"
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                background: "var(--surface-high)",
                color: "var(--dm-text-secondary)",
              }}
            >
              <i className="fas fa-paperclip" style={{ fontSize: 11 }} />
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept="image/*,.pdf,.csv,.xlsx,.xls,.txt,.docx,.md,.json,.zip"
                onChange={(e) => onFiles(e.target.files)}
              />
            </label>
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Message CoStaff… or type / for commands"
              className="flex-1 resize-none outline-none text-sm leading-relaxed bg-transparent custom-scrollbar"
              style={{
                color: "var(--on-surface)",
                fontFamily: "'Manrope', sans-serif",
                overflowY: "hidden",
              }}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onTextareaKeyDown}
            />
            <button
              title={
                !voice.supported
                  ? "Voice input not supported in this browser"
                  : voice.recording
                    ? "Stop recording"
                    : "Voice input"
              }
              disabled={!voice.supported}
              onClick={voice.toggle}
              className="flex-shrink-0 flex items-center justify-center transition-all"
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                background: voice.recording ? "rgba(239,68,68,.15)" : "var(--surface-high)",
                color: voice.recording ? "#ef4444" : "var(--dm-text-secondary)",
                opacity: voice.supported ? 1 : 0.35,
                cursor: voice.supported ? "pointer" : "not-allowed",
              }}
            >
              <i className="fas fa-microphone" style={{ fontSize: 11 }} />
            </button>
            <button
              onClick={handleSend}
              disabled={busy}
              className="flex-shrink-0 flex items-center justify-center transition-all"
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                background: "var(--primary-container)",
                color: "#fff",
              }}
            >
              <i className="fas fa-paper-plane" style={{ fontSize: 11 }} />
            </button>
          </div>
          <p className="text-center mt-2 text-xs" style={{ color: "var(--dm-text-muted)" }}>
            Enter to send · Shift+Enter for new line · / for commands ·{" "}
            <i className="fas fa-microphone" /> for voice
          </p>
        </div>
      </main>
    </div>
  );
}
