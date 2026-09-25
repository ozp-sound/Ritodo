import { z } from "zod";
import type { PersonalEvent } from "./events";
import type { CourseOverrides } from "./timetable";

export type Entry = { id: string; kind: "expense" | "income" | "transfer"; account?: string; target?: string; cents: number; category: string; note: string; date: string; createdAt: string; undoneAt?: string };
export type Message = { role: "user" | "assistant"; content: string; at: string };
export type Memory = { id: string; fact: string; createdAt: string; updatedAt: string };
export const memoryCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("remember"), fact: z.string().trim().min(1).max(240) }).strict(),
  z.object({ action: z.literal("update"), id: z.string().uuid(), fact: z.string().trim().min(1).max(240) }).strict(),
  z.object({ action: z.literal("forget"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("list") }).strict(),
]);
export type State = { entries: Entry[]; messages: Message[]; requests: string[]; revision: number; memories?: Memory[]; events?: PersonalEvent[]; courseOverrides?: CourseOverrides; remindersEnabledAt?: string; reminderWarning?: string };
export function emptyState(): State {
  return { entries: [], messages: [], requests: [], revision: 0, memories: [] };
}
export function applyMemoryCommand(state: State, raw: unknown, requestId: string, now = new Date()): string {
  const command = memoryCommand.parse(raw), memories = state.memories ||= [], at = now.toISOString();
  if (command.action === "list") return memories.length ? "我记得这些：\n" + memories.map(m => "- " + m.fact).join("\n") : "长期记忆还是空的。";
  if (command.action === "remember") {
    const existing = memories.find(m => m.fact.toLocaleLowerCase() === command.fact.toLocaleLowerCase());
    if (existing) return "这件事我已经记得：" + existing.fact;
    if (memories.length >= 100) throw new Error("长期记忆已满，请先让我忘掉一些旧内容。");
    memories.push({ id: requestId, fact: command.fact, createdAt: at, updatedAt: at });
    return "嗯，记住了：" + command.fact;
  }
  const existing = memories.find(m => m.id === command.id);
  if (!existing) throw new Error("找不到这条长期记忆，请先问我「你记得我什么」。");
  if (command.action === "forget") {
    memories.splice(memories.indexOf(existing), 1);
    return "忘掉了：" + existing.fact;
  }
  if (memories.some(m => m.id !== existing.id && m.fact.toLocaleLowerCase() === command.fact.toLocaleLowerCase())) throw new Error("这条长期记忆已经存在。");
  const before = existing.fact; existing.fact = command.fact; existing.updatedAt = at;
  return "改好了：" + before + " → " + existing.fact;
}
export const money = (cents: number) => (cents / 100).toFixed(2);
export function toCents(value: string): number {
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(value)) throw new Error("金额请填写非负数字，最多两位小数。");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function totalsFor(entries: Entry[], prefix: string) {
  return entries.reduce((totals, entry) => {
    if (!entry.undoneAt && entry.date.startsWith(prefix) && entry.kind !== "transfer") totals[entry.kind] += entry.cents;
    return totals;
  }, { income: 0, expense: 0 });
}
export const entryInput = z.object({
  kind: z.enum(["expense", "income"]),
  amount: z.string().max(12),
  category: z.string().min(1).max(30),
  note: z.string().max(300),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();
export function recordEntry(state: State, raw: unknown, id: string): string {
  const input = entryInput.parse(raw);
  const date = new Date(input.date + "T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) throw new Error("日期无效。");
  const cents = toCents(input.amount);
  if (cents === 0) throw new Error("交易金额必须大于零。");
  if (state.entries.some(entry => entry.id === id)) throw new Error("这笔交易已处理，请刷新查看。");
  state.entries.push({ kind: input.kind, category: input.category, note: input.note, date: input.date, cents, id, createdAt: new Date().toISOString() });
  return "已记录" + (input.kind === "income" ? "收入" : "支出") + " ¥" + money(cents) + " · " + input.category + "。";
}
export function undoEntry(state: State, id: string) {
  const entry = state.entries.find(item => item.id === id);
  if (!entry) throw new Error("找不到这笔交易。");
  if (entry.undoneAt) return;
  entry.undoneAt = new Date().toISOString();
}
