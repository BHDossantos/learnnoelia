import type { SupabaseClient } from "@supabase/supabase-js";

// Upload before filing the grade: a storage failure must never silently discard
// the teacher's original. A unique path plus upsert:false avoids replacement.
export async function preservePaperOriginal(db: SupabaseClient, userId: string, bytes: Buffer, mime: string) {
  const extension: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf", "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx", "text/plain": "txt" };
  const path = `${userId}/${crypto.randomUUID()}.${extension[mime] ?? "bin"}`;
  const { error } = await db.storage.from("paper-originals").upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error("Could not preserve the original file. No grade was filed. Please retry.");
  return path;
}
