import assert from "node:assert/strict";
import { emptyState, recordEntry, undoEntry, totalsFor, toCents, applyMemoryCommand } from "./ledger.ts";

const state = emptyState();
const make = (kind, amount) => ({
  kind, amount, category: kind === "income" ? "生活费" : "餐饮", note: "synthetic test", date: "2026-09-17",
});
assert.equal(toCents("0.29"), 29);
for (const value of ["-1", "NaN", "1.001", "1e3", ""]) assert.throws(() => toCents(value));
recordEntry(state, make("expense", "20"), "one");
assert.throws(() => recordEntry(state, make("expense", "20"), "one"));
recordEntry(state, make("income", "2000"), "two");
assert.deepEqual(totalsFor(state.entries, "2026-09"), { income: 200000, expense: 2000 });
assert.throws(() => recordEntry(state, make("transfer", "30"), "three"));
assert.throws(() => recordEntry(state, { ...make("expense", "1"), account: "微信零钱" }, "account"));
assert.throws(() => recordEntry(state, { ...make("expense", "1"), date: "2026-02-30" }, "date"));
undoEntry(state, "one");
undoEntry(state, "one");
assert.deepEqual(totalsFor(JSON.parse(JSON.stringify(state.entries)), "2026-09"), { income: 200000, expense: 0 });
assert.throws(() => undoEntry(state, "missing"));
console.log("PASS: cents, monthly income and expense totals, duplicate prevention, undo, strict input and serialization");
const memoryState = emptyState();
const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
assert.match(applyMemoryCommand(memoryState, { action: "remember", fact: "我更喜欢简短直接的回答" }, first), /记住了/);
assert.equal(memoryState.memories.length, 1);
assert.match(applyMemoryCommand(memoryState, { action: "remember", fact: "我更喜欢简短直接的回答" }, second), /已经记得/);
assert.equal(memoryState.memories.length, 1);
assert.match(applyMemoryCommand(memoryState, { action: "list" }, second), /简短直接/);
assert.match(applyMemoryCommand(memoryState, { action: "update", id: first, fact: "技术问题可以详细解释" }, second), /改好了/);
assert.equal(memoryState.memories[0].fact, "技术问题可以详细解释");
assert.match(applyMemoryCommand(memoryState, { action: "forget", id: first }, second), /忘掉了/);
assert.equal(memoryState.memories.length, 0);
assert.throws(() => applyMemoryCommand(memoryState, { action: "forget", id: first }, second));
const full = emptyState();
for (let i = 0; i < 100; i++) full.memories.push({ id: crypto.randomUUID(), fact: "记忆" + i, createdAt: "", updatedAt: "" });
assert.throws(() => applyMemoryCommand(full, { action: "remember", fact: "超出上限" }, first));
console.log("PASS: long-term memory remember, deduplicate, list, update, forget and limit");
