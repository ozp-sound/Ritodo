export const timeZone = "Asia/Shanghai";
export const semester = { firstMonday: "2026-09-07", weeks: 16 };

export const periodTimes: Record<string, [string, string][]> = {
  "1-2": [["08:00", "09:30"]],
  "3-4": [["09:55", "11:30"]],
  "5-6": [["13:30", "15:00"]],
  "7-8": [["15:25", "17:00"]],
  "9-10": [["18:00", "19:30"]],
};

export type CourseRule = { name: string; day: number; periods: string; weeks: number[]; room: string };
const allWeeks = Array.from({ length: semester.weeks }, (_, index) => index + 1);
export const courseRules: CourseRule[] = [
  { name: "高等数学", day: 1, periods: "1-2", weeks: allWeeks, room: "教学楼 101" },
  { name: "计算机基础", day: 3, periods: "3-4", weeks: allWeeks, room: "实验楼 201" },
];
