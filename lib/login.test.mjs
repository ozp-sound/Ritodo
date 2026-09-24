import assert from "node:assert/strict";
import { POST } from "../app/api/login/route.ts";

const url = "https://ritodo.example.test/api/login";
const request = (password, origin = "https://ritodo.example.test") => new Request(url, {
  method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify({ password }),
});

process.env.RITODO_PASSWORD = "strong-test-password";
process.env.RITODO_SESSION_TOKEN = "test-session-token-which-is-long-enough";
assert.equal((await POST(request("strong-test-password", "https://evil.example"))).status, 403);
assert.equal((await POST(new Request(url, { method: "POST", headers: { origin: "https://ritodo.example.test" }, body: "x".repeat(1_001) }))).status, 413);
assert.equal((await POST(request("wrong-password"))).status, 401);
const success = await POST(request("strong-test-password"));
assert.equal(success.status, 200);
assert.match(success.headers.get("set-cookie") || "", /HttpOnly; Secure; SameSite=Strict; Path=\//);
process.env.RITODO_SESSION_TOKEN = "weak";
assert.equal((await POST(request("strong-test-password"))).status, 503);
console.log("PASS: login rejects cross-site, oversized, invalid and weak-secret requests; secure cookie issued");
