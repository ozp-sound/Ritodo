// Isolated SQLite + mocked push transport: never touches real devices or production data.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { createECDH, randomBytes } from "node:crypto";
import ts from "typescript";
import { emptyState } from "./ledger.ts";
import { coursesOn } from "./timetable.ts";
const dataUrl = code => "data:text/javascript;base64," + Buffer.from(code).toString("base64");
async function moduleAt(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replaceAll('"cloudflare:workers"', JSON.stringify(dataUrl("export const env={};")))
    .replaceAll('"zod"', JSON.stringify(import.meta.resolve("zod")))
    .replaceAll('"@block65/webcrypto-web-push"', JSON.stringify(import.meta.resolve("@block65/webcrypto-web-push")))
    .replaceAll('"./timetable"', JSON.stringify(new URL("./timetable.ts", import.meta.url).href));
  return import(dataUrl(code));
}
const { reminderJobs } = await moduleAt("./reminders.ts");
const state = emptyState();
const now = Date.parse("2026-09-24T00:00:00Z");
assert.deepEqual(reminderJobs(state, now), []);
state.remindersEnabledAt = new Date(now).toISOString();
state.events = [{ id: "event", title: "晚饭", start: "2026-09-26T18:00", end: null, location: "餐厅", note: "私密备注", createdAt: state.remindersEnabledAt, updatedAt: state.remindersEnabledAt, history: [] }];
const eventJobs = () => reminderJobs(state, now).filter(j => j.id.startsWith("event|"));
assert.equal(eventJobs().length, 2);
assert.equal(eventJobs()[0].start - eventJobs()[0].due, 86400000);
assert.ok(!JSON.stringify(eventJobs()).includes("私密备注"));
state.events[0].cancelledAt = state.remindersEnabledAt;
assert.equal(eventJobs().length, 0);
delete state.events[0].cancelledAt;
state.events[0].history = [{ ...state.events[0], at: "2026-09-26T05:00:00Z", start: "2026-09-27T18:00" }];
assert.equal(eventJobs().length, 1); // Moved after 24h lead time; only 4h remains.
const course = coursesOn("2026-09-28")[0];
assert.ok(reminderJobs(state, now).some(j => j.id.startsWith(course.id + "|")));
state.courseOverrides = { [course.id]: { skipped: true, at: new Date(now).toISOString() } };
assert.ok(!reminderJobs(state, now).some(j => j.id.startsWith(course.id + "|")));

const db = new DatabaseSync(":memory:");
db.exec(await readFile(new URL("../reminder-worker/migrations/0001.sql", import.meta.url), "utf8"));
db.exec(await readFile(new URL("../reminder-worker/migrations/0002.sql", import.meta.url), "utf8"));
const DB = { prepare(sql) { let values = []; const stmt = db.prepare(sql); return { bind(...args) { values = args; return this; }, async first() { return stmt.get(...values) || null; }, async all() { return { results: stmt.all(...values) }; }, async run() { return { meta: { changes: Number(stmt.run(...values).changes) } }; } }; }, async batch(list) { return Promise.all(list.map(s => s.run())); } };
const vapid = createECDH("prime256v1"); vapid.generateKeys();
const device = createECDH("prime256v1"); device.generateKeys();
const env = { DB, API_KEY: "test-key", API_KEY_2: "second-key", APP_URL: "https://example.com/", VAPID_PUBLIC_KEY: vapid.getPublicKey().toString("base64url"), VAPID_PRIVATE_KEY: vapid.getPrivateKey().toString("base64url") };
const { default: worker } = await moduleAt("../reminder-worker/index.ts");
let clock = now, sends = 0, responseCode = 201;
const originalNow = Date.now, originalFetch = globalThis.fetch;
Date.now = () => clock;
globalThis.fetch = async (url, options) => { assert.equal(url, "https://web.push.apple.com/test"); assert.ok(options.body); assert.equal(new Headers(options.headers).get("Content-Encoding"), "aes128gcm"); sends++; return new Response(null, { status: responseCode }); };
const call = (path, body, auth = "test-key") => worker.fetch(new Request("https://example.com" + path, { method: body ? "POST" : "GET", headers: { Authorization: "Bearer " + auth }, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
try {
  assert.equal((await call("/status", null, "wrong")).status, 401);
  assert.equal((await call("/status", null, "second-key")).status, 200);
  const sub = { endpoint: "https://web.push.apple.com/test", keys: { p256dh: device.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
  assert.equal((await call("/subscribe", { ...sub, endpoint: "https://evil.example/" })).status, 400);
  assert.equal((await call("/subscribe", sub)).status, 200);
  const job = { id: "future", title: "test", body: "test", due: now + 60000, start: now + 3600000 };
  assert.equal((await call("/sync", { revision: 1, jobs: [job] })).status, 200);
  await worker.scheduled({}, env); assert.equal(sends, 0);
  clock += 60000;
  await worker.scheduled({}, env); assert.equal(sends, 1);
  await worker.scheduled({}, env); assert.equal(sends, 1);
  assert.equal(db.prepare("SELECT status FROM deliveries").get().status, "sent");
  assert.equal((await call("/pause", { revision: 1 })).status, 200);
  assert.equal((await call("/sync", { revision: 1, jobs: [job] })).status, 409);
  assert.equal((await call("/sync", { revision: 2, jobs: [] })).status, 200);
  assert.equal((await call("/sync", { revision: 1, jobs: [job] })).status, 409);
  await worker.scheduled({}, env); assert.equal(sends, 1);
  assert.equal((await call("/test", { endpoint: sub.endpoint })).status, 200);
  await worker.scheduled({}, env); assert.equal(sends, 1);
  clock += 60000; responseCode = 503;
  await worker.scheduled({}, env); assert.equal(sends, 2);
  await worker.scheduled({}, env); assert.equal(sends, 2);
  clock += 121000;
  globalThis.fetch = async () => { throw new Error("connection failed https://web.push.apple.com/private-token"); };
  await worker.scheduled({}, env);
  const failure = db.prepare("SELECT error FROM deliveries WHERE status='failed'").get().error;
  assert.ok(failure.startsWith("send: Error: connection failed"));
  assert.ok(!failure.includes("private-token"));
  globalThis.fetch = async () => { sends++; return new Response(null, { status: responseCode }); };
  clock += 121000; responseCode = 410;
  await worker.scheduled({}, env); assert.equal(sends, 3);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM subscriptions").get().n, 0);
  assert.ok(db.prepare("SELECT heartbeat FROM scheduler").get().heartbeat);
} finally { Date.now = originalNow; globalThis.fetch = originalFetch; db.close(); }
console.log("Reminders: lead times, cancellation, moved events, skipped courses, authentication, endpoint validation, real encryption, revision fencing, deduplication, delayed test, retries and expired devices passed.");
