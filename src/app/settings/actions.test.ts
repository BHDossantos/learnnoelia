import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ getUser: vi.fn(), signOut: vi.fn(), createClient: vi.fn(), deleteUser: vi.fn(), subscription: vi.fn(), cancel: vi.fn(), uploads: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => ({ auth: m }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: m.createClient }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ subscriptions: { cancel: m.cancel } }) }));
vi.mock("@/lib/account-deletion", () => ({ removeAccountUploads: m.uploads }));
import { deleteAccount } from "./actions";
const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "local-test-key");
  m.getUser.mockResolvedValue({ data: { user: { id } } });
  m.subscription.mockResolvedValue({ data: null, error: null });
  m.createClient.mockReturnValue({ auth: { admin: { deleteUser: m.deleteUser } }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: m.subscription }) }) }) });
  m.deleteUser.mockResolvedValue({ error: null });
});
describe("deleteAccount", () => {
  it("requires authentication and admin configuration", async () => {
    m.getUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(deleteAccount()).rejects.toThrow("redirect:/sign-in");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    await expect(deleteAccount()).rejects.toThrow("not configured");
    expect(m.createClient).not.toHaveBeenCalled();
  });
  it("cleans uploads before deleting only the authenticated user, then signs out", async () => {
    expect(await deleteAccount()).toEqual({ deleted: true });
    expect(m.deleteUser).toHaveBeenCalledWith(id);
    expect(m.uploads.mock.invocationCallOrder[0]).toBeLessThan(m.deleteUser.mock.invocationCallOrder[0]);
    expect(m.signOut).toHaveBeenCalledOnce();
  });
  it("cancels billing before deletion", async () => {
    m.subscription.mockResolvedValue({ data: { stripe_subscription_id: "sub_test" } });
    await deleteAccount();
    expect(m.cancel).toHaveBeenCalledWith("sub_test");
    expect(m.cancel.mock.invocationCallOrder[0]).toBeLessThan(m.uploads.mock.invocationCallOrder[0]);
  });
  it("retains account and session on lookup, cancellation or storage errors", async () => {
    m.subscription.mockResolvedValueOnce({ error: {} });
    await expect(deleteAccount()).rejects.toThrow("check your subscription");
    m.subscription.mockResolvedValueOnce({ data: { stripe_subscription_id: "sub_test" } });
    m.cancel.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(deleteAccount()).rejects.toThrow("cancel your subscription");
    m.uploads.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(deleteAccount()).rejects.toThrow("storage unavailable");
    expect(m.deleteUser).not.toHaveBeenCalled(); expect(m.signOut).not.toHaveBeenCalled();
  });
  it("allows retry after cancellation and hides backend deletion errors", async () => {
    m.subscription.mockResolvedValue({ data: { stripe_subscription_id: "sub_test" } });
    m.cancel.mockRejectedValue({ code: "resource_missing" });
    m.deleteUser.mockResolvedValueOnce({ error: { message: "private backend details" } });
    await expect(deleteAccount()).rejects.toThrow("Could not delete your account");
    expect(m.signOut).not.toHaveBeenCalled();
    expect(await deleteAccount()).toEqual({ deleted: true });
  });
});
