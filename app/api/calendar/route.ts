import { z } from "zod";
import { localAccess, readBody, readState, saveState } from "@/lib/store";
import { eventCommand, applyEventCommand } from "@/lib/events";
import { courseConflicts, overlappingCourses, setCourseAttendance } from "@/lib/timetable";

const command = z.object({
  id: z.string().uuid(), revision: z.number().int().nonnegative(),
  operation: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("course"), courseId: z.string().max(200), skipped: z.boolean() }).strict(),
    z.object({ kind: z.literal("event"), event: eventCommand, replace: z.array(z.string().max(200)).max(100).default([]) }).strict(),
  ]),
}).strict();

export async function POST(request: Request) {
  try {
    localAccess(request);
    const input = command.parse(await readBody(request));
    const state = await readState();
    if (state.requests.includes(input.id)) return Response.json(state);
    if (state.revision !== input.revision) throw new Error("日程已在别处更新。请点「刷新」后重新选择，本次未保存。");
    const op = input.operation;
    let reply: string;
    if (op.kind === "course") reply = setCourseAttendance(state, op.courseId, op.skipped);
    else {
      // One snapshot commit: an invalid replacement never saves a partial event or skip.
      const draft = structuredClone(state);
      applyEventCommand(draft, op.event, input.id, () => []);
      const eventId = op.event.action === "create" ? input.id : "id" in op.event ? op.event.id : null;
      const saved = draft.events?.find(e => e.id === eventId && !e.cancelledAt);
      const candidates = saved ? overlappingCourses(saved, state.courseOverrides) : [];
      if (op.replace.some(id => !candidates.some(c => c.id === id))) throw new Error("替代的课程与这项安排不重叠，或已经标记不去。请重新选择。");
      const attendance = [...new Set(op.replace)].map(id => setCourseAttendance(state, id, true));
      reply = applyEventCommand(state, op.event, input.id, e => courseConflicts(e, state.courseOverrides));
      if (attendance.length) reply += "\n" + attendance.join("\n");
      reply += "\n修改或取消个人安排不会自动恢复课程；要去上课，请在日程中点恢复。";
    }
    state.messages.push({ role: "assistant", content: reply, at: new Date().toISOString() });
    state.requests.push(input.id);
    await saveState(state, true);
    return Response.json(state);
  } catch (error) {
    return Response.json({ error: error instanceof z.ZodError ? "请检查日程标题、日期和时间，本次未保存。" : error instanceof Error ? error.message : "保存失败，请重试。" }, { status: 400 });
  }
}
