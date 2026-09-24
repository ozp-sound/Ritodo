"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Brain, CalendarDays, Check, Download, MessageCircle, Moon, Pencil, RotateCcw, Sun, Trash2, WalletCards, X } from "lucide-react";
import { balances, money, type Memory, type State } from "@/lib/ledger";
import Calendar from "./calendar";

export default function Home() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [dark, setDark] = useState(false);
  const [view, setView] = useState<"chat" | "ledger" | "calendar" | "memory">("chat");
  const [initials, setInitials] = useState<Record<string, string>>({});
  const [manual, setManual] = useState(false);
  const [kind, setKind] = useState("expense");
  const [editingMemory, setEditingMemory] = useState("");
  const [forgettingMemory, setForgettingMemory] = useState("");
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryNotice, setMemoryNotice] = useState("");
  const pending = useRef<{ text: string; id: string } | null>(null);
  const ledgerPending = useRef<{ payload: string; id: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const response = await fetch("/api/ledger", { cache: "no-store" });
      const result = await response.json() as State & { error?: string };
      if (!response.ok) throw new Error(result.error);
      setState(result); setError("");
    } catch { setError("账本加载失败，请检查网络并确认已登录，再重试。"); }
  }
  useEffect(() => {
    const timer = setTimeout(() => { void load(); try { setDark(localStorage.getItem("ritodo-theme") === "dark"); } catch {} });
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const color = dark ? "#1c1c1e" : "#f2f2f7";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
    document.documentElement.style.backgroundColor = color;
    document.body.style.backgroundColor = color;
  }, [dark]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [state?.messages.length, busy]);
  function toggleTheme() { setDark(!dark); try { localStorage.setItem("ritodo-theme", dark ? "light" : "dark"); } catch {} }
  async function mutate(path: string, body: unknown) {
    setBusy(true); setError("");
    if (path === "/api/ledger" || path === "/api/calendar") {
      const { id: _id, ...fields } = body as Record<string, unknown>;
      const payload = path + JSON.stringify(fields);
      if (ledgerPending.current?.payload !== payload) ledgerPending.current = { payload, id: crypto.randomUUID() };
      body = { ...fields, id: ledgerPending.current.id };
    }
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as State & { error?: string };
      if (!response.ok) throw new Error(result.error || "保存失败。");
      setState(result);
      if (result.reminderWarning) setError(result.reminderWarning);
      if (path === "/api/ledger" || path === "/api/calendar") ledgerPending.current = null;
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "连接中断，请重试；输入已保留。"); return false; }
    finally { setBusy(false); }
  }
  async function send(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || busy || !state) return;
    if (pending.current?.text !== text) pending.current = { text, id: crypto.randomUUID() };
    if (await mutate("/api/chat", pending.current)) { setInput(""); pending.current = null; }
  }
  async function initialize(event: FormEvent) {
    event.preventDefault();
    const values = Object.fromEntries(Object.entries(initials).filter(([, value]) => value.trim() !== ""));
    if (!Object.keys(values).length) { setError("至少填写一个账户余额，其余可以留空。"); return; }
    if (await mutate("/api/ledger", { action: "balances", values, id: crypto.randomUUID() })) setInitials({});
  }
  async function manualEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const entry = { ...data, ...(kind === "transfer" ? {} : { target: undefined }) };
    if (await mutate("/api/ledger", { action: "entry", entry, id: crypto.randomUUID() })) setManual(false);
  }
  function startMemoryEdit(memory: Memory) { setEditingMemory(memory.id); setMemoryDraft(memory.fact); setForgettingMemory(""); setMemoryNotice(""); }
  async function saveMemory(memory: Memory) {
    const fact = memoryDraft.trim();
    if (!fact) { setMemoryNotice("记忆内容不能为空。"); return; }
    if (await mutate("/api/ledger", { action: "memory", memory: { action: "update", id: memory.id, fact }, id: crypto.randomUUID() })) {
      setEditingMemory(""); setMemoryNotice("已更新");
    }
  }
  async function forgetMemory(memory: Memory) {
    if (await mutate("/api/ledger", { action: "memory", memory: { action: "forget", id: memory.id }, id: crypto.randomUUID() })) {
      setForgettingMemory(""); setMemoryNotice("已忘记");
    }
  }
  function exportCsv() {
    if (!state) return;
    const cell = (value: string) => '"' + (/^[=+\-@\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""') + '"';
    const rows = [["日期", "类型", "账户", "转入账户", "金额", "分类", "备注", "状态"], ...state.entries.map(e => [e.date, e.kind === "expense" ? "支出" : e.kind === "income" ? "收入" : "转账", e.account, e.target || "", money(e.cents), e.category, e.note, e.undoneAt ? "已撤销" : "有效"])];
    const url = URL.createObjectURL(new Blob(["\ufeff" + rows.map(row => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "Ritodo-账本.csv"; link.click(); URL.revokeObjectURL(url);
  }
  const totals = state ? balances(state) : {};
  const configured = state?.accounts.filter(a => a.initial !== null) || [];
  const entries = state?.entries || [];
  return <main className={"jarvis-shell ritodo-live " + (dark ? "dark-mode" : "")}>
    <header className="topbar">
      <div className="brand">Ritodo</div>
      <button className="theme-toggle" onClick={toggleTheme} aria-label={dark ? "切换浅色模式" : "切换深色模式"}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
    </header>
    <nav className="live-nav" aria-label="主要导航">
      <button aria-pressed={view === "chat"} onClick={() => setView("chat")}><MessageCircle size={20} /><span>对话</span></button>
      <button aria-pressed={view === "calendar"} onClick={() => setView("calendar")}><CalendarDays size={20} /><span>日程</span></button>
      <button aria-pressed={view === "memory"} onClick={() => setView("memory")}><Brain size={20} /><span>记忆</span></button>
      <button aria-pressed={view === "ledger"} onClick={() => setView("ledger")}><WalletCards size={20} /><span>账本</span></button>
    </nav>
    <div className={"live-content" + (view === "calendar" ? " calendar-content" : "")}>
      {error && <div className="error-banner" role="alert">{error} {!state && <button onClick={load}>重新加载</button>}</div>}
      {!state ? <p className="live-muted">正在读取…</p> : <>
        {view === "calendar" ? <Calendar state={state} busy={busy} mutate={mutate} refresh={load} /> : view === "chat" ? <section className="live-chat view-panel" aria-label="与理对话">
          <div className="ri-heading"><div className="avatar">理</div><h1>理</h1></div>
          <div className="live-messages" aria-live="polite">
            {state.messages.length === 0 && <div className="live-bubble assistant">嗯，在。</div>}
            {state.messages.map((m, i) => <div className={"live-message " + m.role} key={i}><div className={"live-bubble " + m.role}>{m.content}</div><time>{new Date(m.at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>)}
            {busy && <p className="live-muted" role="status">理正在处理…</p>}<div ref={bottom} />
          </div>
          <form className="live-composer" onSubmit={send}><div className="composer"><textarea value={input} maxLength={4000} disabled={busy} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} rows={2} aria-label="输入消息" placeholder="发消息给理" /><button className="send-button" disabled={busy || !input.trim()} aria-label="发送"><ArrowUp size={20} /></button></div></form>
        </section> : view === "memory" ? <section className="live-memory view-panel" aria-label="理的长期记忆">
          <div className="section-heading"><h1>记忆</h1></div>
          {memoryNotice && <p className="memory-notice" role="status">{memoryNotice}</p>}
          {!state.memories?.length ? <div className="memory-empty"><Brain size={30} /><h2>还没有记忆</h2><p>对理说「记住……」</p><button className="primary-button" onClick={() => setView("chat")}>去对话</button></div> : <div className="memory-list">
            {state.memories.map(memory => <article className="memory-item" key={memory.id}>
              {editingMemory === memory.id ? <>
                <textarea value={memoryDraft} maxLength={240} autoFocus aria-label="编辑记忆" onChange={event => setMemoryDraft(event.target.value)} />
                <div className="memory-actions"><button className="memory-action primary" disabled={busy} onClick={() => void saveMemory(memory)}><Check size={17} />保存</button><button className="memory-action" onClick={() => setEditingMemory("")}><X size={17} />取消</button></div>
              </> : <><div className="memory-copy"><p>{memory.fact}</p></div>
                <div className="memory-actions"><button className="memory-action" onClick={() => startMemoryEdit(memory)}><Pencil size={17} />编辑</button>{forgettingMemory === memory.id ? <><button className="memory-action danger" disabled={busy} onClick={() => void forgetMemory(memory)}><Trash2 size={17} />确认忘记</button><button className="memory-action" onClick={() => setForgettingMemory("")}>取消</button></> : <button className="memory-action danger" onClick={() => { setForgettingMemory(memory.id); setEditingMemory(""); }}><Trash2 size={17} />忘记</button>}</div>
              </>}
            </article>)}
          </div>}
          <p className="memory-footnote">不会保存密码、API Key 或银行卡号</p>
        </section> : <section className="live-ledger view-panel" aria-label="账户与账本">
          <div className="ledger-heading"><div><p className="live-muted">总余额</p><h1>¥ {money(Object.values(totals).reduce<number>((sum, n) => sum + (n ?? 0), 0))}</h1></div><button className="secondary-button" onClick={exportCsv}><Download size={16} />导出</button></div>
          <div className="live-accounts">{configured.map(a => <div key={a.name}><span>{a.name}</span><strong>¥ {money(totals[a.name]!)}</strong></div>)}</div>
          <details className="balance-setup"><summary>余额</summary><form onSubmit={initialize}><div className="balance-fields">{state.accounts.map(a => <label key={a.name}>{a.name}<input aria-label={a.name + "当前余额"} inputMode="decimal" placeholder={totals[a.name] === null ? "未录入" : "¥" + money(totals[a.name]!)} value={initials[a.name] || ""} onChange={e => setInitials({ ...initials, [a.name]: e.target.value })} /></label>)}</div><button className="primary-button" disabled={busy}>保存</button></form></details>
          <div className="ledger-heading"><h2>明细</h2>{configured.length > 0 && <button className="secondary-button" disabled={busy} onClick={() => setManual(!manual)}>{manual ? "收起" : "记一笔"}</button>}</div>
          {manual && <form className="manual-form" onSubmit={manualEntry}>
            <label>类型<select name="kind" value={kind} onChange={e => setKind(e.target.value)}><option value="expense">支出</option><option value="income">收入</option><option value="transfer">转账</option></select></label>
            <label>账户<select name="account">{configured.map(a => <option key={a.name}>{a.name}</option>)}</select></label>
            {kind === "transfer" && <label>转入账户<select name="target">{configured.map(a => <option key={a.name}>{a.name}</option>)}</select></label>}
            <label>金额（元）<input name="amount" inputMode="decimal" required placeholder="0.00" /></label>
            <label>分类<input name="category" required defaultValue="其他" maxLength={30} /></label>
            <label>日期<input name="date" type="date" required defaultValue={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" })} /></label>
            <label>备注<input name="note" maxLength={300} /></label><button className="primary-button" disabled={busy}>保存</button>
          </form>}
          {!entries.length && <p className="live-muted">暂无记录</p>}
          <div className="entry-list">{[...entries].reverse().map(e => <article className={e.undoneAt ? "entry undone" : "entry"} key={e.id}><div><strong>{e.note || e.category}</strong><p>{e.account}{e.target ? " → " + e.target : ""} · {e.category} · {e.date}</p>{e.undoneAt && <small>已撤销</small>}</div><div><strong>{e.kind === "income" ? "+" : e.kind === "expense" ? "−" : "↔"} ¥{money(e.cents)}</strong>{!e.undoneAt && <button disabled={busy} onClick={() => mutate("/api/ledger", { action: "undo", entryId: e.id, id: crypto.randomUUID() })}><RotateCcw size={14} />撤销</button>}</div></article>)}</div>
        </section>}
      </>}
    </div>
  </main>;
}
