import { z } from "zod";
import type { PersonalEvent } from "./events";
import type { CourseOverrides } from "./timetable";
import { accountNames } from "./user-config.ts";

export { accountNames } from "./user-config.ts";
export type Account = { name: string; initial: number | null };
export type Entry = { id: string; kind: "expense" | "income" | "transfer"; account: string; target?: string; cents: number; category: string; note: string; date: string; createdAt: string; undoneAt?: string };
export type Message = { role: "user" | "assistant"; content: string; at: string };
export type Memory = { id: string; fact: string; createdAt: string; updatedAt: string };
export const memoryCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("remember"), fact: z.string().trim().min(1).max(240) }).strict(),
  z.object({ action: z.literal("update"), id: z.string().uuid(), fact: z.string().trim().min(1).max(240) }).strict(),
  z.object({ action: z.literal("forget"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("list") }).strict(),
]);
export type State = { accounts: Account[]; entries: Entry[]; messages: Message[]; requests: string[]; revision: number; memories?: Memory[]; events?: PersonalEvent[]; courseOverrides?: CourseOverrides; remindersEnabledAt?: string; reminderWarning?: string };
export function emptyState(): State {
  return { accounts: accountNames.map(name => ({ name, initial: null })), entries: [], messages: [], requests: [], revision: 0, memories: [] };
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
export function balances(state: State) {
  return Object.fromEntries(state.accounts.map(account => {
    if (account.initial === null) return [account.name, null];
    let balance = account.initial;
    for (const entry of state.entries) {
      if (entry.undoneAt) continue;
      if (entry.account === account.name) balance += entry.kind === "income" ? entry.cents : -entry.cents;
      if (entry.kind === "transfer" && entry.target === account.name) balance += entry.cents;
    }
    return [account.name, balance];
  })) as Record<string, number | null>;
}
export const entryInput = z.object({
  kind: z.enum(["expense", "income", "transfer"]),
  account: z.string().min(1).max(40),
  target: z.string().max(40).optional(),
  amount: z.string().max(12),
  category: z.string().min(1).max(30),
  note: z.string().max(300),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();
export function setBalances(state: State, values: Record<string, string>): string {
  const totals = balances(state);
  const changes = Object.entries(values).filter(([, value]) => value.trim() !== "").map(([name, value]) => {
    const account = state.accounts.find(item => item.name === name);
    if (!account) throw new Error("账户不存在。");
    return { account, before: totals[name], after: toCents(value.trim()) };
  });
  if (!changes.length) throw new Error("请填写要修改的余额，其余留空即可。");
  for (const { account, before, after } of changes) account.initial = (account.initial ?? 0) + after - (before ?? 0);
  return changes.map(({ account, before, after }) => account.name + "：" + (before === null ? "未录入" : "¥" + money(before)) + " → ¥" + money(after)).join("；") + "。余额已更新，不计入收支，原有交易保留。";
}
export function recordEntry(state: State, raw: unknown, id: string): string {
  const input = entryInput.parse(raw);
  const date = new Date(input.date + "T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) throw new Error("日期无效。");
  const cents = toCents(input.amount);
  if (cents === 0) throw new Error("交易金额必须大于零。");
  const totals = balances(state);
  if (totals[input.account] == null) throw new Error("请先录入「" + input.account + "」的初始余额。");
  if (input.kind === "transfer" && (input.target === input.account || !input.target || totals[input.target] == null)) throw new Error("转账需要两个不同且已录入余额的账户。");
  if (input.kind !== "income" && totals[input.account]! < cents) throw new Error("「" + input.account + "」余额不足，请确认金额或账户。");
  if (state.entries.some(entry => entry.id === id)) throw new Error("这笔交易已处理，请刷新查看。");
  const { amount, ...fields } = input;
  state.entries.push({ ...fields, cents, id, createdAt: new Date().toISOString() });
  const balance = balances(state)[input.account]!;
  return input.kind === "transfer"
    ? "已从" + input.account + "转入" + input.target + " ¥" + money(cents) + "，不计入收支。"
    : "已记录" + (input.kind === "income" ? "收入" : "支出") + " ¥" + money(cents) + " · " + input.category + "。"+ input.account + "余额 ¥" + money(balance) + "。";
}
export function undoEntry(state: State, id: string) {
  const entry = state.entries.find(item => item.id === id);
  if (!entry) throw new Error("找不到这笔交易。");
  if (entry.undoneAt) return;
  entry.undoneAt = new Date().toISOString();
  if (Object.values(balances(state)).some(value => value !== null && value < 0)) {
    delete entry.undoneAt;
    throw new Error("撤销会使账户余额为负。请先撤销相关的后续支出或转账。");
  }
}
