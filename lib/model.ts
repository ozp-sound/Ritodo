export async function modelJson(key: string, model: string, messages: { role: string; content: string }[]): Promise<unknown> {
  // DeepSeek JSON mode can occasionally return only whitespace. Retry once in text mode,
  // before executing or saving any operation; both responses still require valid JSON.
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      signal: AbortSignal.timeout(40000),
      body: JSON.stringify({ model, messages: [...messages, { role: "system", content: 'OUTPUT PROTOCOL: Your next message is consumed by code, not shown directly. Return ONLY a JSON object with keys "reply", "entry", "event", "memory". Fill at most one entry/event/memory command from the original schema if the user requested or clearly supplied it; otherwise use null. Cancellation MUST include event:{"action":"cancel","id":"the exact saved UUID"}. Never return plain Chinese text, markdown, blank output, or a success statement without the executable command. Clarification example: {"reply":"几点开始？","entry":null,"event":null,"memory":null}. Do not execute anything yourself.' }], ...(attempt === 0 ? { response_format: { type: "json_object" } } : {}),
        thinking: { type: "disabled" }, temperature: 0, max_tokens: 2000, stream: false }),
    });
    if (!response.ok) throw new Error("AI 暂时无法回复（" + response.status + "），本次操作未保存，请稍后重试。");
    const result = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = (result.choices?.[0]?.message?.content || "").trim().replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```$/, "");
    try { return JSON.parse(content); } catch (error) { if (attempt === 1) throw error; }
  }
  throw new Error("AI 未返回有效操作，本次未保存。");
}
