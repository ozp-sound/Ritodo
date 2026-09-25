import assert from "node:assert/strict";
import { modelJson } from "./model.ts";
import { RI_PERSONALITY } from "./ri-personality.ts";
const original = globalThis.fetch;
let calls = [];
try {
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return Response.json({ choices: [{ message: { content: calls.length === 1 ? "  " : '{"reply":"几点开始？","event":null}' } }] });
  };
  assert.equal((await modelJson("synthetic", "test", [])).event, null);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].response_format);
  assert.equal(calls[0].max_tokens, 800);
  assert.equal(calls[1].response_format, undefined);
  assert.match(calls[1].messages.at(-1).content, /"memory"/);
  calls = [];
  globalThis.fetch = async () => { calls.push(1); return Response.json({ choices: [{ message: { content: " " } }] }); };
  await assert.rejects(() => modelJson("synthetic", "test", []), SyntaxError);
  assert.equal(calls.length, 2);
} finally { globalThis.fetch = original; }
assert.match(RI_PERSONALITY, /Default to one short sentence/);
assert.match(RI_PERSONALITY, /没听懂，再说一遍。/);
console.log("PASS: empty JSON retry is bounded and invalid replies never become operations");
