import { z } from "zod";
import { localAccess, readBody, readState, saveState } from "@/lib/store";
import { reminderRequest } from "@/lib/reminders";
export async function GET(request: Request) {
  try { localAccess(request); return Response.json(await reminderRequest("/status"), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "提醒状态暂时无法读取，请稍后刷新。" }, { status: 503 }); }
}
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("subscribe"), subscription: z.unknown() }).strict(),
  z.object({ action: z.literal("unsubscribe"), endpoint: z.string().max(2048) }).strict(),
  z.object({ action: z.literal("test"), endpoint: z.string().max(2048) }).strict(),
  z.object({ action: z.literal("sync") }).strict(),
]);
export async function POST(request: Request) {
  try {
    localAccess(request);
    const input = command.parse(await readBody(request));
    if (input.action === "unsubscribe" || input.action === "test") {
      return Response.json(await reminderRequest("/" + input.action, { endpoint: input.endpoint }));
    }
    const state = await readState();
    if (input.action === "subscribe") await reminderRequest("/subscribe", input.subscription);
    state.remindersEnabledAt ||= new Date().toISOString();
    await saveState(state, true);
    if (state.reminderWarning) return Response.json({ error: state.reminderWarning }, { status: 503 });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof z.ZodError ? "通知信息无效，请重试。" : error instanceof Error ? error.message : "开启提醒失败，请重试。" }, { status: 400 });
  }
}
