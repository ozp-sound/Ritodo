"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import type { State } from "@/lib/ledger";
import { coursesOn, overlappingCourses, teachingWeek } from "@/lib/timetable";
import { overlaps, type PersonalEvent } from "@/lib/events";
import Notifications from "./notifications";

const todayInShanghai = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
const shift = (date: string, days: number) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const weekdays = "一二三四五六日";
type Course = ReturnType<typeof coursesOn>[number];
type Draft = Pick<PersonalEvent, "title" | "start" | "end" | "location" | "note">;

export default function Calendar({ state, busy, mutate, refresh }: {
  state: State; busy: boolean; mutate: (path: string, body: unknown) => Promise<boolean>; refresh: () => Promise<void>;
}) {
  const [date, setDate] = useState(todayInShanghai);
  const [now, setNow] = useState("");
  const [selection, setSelection] = useState<{ kind: "course" | "event" | "new"; id: string } | null>(null);
  const [draft, setDraft] = useState<Draft>({ title: "", start: "", end: null, location: "", note: "" });
  const [replace, setReplace] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const panel = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { const tick = () => setNow(new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 16)); tick(); const timer = setInterval(tick, 60000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (selection) { panel.current?.focus(); panel.current?.scrollIntoView({ block: "start", behavior: "smooth" }); } }, [selection]);
  const monday = shift(date, -((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => shift(monday, i));
  const events = (state.events || []).filter(e => !e.cancelledAt);
  const course = selection?.kind === "course" ? coursesOn(selection.id.slice(0, 10), state.courseOverrides, true).find(c => c.id === selection.id) : undefined;
  const editing = selection?.kind === "event" ? events.find(e => e.id === selection.id) : undefined;
  const conflicts = selection && selection.kind !== "course" && draft.start ? overlappingCourses(draft, state.courseOverrides) : [];
  const personalConflicts = draft.start ? events.filter(e => e.id !== editing?.id && overlaps(draft, e)) : [];
  function close() { setSelection(null); opener.current?.focus(); }
  function open(button: HTMLButtonElement, item?: Course | PersonalEvent) {
    opener.current = button; setNotice(""); setReplace([]);
    if (item && "sessions" in item) setSelection({ kind: "course", id: item.id });
    else {
      setDraft(item ? { title: item.title, start: item.start, end: item.end, location: item.location, note: item.note } : { title: "", start: date + "T09:00", end: null, location: "", note: "" });
      setSelection({ kind: item ? "event" : "new", id: item?.id || "" });
    }
  }
  async function save(operation: unknown) {
    if (await mutate("/api/calendar", { revision: state.revision, operation })) { close(); setNotice("已保存"); }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void save({ kind: "event", event: editing ? { action: "update", id: editing.id, changes: draft } : { action: "create", details: draft }, replace: replace.filter(id => conflicts.some(c => c.id === id)) });
  }
  return <section className="calendar" aria-label="日程日历">
    <div className="calendar-toolbar">
      <div><h1>日程</h1><p>{monday.slice(5).replace("-", "/")} — {days[6].slice(5).replace("-", "/")}<span> · {teachingWeek(date) >= 1 && teachingWeek(date) <= 16 ? `第 ${teachingWeek(date)} 周` : "已录入学期外"}</span></p></div>
      <button className="primary-button" disabled={busy} onClick={e => open(e.currentTarget)}><Plus size={18} />新安排</button>
    </div>
    <div className="calendar-controls">
      <div><button className="secondary-button" aria-label="上一周" disabled={busy} onClick={() => { setDate(shift(date, -7)); close(); }}><ChevronLeft size={18} /></button><button className="secondary-button" disabled={busy} onClick={() => { setDate(todayInShanghai()); close(); }}>今天</button><button className="secondary-button" aria-label="下一周" disabled={busy} onClick={() => { setDate(shift(date, 7)); close(); }}><ChevronRight size={18} /></button></div>
      <input className="calendar-date" type="date" aria-label="日期" value={date} min="2000-01-01" max="2099-12-31" disabled={busy} onChange={e => { if (/^20\d{2}-\d{2}-\d{2}$/.test(e.target.value)) { setDate(e.target.value); close(); } }} />
    </div>
    <Notifications refresh={refresh} />
    {notice && <p className="calendar-notice" role="status">{notice}</p>}
    {selection && <section className="calendar-detail" tabIndex={-1} ref={panel} aria-label="日程详情">
      <div className="calendar-detail-heading"><h2>{course ? course.name : editing ? "编辑安排" : "新安排"}</h2><button className="secondary-button" aria-label="关闭详情" disabled={busy} onClick={close}><X size={18} /></button></div>
      {course ? <><p>{course.date} · {course.periods}节 · {course.room}</p><p>{course.sessions.map(s => `${s.start}–${s.end}`).join(" / ") || "时间待定"}</p><button className="primary-button" disabled={busy} onClick={() => void save({ kind: "course", courseId: course.id, skipped: !course.skipped })}>{course.skipped ? "恢复" : "这次不去"}</button></> : <form onSubmit={submit}>
        <fieldset disabled={busy} className="calendar-fields">
          <label className="calendar-wide">做什么<input required maxLength={100} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="例如：和朋友吃饭" /></label>
          <label>开始<input type="datetime-local" required min="2000-01-01T00:00" max="2099-12-31T23:59" value={draft.start} onChange={e => { setDraft({ ...draft, start: e.target.value }); setReplace([]); }} /></label>
          <label>结束（可不填）<input type="datetime-local" min={draft.start} max="2099-12-31T23:59" value={draft.end || ""} onChange={e => { setDraft({ ...draft, end: e.target.value || null }); setReplace([]); }} /><span className="field-hint">不填时只检查开始时刻冲突</span></label>
          <label>地点<input maxLength={200} value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} /></label>
          <label>备注<input maxLength={500} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} /></label>
          {(conflicts.length > 0 || personalConflicts.length > 0) && <div className="calendar-conflicts calendar-wide"><h3>时间重叠</h3><p>勾选课程，表示这次不去。</p>{conflicts.map(c => <label key={c.id}><input type="checkbox" checked={replace.includes(c.id)} onChange={e => setReplace(e.target.checked ? [...replace, c.id] : replace.filter(id => id !== c.id))} /><span>{c.name} · {c.periods}节</span></label>)}{personalConflicts.map(e => <p key={e.id}>与「{e.title}」重叠</p>)}</div>}
          <div className="calendar-actions calendar-wide"><button className="primary-button">{busy ? "保存中…" : "保存"}</button>{editing && <button type="button" className="secondary-button" onClick={() => { if (window.confirm(`取消「${editing.title}」？`)) void save({ kind: "event", event: { action: "cancel", id: editing.id }, replace: [] }); }}>取消安排</button>}</div>
        </fieldset>
      </form>}
    </section>}
    <div className="calendar-week" aria-label="本周日期">{days.map((day, i) => <button key={day} aria-pressed={date === day} className={day === now.slice(0, 10) ? "is-today" : ""} onClick={() => setDate(day)}><span>周{weekdays[i]}</span><strong>{Number(day.slice(8))}</strong>{day === now.slice(0, 10) && <small>今天</small>}</button>)}</div>
    <div className="calendar-days">{days.map((day, i) => {
      const courses = coursesOn(day, state.courseOverrides, true);
      const dayEvents = events.filter(e => e.start < shift(day, 1) + "T00:00" && (e.end ? e.end > day + "T00:00" : e.start >= day + "T00:00"));
      const items = [...courses.map(c => ({ id: c.id, start: c.sessions[0]?.start || "99:99", course: c, event: undefined as PersonalEvent | undefined })), ...dayEvents.map(e => ({ id: e.id, start: e.start.slice(0, 10) < day ? "00:00" : e.start.slice(11), course: undefined as Course | undefined, event: e }))].sort((a, b) => a.start.localeCompare(b.start));
      return <section key={day} className={"calendar-day " + (date === day ? "selected-day" : "")} aria-label={`${day} 周${weekdays[i]}`}>
        <h2>{day.slice(5)} · 周{weekdays[i]}</h2>
        {!items.length && <p className="calendar-empty">暂无安排</p>}
        {items.map(item => {
          const c = item.course, e = item.event;
          const active = c ? !c.skipped && c.date === now.slice(0, 10) && c.sessions.some(s => s.start <= now.slice(11) && s.end > now.slice(11)) : e!.start <= now && !!e!.end && e!.end > now;
          return <button key={item.id} disabled={busy} className={`calendar-item ${c ? "class-item" : "personal-item"} ${c?.skipped ? "skipped" : ""} ${active ? "happening" : ""}`} onClick={ev => open(ev.currentTarget, c || e)}>
            <span className="calendar-item-type">{c ? c.skipped ? "课程 · 本次不去" : "课程" : "个人安排"}{active && " · 正在进行"}</span>
            <strong>{c?.name || e!.title}</strong>
            <time>{c ? c.sessions.map(s => `${s.start}–${s.end}`).join(" / ") || `${c.periods}节 · 时间待定` : `${e!.start.slice(0, 10) < day ? "前日开始" : e!.start.slice(11)}${e!.end ? "–" + (e!.end.slice(0, 10) > day ? "跨日" : e!.end.slice(11)) : " · 结束未定"}`}</time>
            {(c?.room || e?.location) && <span>{c?.room || e?.location}</span>}
          </button>;
        })}
      </section>;
    })}</div>
  </section>;
}
