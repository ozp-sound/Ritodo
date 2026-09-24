import assert from "node:assert/strict";
import { applyEventCommand, eventCommand, overlaps } from "./events.ts";
import { courseConflicts } from "./timetable.ts";
const state = { entries: [{ id: "keep-ledger" }] }; // Older saved snapshots have no events field.
const id = "724ac1ac-edcc-4a32-81d1-75943c155313";
const other = "36a1b3c9-e4ac-49de-a5b3-4684d4f813db";
const details = { title: "和朋友吃饭", start: "2026-09-26T19:00", end: null, location: "", note: "" };
const run = (cmd, key = id) => applyEventCommand(state, cmd, key, courseConflicts, new Date("2026-09-24T02:00:00Z"));
assert.match(run({ action: "create", details }), /已保存/);
assert.equal(state.entries[0].id, "keep-ledger");
assert.equal(state.events[0].end, null);
assert.throws(() => run({ action: "create", details }, other), /已存在/);
const snapshot = JSON.stringify(state);
for (const start of ["2026-02-30T12:00", "2026-09-26T25:00", "2026-09-26", "2026-09-26T19:00Z"]) {
  assert.equal(eventCommand.safeParse({ action: "create", details: { ...details, start } }).success, false);
}
assert.throws(() => run({ action: "update", id, changes: { end: "2026-09-26T18:00" } }));
assert.equal(JSON.stringify(state), snapshot);
assert.match(run({ action: "update", id, changes: { location: "食堂" } }), /已修改/);
assert.equal(state.events[0].start, details.start);
assert.equal(state.events[0].history.length, 1);
assert.match(run({ action: "create", details: { ...details, title: "电话", end: "2026-09-26T20:00" } }, other), /时间冲突/);
assert.match(run({ action: "query", from: "2026-09-26T00:00", to: "2026-09-27T00:00" }), /食堂/);
assert.match(run({ action: "cancel", id }), /已取消/);
assert.match(run({ action: "cancel", id }), /已经取消/);
assert.doesNotMatch(run({ action: "query", from: null, to: null }), /和朋友吃饭/);
assert.throws(() => run({ action: "update", id, changes: { title: "新标题" } }), /已取消/);
assert.throws(() => run({ action: "cancel", id: "dce69649-1aec-4cbd-bb78-5316983727a8" }), /找不到/);
assert.equal(JSON.parse(JSON.stringify(state)).events.length, 2);
assert.equal(overlaps({ start: "2026-09-26T19:00", end: "2026-09-26T20:00" }, { start: "2026-09-26T20:00", end: null }), false);
assert.equal(courseConflicts({ start: "2026-09-28T09:35", end: "2026-09-28T09:50" }).length, 0);
assert.match(courseConflicts({ start: "2026-09-28T08:00", end: null }).join(), /高等数学/);
assert.match(courseConflicts({ start: "2026-09-27T23:00", end: "2026-09-28T08:30" }).join(), /高等数学/);
assert.equal(courseConflicts({ start: "2026-10-09T20:00", end: null }).length, 0);
assert.throws(() => run({ action: "query", from: "2026-09-27T00:00", to: "2026-09-26T00:00" }));
console.log("PASS: old-state compatibility, create/query/update/cancel, audit history, duplicate guard, validation atomicity, conflicts and class breaks");
