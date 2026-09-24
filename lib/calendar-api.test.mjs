// Exercise the real route with an isolated in-memory store, never the user's D1 data.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { emptyState } from "./ledger.ts";
import { coursesOn } from "./timetable.ts";
import { checkAccess } from "./access.ts";
const dataUrl = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
let state = emptyState();
globalThis.calendarTestStore = {
  localAccess: request => checkAccess(request, true), readBody: request => request.json(),
  readState: async () => structuredClone(state),
  saveState: async next => { assert.equal(next.revision, state.revision); next.revision++; state = structuredClone(next); },
};
const store = dataUrl("export const {localAccess,readBody,readState,saveState}=globalThis.calendarTestStore;");
const source = await readFile(new URL("../app/api/calendar/route.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replaceAll('"zod"', JSON.stringify(import.meta.resolve("zod")))
  .replaceAll('"@/lib/store"', JSON.stringify(store))
  .replace(/"@\/lib\/(events|timetable)"/g, (_, name) => JSON.stringify(new URL(`./${name}.ts`, import.meta.url).href));
const { POST } = await import(dataUrl(code));
const call = async (operation, { id = crypto.randomUUID(), revision = state.revision, origin = "http://localhost:5173" } = {}) => {
  const response = await POST(new Request("http://localhost:5173/api/calendar", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ id, revision, operation }) }));
  return { status: response.status, body: await response.json() };
};
const course = coursesOn("2026-09-28")[0];
const details = { title: "隔离测试安排", start: "2026-09-28T08:00", end: "2026-09-28T09:30", location: "", note: "" };
const op = { kind: "event", event: { action: "create", details }, replace: [course.id] };
const id = crypto.randomUUID();
assert.equal((await call(op, { id })).status, 200);
assert.equal(state.events.length, 1);
assert.equal(state.courseOverrides[course.id].skipped, true);
assert.equal((await call(op, { id, revision: 0 })).status, 200); // Response-lost retry.
assert.equal(state.events.length, 1);
const before = JSON.stringify(state);
assert.equal((await call({ ...op, event: { action: "create", details: { ...details, title: "不应保存" } }, replace: ["invalid"] })).status, 400);
assert.equal(JSON.stringify(state), before);
assert.equal((await call({ kind: "course", courseId: course.id, skipped: false }, { revision: 0 })).status, 400);
assert.equal((await call({ kind: "course", courseId: course.id, skipped: false }, { origin: "https://other.example" })).status, 400);
assert.equal(JSON.stringify(state), before);
assert.equal((await call({ kind: "event", event: { action: "update", id, changes: { start: "2026-09-29T12:00", end: null } }, replace: [] })).status, 200);
assert.equal(state.courseOverrides[course.id].skipped, true);
assert.equal((await call({ kind: "event", event: { action: "cancel", id }, replace: [] })).status, 200);
assert.ok(state.events[0].cancelledAt);
assert.equal(state.courseOverrides[course.id].skipped, true);
assert.equal((await call({ kind: "course", courseId: course.id, skipped: false })).status, 200);
assert.equal(state.courseOverrides[course.id].skipped, false);
assert.equal(state.events[0].history.length, 1);
delete globalThis.calendarTestStore;
console.log("Calendar API: atomic replacement, persistent snapshot, replay, stale edit, origin, move, cancel and restore passed.");
