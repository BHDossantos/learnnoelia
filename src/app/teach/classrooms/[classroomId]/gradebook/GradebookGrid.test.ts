import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vitest";
vi.mock("./actions", () => ({ setEntry: vi.fn() }));
import { GradebookGrid } from "./GradebookGrid";

it("filters the visible roster without changing finals and restores it on clear", () => {
  let tree!: ReactTestRenderer;
  act(() => { tree = create(React.createElement(GradebookGrid, {
    classroomId: "class", students: [{ id: "a", name: "Ana" }, { id: "b", name: "Bob" }],
    items: [{ id: "quiz", name: "Quiz", max_points: 10, category_id: null }],
    categories: [], mode: "points", initialEntries: [{ grade_item_id: "quiz", student_id: "a", points: 0 }],
  })); });
  const scoreInputs = () => tree.root.findAllByType("input").filter(i => i.props.inputMode === "decimal");
  expect(scoreInputs()).toHaveLength(2);
  act(() => tree.root.findAllByType("input").find(i => i.props.type === "checkbox")!.props.onChange({ target: { checked: true } }));
  expect(scoreInputs()).toHaveLength(1);
  expect(scoreInputs()[0].props["aria-label"]).toContain("Bob");
  act(() => scoreInputs()[0].props.onChange({ target: { value: "7" } }));
  expect(scoreInputs()).toHaveLength(1); // Do not unmount the edited input before blur can save it.
  act(() => tree.root.findByType("button").props.onClick());
  expect(scoreInputs()).toHaveLength(2);
  expect(scoreInputs()[0].props.value).toBe("0");
  act(() => tree.unmount());
});
