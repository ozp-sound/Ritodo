import { courseRules, periodTimes as times, semester, timeZone } from "./user-config.ts";

export { courseRules } from "./user-config.ts";
export const firstMonday = semester.firstMonday;
export const semesterWeeks = semester.weeks;
const dayMs = 86_400_000;
const stamp = (date: string) => Date.parse(date + "T00:00:00+08:00");
const shanghaiDate = (date: Date) => date.toLocaleDateString("en-CA", { timeZone });
const addDays = (date: string, days: number) => shanghaiDate(new Date(stamp(date) + days * dayMs));
export function teachingWeek(date: string) {
  return Math.floor((stamp(date) - stamp(firstMonday)) / (7 * dayMs)) + 1;
}
export type CourseOverrides = Record<string, { skipped: boolean; at: string }>;
export function coursesOn(date: string, overrides: CourseOverrides = {}, includeSkipped = false) {
  const week = teachingWeek(date);
  const day = new Date(date + "T12:00:00+08:00").getUTCDay() || 7;
  return courseRules.filter(r => r.day === day && r.weeks.includes(week)).map(r => ({
    id: `${date}|${r.name}|${r.periods}`, skipped: !!overrides[`${date}|${r.name}|${r.periods}`]?.skipped,
    name: r.name, date, day, week, periods: r.periods, room: r.room,
    sessions: (times[r.periods] || []).map(([start, end]) => ({ start, end })),
  })).filter(c => includeSkipped || !c.skipped).sort((a, b) => parseInt(a.periods) - parseInt(b.periods));
}
export function timetableContext(now = new Date(), overrides: CourseOverrides = {}) {
  const today = shanghaiDate(now);
  const week = teachingWeek(today);
  const monday = addDays(today, -((new Date(today + "T12:00:00+08:00").getUTCDay() + 6) % 7));
  // Search to semester end, never roll over into a fabricated next semester.
  const remaining = Math.max(0, Math.ceil((stamp(addDays(firstMonday, semesterWeeks * 7)) - stamp(today)) / dayMs));
  const future = Array.from({ length: Math.min(remaining, semesterWeeks * 7) }, (_, i) => coursesOn(addDays(today, i), overrides)).flat();
  const slots = future.flatMap(c => c.sessions.map(s => ({ ...c, start: s.start, end: s.end,
    startAt: stamp(c.date) + (Number(s.start.slice(0, 2)) * 60 + Number(s.start.slice(3))) * 60000,
    endAt: stamp(c.date) + (Number(s.end.slice(0, 2)) * 60 + Number(s.end.slice(3))) * 60000,
  })));
  return {
    timezone: timeZone, today, week, inSemester: week >= 1 && week <= semesterWeeks,
    current: slots.find(s => s.startAt <= now.getTime() && s.endAt > now.getTime()) || null,
    next: slots.find(s => s.startAt > now.getTime()) || null,
    todayCourses: coursesOn(today, overrides), tomorrowCourses: coursesOn(addDays(today, 1), overrides),
    thisWeek: Array.from({ length: 7 }, (_, i) => coursesOn(addDays(monday, i), overrides)).flat(),
    nextWeek: Array.from({ length: 7 }, (_, i) => coursesOn(addDays(monday, 7 + i), overrides)).flat(),
    skippedOccurrences: Object.entries(overrides).filter(([, v]) => v.skipped).map(([id]) => id),
    note: "按配置课表计算，未包含临时停课、节假日或调课。没有配置时间的课程不参与当前/下一节判断，也不设置提醒。",
  };
}
type Course = ReturnType<typeof coursesOn>[number];
export function overlappingCourses(event: { start: string; end: string | null }, overrides: CourseOverrides = {}): Course[] {
  const start = Date.parse(event.start + ":00+08:00");
  const end = event.end ? Date.parse(event.end + ":00+08:00") : start + 1;
  const firstDay = stamp(event.start.slice(0, 10));
  const result: Course[] = [];
  for (let day = firstDay; day < end && day <= firstDay + 366 * dayMs; day += dayMs) {
    for (const c of coursesOn(shanghaiDate(new Date(day)), overrides)) {
      for (const s of c.sessions) {
        const a = Date.parse(c.date + "T" + s.start + ":00+08:00");
        const b = Date.parse(c.date + "T" + s.end + ":00+08:00");
        if (start < b && a < end) { result.push(c); break; }
      }
    }
  }
  return result;
}
export function courseConflicts(event: { start: string; end: string | null }, overrides: CourseOverrides = {}): string[] {
  return overlappingCourses(event, overrides).map(c => `${c.date} ${c.sessions.map(s => s.start + "–" + s.end).join(" / ")} ${c.name} · ${c.room}`);
}
export function setCourseAttendance(state: { courseOverrides?: CourseOverrides }, courseId: string, skipped: boolean, now = new Date()) {
  const course = coursesOn(courseId.slice(0, 10)).find(c => c.id === courseId);
  if (!course) throw new Error("找不到这一次课程，请重新选择。");
  state.courseOverrides = { ...state.courseOverrides, [courseId]: { skipped, at: now.toISOString() } };
  return `${course.date}「${course.name}」已${skipped ? "标记本次不去" : "恢复上课"}。只影响这一天，后续课表不变。`;
}
const describe = (c: Course) => `${c.date} 周${"一二三四五六日"[c.day - 1]} · ${c.name} · ${c.periods}节 · ${c.sessions.map(s => s.start + "–" + s.end).join(" / ") || "时间待确认（不提醒）"} · ${c.room}`;
// Exact common questions are answered without an AI round trip; other phrasing uses verified context.
export function answerCourseQuestion(text: string, now = new Date(), overrides: CourseOverrides = {}): string | null {
  const query = text.replace(/[\s，。？！?,.!]/g, "");
  const nextQuery = /^(下一节|下节)(课)?(是什么|什么课|上什么|上什么课|在哪|在哪上|在哪里|几点|什么时候|什么课在哪上|是什么课在哪上|什么课几点在哪上)?$/.test(query);
  const dayQuery = /^(今天|明天)(有|要上|上)?(什么课|哪些课|课表|的课表|有什么课)$/.exec(query);
  const weekQuery = /^(本周|这周|下周)(的)?课表$/.exec(query);
  if (!nextQuery && !dayQuery && !weekQuery && !/^(现在|这周|本周)(是)?第几周$/.test(query)) return null;
  const c = timetableContext(now, overrides);
  if (!c.inSemester) return `当前不在已录入的第 1–${semesterWeeks} 教学周内，需要更新课表或校准周次。`;
  if (nextQuery) return (c.current ? `正在上：${c.current.name}，${c.current.start}–${c.current.end}，${c.current.room}。\n` : "") +
    (c.next ? `下一节：${describe(c.next)}（本次 ${c.next.start}–${c.next.end}）。` : "本学期课表中没有下一节已知时间的课程。") + "\n按原课表，未计入临时调课。";
  if (dayQuery || weekQuery) {
    const title = dayQuery?.[1] || weekQuery![1];
    const list = dayQuery ? (title === "今天" ? c.todayCourses : c.tomorrowCourses) : (title === "下周" ? c.nextWeek : c.thisWeek);
    return `${title}课表：\n` + (list.length ? list.map(describe).join("\n") : "没有安排课程。") + "\n按原课表，未计入临时调课。";
  }
  return `现在是第 ${c.week} 教学周。以 ${firstMonday} 所在周为第 1 周，按北京时间自动递增。`;
}
