import type { SupabaseClient } from "@supabase/supabase-js";

/** Remove only this user's submission uploads through Storage, never SQL. */
export async function removeAccountUploads(admin: SupabaseClient, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Invalid account identifier");
  const bucket = admin.storage.from("submissions");
  const files: string[] = [];
  async function walk(prefix: string) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await bucket.list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
      if (error || !data) throw new Error("Could not check your uploads. Please retry account deletion.");
      for (const item of data) {
        if (!item.name || item.name.includes("/") || item.name === "." || item.name === "..")
          throw new Error("Could not safely identify an upload. Please contact support.");
        const path = `${prefix}/${item.name}`;
        if (item.id) files.push(path);
        else await walk(path);
      }
      if (data.length < 1000) break;
    }
  }
  // Collect before removing, so pagination cannot skip files as offsets shift.
  await walk(userId);
  for (let i = 0; i < files.length; i += 1000) {
    const { error } = await bucket.remove(files.slice(i, i + 1000));
    if (error) throw new Error("Could not remove your uploads. Please retry account deletion.");
  }
}
