import { useEffect, useState } from "react";
import { login, setToken } from "@/lib/api";

interface AlertState {
  kind: "error" | "success";
  message: string;
}

interface LoginPageProps {
  onAuthed: () => void;
}

export default function LoginPage({ onAuthed }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [busy, setBusy] = useState(false);

  async function doLogin() {
    const e = email.trim();
    if (!e || !password) {
      setAlert({ kind: "error", message: "Please fill in all fields." });
      return;
    }
    setBusy(true);
    setAlert(null);
    try {
      const data = await login(e, password);
      setToken(data.access_token);
      onAuthed();
    } catch (err) {
      setAlert({ kind: "error", message: (err as Error).message || "Login failed." });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      // 別在 IME 組字中（注音選字的 Enter）就觸發登入
      if (ev.isComposing || ev.keyCode === 229) return;
      if (ev.key === "Enter") doLogin();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, password]);

  return (
    <div className="login-shell">
      <div className="ambient-blobs pointer-events-none">
        <div
          className="blob w-[700px] h-[900px] bg-blue-600/10 top-[-10%] left-1/2"
          style={{ transform: "translateX(-50%)" }}
        />
      </div>
      <div className="grid-overlay pointer-events-none" />

      <div className="login-card">
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
          <div
            style={{
              width: 48,
              height: 48,
              background: "var(--primary-container)",
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <i className="fas fa-robot" style={{ color: "#fff", fontSize: "1.3rem" }} />
          </div>
          <div>
            <h1
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: "1.4rem",
                fontWeight: 800,
                color: "var(--on-surface)",
              }}
            >
              CoStaff
            </h1>
            <p style={{ fontSize: ".78rem", color: "var(--dm-text-muted)", marginTop: 2 }}>
              WebChat · AI Team Workspace
            </p>
          </div>
        </div>

        {alert && <div className={`login-alert ${alert.kind}`}>{alert.message}</div>}

        <div style={{ marginBottom: 14 }}>
          <label className="login-label">Email</label>
          <input
            type="email"
            className="login-input"
            placeholder="your@email.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label className="login-label">Password</label>
          <input
            type="password"
            className="login-input"
            placeholder="Enter password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="login-btn" disabled={busy} onClick={doLogin}>
          <i className="fas fa-sign-in-alt" /> &nbsp;Login
        </button>
      </div>
    </div>
  );
}
