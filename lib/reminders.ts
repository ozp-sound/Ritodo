import { env } from "cloudflare:workers";
import type { State } from "./ledger";
import { coursesOn, firstMonday, semesterWeeks } from "./timetable";

export type ReminderJob = { id: string; title: string; body: string; due: number; start: number };
export function reminderJobs(state: State, now = Date.now()): ReminderJob[] {
  if (!state.remindersEnabledAt) return [];
  const enabled = Date.parse(state.remindersEnabledAt);
  const jobs: ReminderJob[] = [];
  const add = (id: string, title: string, dateTime: string, location: string, changed = 0) => {
    const start = Date.parse(dateTime + ":00+08:00");
    for (const hours of [24, 4]) {
      const due = start - hours * 3600000;
      if (due < Math.max(enabled, changed) || due < now - 10 * 60000 || start <= now) continue;
      jobs.push({ id: `${id}|${dateTime}|${hours}`, title: "理 · " + title, body: `还有${hours === 24 ? "一天" : "4 小时"}：${dateTime.replace("T", " ")}${location ? " · " + location : ""}`, due, start });
    }
  };
  for (const e of state.events || []) if (!e.cancelledAt) {
    // A moved event's elapsed lead times are not backfilled. Title/location edits keep sent IDs.
    const moved = e.history.findLast(h => h.start !== e.start);
    add(e.id, e.title, e.start, e.location, Date.parse(moved?.at || e.createdAt));
  }
  for (let i = 0; i < semesterWeeks * 7; i++) {
    const date = new Date(Date.parse(firstMonday + "T00:00:00Z") + i * 86400000).toISOString().slice(0, 10);
    for (const c of coursesOn(date, state.courseOverrides)) if (c.sessions.length) {
      add(c.id, c.name, date + "T" + c.sessions[0].start, c.room, Date.parse(state.courseOverrides?.[c.id]?.at || "1970-01-01T00:00:00Z"));
    }
  }
  return jobs;
}

export async function reminderRequest(path: string, body?: unknown) {
  const service = (env as unknown as { REMINDERS?: Fetcher }).REMINDERS;
  const url = process.env.REMINDER_WORKER_URL, key = process.env.REMINDER_API_KEY;
  if (!key || (!service && !url)) throw new Error("提醒后台尚未配置。");
  const options = { method: body === undefined ? "GET" : "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(12000) };
  const response = service ? await service.fetch("https://reminders.internal" + path, options) : await fetch(url! + path, options);
  const result = await response.json() as { error?: string; [key: string]: unknown };
  if (!response.ok) throw new Error(result.error || "提醒后台暂时无法连接。");
  return result;
}
