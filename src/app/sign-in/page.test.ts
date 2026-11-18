import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ signUp: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ supabaseBrowser: () => ({ auth: { signUp: mock.signUp } }) }));
vi.mock("@/app/sign-in/actions", () => ({ requestMagicLink: vi.fn() }));
import SignInPage from "./page";
let tree: ReactTestRenderer;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("window", { location: { origin: "https://learnnoelia.com", search: "", hash: "", assign: vi.fn() } });
  act(() => { tree = create(React.createElement(SignInPage)); });
  act(() => tree.root.findAllByType("button").find(b => b.children.includes("Use a password instead"))!.props.onClick());
  act(() => {
    tree.root.findAllByType("input").find(i => i.props.type === "email")!.props.onChange({ target: { value: "qa@example.com" } });
    tree.root.findAllByType("input").find(i => i.props.type === "password")!.props.onChange({ target: { value: "test-password" } });
  });
});
afterEach(() => { act(() => tree.unmount()); vi.unstubAllGlobals(); });
const signup = () => tree.root.findAllByType("button").find(b => b.children.includes("Create an account"))!;
it("routes confirmation through the session exchange callback without claiming signup is complete", async () => {
  mock.signUp.mockResolvedValue({ data: { session: null }, error: null });
  await act(async () => { await signup().props.onClick(); });
  expect(mock.signUp).toHaveBeenCalledWith({ email: "qa@example.com", password: "test-password", options: { emailRedirectTo: "https://learnnoelia.com/auth/callback" } });
  expect(JSON.stringify(tree.toJSON())).toContain("Check your inbox to confirm");
  expect(window.location.assign).not.toHaveBeenCalled();
});
it("recovers from a network failure and allows retry", async () => {
  mock.signUp.mockRejectedValue(new Error("network"));
  await act(async () => { await signup().props.onClick(); });
  expect(signup().props.disabled).toBe(false);
  expect(JSON.stringify(tree.toJSON())).toContain("Check your connection");
});
it("does not bypass provider confirmation when signup returns an error", async () => {
  mock.signUp.mockResolvedValue({ data: {}, error: { message: "Signup unavailable" } });
  await act(async () => { await signup().props.onClick(); });
  expect(window.location.assign).not.toHaveBeenCalled();
  expect(signup().props.disabled).toBe(false);
  expect(JSON.stringify(tree.toJSON())).toContain("Signup unavailable");
});
