import { env } from "cloudflare:workers";
import { emptyState, type State } from "./ledger";
import { checkAccess } from "./access";
import { reminderJobs, reminderRequest } from "./reminders";

// ponytail: single-user JSON snapshot, capped at 800 KB; normalize into ledger tables when history grows.
export async function readState(): Promise<State> {
  if (!env.DB) throw new Error("账本数据库未连接。");
  const row = await env.DB.prepare("SELECT revision, data FROM personal_state WHERE id = 1").first<{ revision: number; data: string }>();
  return row ? { ...JSON.parse(row.data), revision: row.revision } : emptyState();
}
export async function saveState(state: State, changesReminders = false) {
  if (!env.DB) throw new Error("账本数据库未连接。");
  const json = JSON.stringify(state);
  if (new TextEncoder().encode(json).length > 800_000) throw new Error("记录已达到当前版本容量，请先导出并升级存储。");
  const sync = changesReminders && !!state.remindersEnabledAt;
  // Fail closed: first suspend the old schedule, then commit, then activate the new snapshot.
  // A failed commit/sync leaves reminders paused, recoverable through the explicit sync button.
  if (sync) await reminderRequest("/pause", { revision: state.revision });
  const result = state.revision === 0
    ? await env.DB.prepare("INSERT OR IGNORE INTO personal_state (id, revision, data) VALUES (1, 1, ?)").bind(json).run()
    : await env.DB.prepare("UPDATE personal_state SET revision = revision + 1, data = ? WHERE id = 1 AND revision = ?").bind(json, state.revision).run();
  if (result.meta.changes !== 1) throw new Error("另一项操作刚刚修改了数据，请刷新后重试。本次未保存。");
  state.revision++;
  if (sync) {
    try { await reminderRequest("/sync", { revision: state.revision, jobs: reminderJobs(state) }); }
    catch { state.reminderWarning = "日程已保存，但提醒同步失败。旧提醒已暂停；请到日程的通知设置点「重新同步」。"; }
  }
}
export function localAccess(request: Request) {
  checkAccess(request, process.env.NODE_ENV === "development");
}
export async function readBody(request: Request) {
  const text = await request.text();
  if (text.length > 32_000) throw new Error("内容太长，请分次提交。");
  return JSON.parse(text);
}
