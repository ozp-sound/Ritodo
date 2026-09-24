// Real workerd fetch validation; no Apple connection and no real subscriptions.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createECDH, randomBytes } from "node:crypto";
import { Miniflare } from "miniflare";
import { build } from "esbuild";
const keys = () => { const k = createECDH("prime256v1"); k.generateKeys(); return { publicKey: k.getPublicKey().toString("base64url"), privateKey: k.getPrivateKey().toString("base64url") }; };
const vapid = keys(), device = keys();
const bundle = await build({ stdin: { contents: 'import worker from "./reminder-worker/index.ts"; export default { async fetch(request, env) { await worker.scheduled({}, env); return new Response("ok"); } };', resolveDir: process.cwd() }, bundle: true, write: false, platform: "browser", format: "esm" });
let sends = 0, status = 201, transportError;
const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2026-05-22", d1Databases: { DB: "test-reminders" }, bindings: { API_KEY: "test", APP_URL: "https://example.com/", VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey }, outboundService: async request => {
  try {
  assert.equal(request.url, "https://web.push.apple.com/test");
  assert.equal(request.headers.get("content-encoding"), "aes128gcm");
  assert.equal((await request.arrayBuffer()).byteLength, 4096);
  sends++;
  return new Response(null, { status, ...(status === 302 ? { headers: { Location: "https://must-not-follow.example/" } } : {}) });
  } catch (error) { transportError = error; return new Response(null, { status: 500 }); }
} });
try {
  const db = await mf.getD1Database("DB");
  for (const file of ["0001.sql", "0002.sql"]) for (const sql of (await readFile(new URL("../reminder-worker/migrations/" + file, import.meta.url), "utf8")).split(";").filter(s => s.trim())) await db.prepare(sql).run();
  const now = Date.now();
  const sub = { endpoint: "https://web.push.apple.com/test", expirationTime: null, keys: { p256dh: device.publicKey, auth: randomBytes(16).toString("base64url") } };
  await db.prepare("INSERT INTO subscriptions VALUES(?,?,?)").bind("device", JSON.stringify(sub), now - 60000).run();
  for (const [id, code, expected] of [["success", 201, "sent"], ["redirect", 302, "failed"]]) {
    status = code;
    const jobs = [{ id, title: "test", body: "test", due: now - 1000, start: now + 3600000 }];
    await db.prepare("UPDATE scheduler SET jobs=?").bind(JSON.stringify(jobs)).run();
    await mf.dispatchFetch("http://localhost/");
    if (transportError) throw transportError;
    const delivery = await db.prepare("SELECT status,error FROM deliveries WHERE code=?").bind(code).first();
    assert.equal(delivery?.status, expected, JSON.stringify(await db.prepare("SELECT status,code,error FROM deliveries").all()));
    assert.equal(delivery.error, null);
  }
  assert.equal(sends, 2);
  console.log("workerd: real encrypted send accepted; redirects rejected without following or leaking credentials.");
} finally { await mf.dispose(); }
