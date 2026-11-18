import { describe, expect, it } from "vitest";
import { filterGradebookStudents } from "./gradebook";
describe("gradebook roster filters", () => {
  const students = [{ id: "a", name: "Ana Silva" }, { id: "b", name: "Bob" }];
  const items = [{ id: "quiz" }];
  it("combines case-insensitive trimmed search with ungraded work", () => {
    expect(filterGradebookStudents(students, items, {}, " ANA ", true)).toEqual([students[0]]);
  });
  it("counts zero as graded and blank or absent scores as ungraded", () => {
    expect(filterGradebookStudents(students, items, { "a:quiz": "0", "b:quiz": " " }, "", true)).toEqual([students[1]]);
  });
  it("clearing filters restores the roster; an empty gradebook has no ungraded work", () => {
    expect(filterGradebookStudents(students, items, {}, "", false)).toEqual(students);
    expect(filterGradebookStudents(students, [], {}, "", true)).toEqual([]);
  });
});
