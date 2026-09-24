import assert from "node:assert/strict";
import { coursesOn, setCourseAttendance, overlappingCourses, courseConflicts, answerCourseQuestion } from "./timetable.ts";

const state = {};
const course = coursesOn("2026-09-28")[0];
assert.equal(course.sessions.length, 1);
setCourseAttendance(state, course.id, true);
assert.equal(coursesOn(course.date, state.courseOverrides).some(c => c.id === course.id), false);
assert.equal(coursesOn(course.date, state.courseOverrides, true)[0].skipped, true);
assert.equal(coursesOn("2026-10-05", state.courseOverrides)[0].name, course.name);
assert.equal(courseConflicts({ start: "2026-09-28T08:00", end: null }, state.courseOverrides).length, 0);
assert.doesNotMatch(answerCourseQuestion("下一节课", new Date("2026-09-28T07:00:00+08:00"), state.courseOverrides), /高等数学/);
assert.equal(overlappingCourses({ start: "2026-09-28T08:00", end: "2026-09-28T09:30" }).length, 1);
assert.equal(overlappingCourses({ start: "2026-09-28T09:30", end: "2026-09-28T09:55" }).length, 0);
assert.equal(overlappingCourses({ start: "2026-09-27T23:00", end: "2026-09-28T08:30" })[0].id, course.id);
setCourseAttendance(state, course.id, false);
assert.match(answerCourseQuestion("下一节课", new Date("2026-09-28T07:00:00+08:00"), state.courseOverrides), /高等数学/);
assert.throws(() => setCourseAttendance(state, "2026-09-28|不存在|1-2", true), /找不到/);
console.log("Calendar: single-occurrence skip/restore, next class and conflicts passed.");
