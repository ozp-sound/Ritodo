import assert from "node:assert/strict";
import { checkAccess } from "./access.ts";

const url = "https://ritodo.example.test/api/ledger";
assert.throws(() => checkAccess(new Request(url)));
assert.throws(() => checkAccess(new Request("http://localhost:5173/api/ledger")));
checkAccess(new Request("http://localhost:5173/api/ledger"), true);
process.env.RITODO_SESSION_TOKEN = "test-session-token-which-is-long-enough";
const headers = { cookie: "other=x; ritodo_session=test-session-token-which-is-long-enough" };
checkAccess(new Request(url, { headers }));
assert.throws(() => checkAccess(new Request(url, { headers: { cookie: "ritodo_session=wrong" } })));
process.env.RITODO_SESSION_TOKEN = "weak";
assert.throws(() => checkAccess(new Request(url, { headers: { cookie: "ritodo_session=weak" } })));
process.env.RITODO_SESSION_TOKEN = "test-session-token-which-is-long-enough";
assert.throws(() => checkAccess(new Request(url, { headers: { "oai-authenticated-user-id": "fake", "oai-authenticated-user-email": "fake@example.test" } })));
assert.throws(() => checkAccess(new Request(url, { headers: { ...headers, origin: "https://untrusted.example" } })));
assert.throws(() => checkAccess(new Request(url, { headers: { ...headers, "sec-fetch-site": "cross-site" } })));
console.log("PASS: password session required, local access limited to development, forged identity and cross-site requests rejected");
