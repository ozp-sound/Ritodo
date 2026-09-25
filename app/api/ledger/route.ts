import { z } from "zod";
import { localAccess, readBody, readState, saveState } from "@/lib/store";
import { applyMemoryCommand, recordEntry, undoEntry } from "@/lib/ledger";

export async function GET(request: Request) {
  try { localAccess(request); return Response.json(await readState(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "账本暂时无法读取，请确认本机服务正常。" }, { status: 503 }); }
}
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("entry"), entry: z.unknown(), id: z.string().uuid() }),
  z.object({ action: z.literal("undo"), entryId: z.string().uuid(), id: z.string().uuid() }),
  z.object({ action: z.literal("memory"), memory: z.unknown(), id: z.string().uuid() }),
]);
export async function POST(request: Request) {
  try {
    localAccess(request);
    const input = command.parse(await readBody(request));
    const state = await readState();
    if (state.requests.includes(input.id)) return Response.json(state);
    let reply = "";
    if (input.action === "entry") reply = recordEntry(state, input.entry, input.id);
    else if (input.action === "undo") { undoEntry(state, input.entryId); reply = "已撤销，记录保留。"; }
    else reply = applyMemoryCommand(state, input.memory, input.id);
    if (input.action !== "memory") state.messages.push({ role: "assistant", content: reply, at: new Date().toISOString() });
    state.requests.push(input.id);
    await saveState(state);
    return Response.json(state);
  } catch (error) {
    return Response.json({ error: error instanceof z.ZodError ? "填写的信息格式有误，请检查金额和日期。" : error instanceof Error ? error.message : "保存失败，请重试。" }, { status: 400 });
  }
}
