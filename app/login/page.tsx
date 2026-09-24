"use client";

import { useState, type FormEvent } from "react";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "登录失败。");
      location.replace("/");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "登录失败。"); }
    finally { setBusy(false); }
  }
  return <main className="login-shell">
    <form className="login-card" onSubmit={submit}>
      <div className="login-avatar">理</div>
      <h1>Ritodo</h1>
      <p>输入你的密码</p>
      <input type="password" autoComplete="current-password" autoFocus value={password} onChange={event => setPassword(event.target.value)} aria-label="Ritodo 密码" />
      {error && <div className="login-error" role="alert">{error}</div>}
      <button disabled={busy || !password}>{busy ? "登录中…" : "进入"}</button>
    </form>
  </main>;
}
