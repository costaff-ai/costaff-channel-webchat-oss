import { useState } from "react";
import { clearToken, getToken } from "@/lib/api";
import LoginPage from "@/pages/Login";
import ChatPage from "@/pages/Chat";

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => Boolean(getToken()));

  function logout() {
    clearToken();
    setAuthed(false);
  }

  if (!authed) {
    return <LoginPage onAuthed={() => setAuthed(true)} />;
  }
  return <ChatPage onLogout={logout} />;
}
