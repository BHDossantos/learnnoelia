// Minimal stand-in for supabase/storage-api.
//
// Used by devstack/setup.sh ONLY when the real supabase/storage-api image
// cannot be pulled (e.g. Docker Hub rate limit). It implements the exact
// subset of the storage HTTP protocol that @supabase/storage-js v2 uses in
// this app: multipart object upload, paginated listing, batch removal, and signed URLs.
//
// It deliberately does NOT enforce auth or RLS — it exists to exercise the
// app's own upload code path (SubmitForm -> upload -> /api/uploads/sign-get),
// not to validate Supabase's storage security. The real container does that.
import http from "node:http";
import { mkdirSync, createWriteStream, existsSync, createReadStream, readdirSync, statSync, unlinkSync, rmdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import path from "node:path";


function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(payload);
}

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

export function createStorageStub(root = "/tmp/lf_storage") {
  const ROOT = path.resolve(root);
  mkdirSync(ROOT, { recursive: true });
  function storagePath(...values) {
    const segments = values.flatMap(value => value.split("/")).filter(Boolean);
    if (!segments.length || segments.some(value => value === "." || value === ".." || value.includes("\\") || value.includes("\0"))) {
      throw Object.assign(new Error("Invalid object path"), { status: 400 });
    }
    const target = path.resolve(ROOT, ...segments);
    if (!target.startsWith(ROOT + path.sep)) throw Object.assign(new Error("Invalid object path"), { status: 400 });
    return target;
  }
  return http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent); // e.g. object,submissions,uid,...

    // Match protocol operations before the generic object-upload route.
    // Folders have null IDs; files have IDs, as removeAccountUploads expects.
    if (req.method === "POST" && parts[0] === "object" && parts[1] === "list" && parts.length === 3) {
      const { prefix = "", limit = 100, offset = 0, sortBy = {} } = JSON.parse((await readRaw(req)).toString());
      if (typeof prefix !== "string" || !Number.isInteger(limit) || limit < 0 ||
          !Number.isInteger(offset) || offset < 0 || (sortBy.column && sortBy.column !== "name")) {
        return send(res, 400, { message: "Invalid list options" });
      }
      const folder = storagePath(parts[2], prefix);
      if (!existsSync(folder)) return send(res, 200, []);
      const entries = readdirSync(folder, { withFileTypes: true })
        .filter(entry => entry.isFile() || entry.isDirectory())
        .map(entry => {
          if (entry.isDirectory()) return { name: entry.name, id: null, metadata: null };
          const stats = statSync(path.join(folder, entry.name));
          return { name: entry.name, id: entry.name, metadata: { size: stats.size },
            created_at: stats.birthtime.toISOString(), updated_at: stats.mtime.toISOString() };
        })
        .sort((a, b) => a.name.localeCompare(b.name) * (sortBy.order === "desc" ? -1 : 1));
      return send(res, 200, entries.slice(offset, offset + limit));
    }

    // DELETE /object/{bucket} removes exact object keys, never whole prefixes.
    if (req.method === "DELETE" && parts[0] === "object" && parts.length === 2) {
      const { prefixes } = JSON.parse((await readRaw(req)).toString());
      if (!Array.isArray(prefixes) || prefixes.some(key => typeof key !== "string" || !key)) {
        return send(res, 400, { message: "Expected object keys" });
      }
      const bucketRoot = storagePath(parts[1]);
      // Validate the entire request before making any changes.
      const files = prefixes.map(key => ({ key, file: storagePath(parts[1], key) }));
      if (files.some(({ file }) => existsSync(file) && !statSync(file).isFile())) {
        return send(res, 400, { message: "Only exact file keys may be removed" });
      }
      const removed = [];
      for (const { key, file } of files) {
        if (!existsSync(file)) continue;
        unlinkSync(file);
        removed.push({ name: key });
        // Storage folders are virtual: don't retain empty directories.
        for (let folder = path.dirname(file); folder !== bucketRoot; folder = path.dirname(folder)) {
          try { rmdirSync(folder); }
          catch (error) {
            if (error.code === "ENOTEMPTY" || error.code === "ENOENT") break;
            throw error;
          }
        }
      }
      return send(res, 200, removed);
    }

    // POST /object/sign/{bucket}/{path...}  -> mint a signed URL
    if (req.method === "POST" && parts[0] === "object" && parts[1] === "sign") {
      const rest = parts.slice(2).join("/"); // bucket/path...
      const token = randomUUID();
      return send(res, 200, { signedURL: `/object/sign/${rest}?token=${token}` });
    }

    // GET /object/sign/{bucket}/{path...}?token=...  -> serve the stored file
    if (req.method === "GET" && parts[0] === "object" && parts[1] === "sign") {
      const rel = parts.slice(2).join("/");
      const file = storagePath(rel);
      if (!existsSync(file)) return send(res, 404, { message: "Object not found" });
      res.writeHead(200, { "content-type": "application/octet-stream" });
      return createReadStream(file).pipe(res);
    }

    // POST/PUT /object/{bucket}/{path...}  -> store an uploaded object
    if ((req.method === "POST" || req.method === "PUT") && parts[0] === "object") {
      const rel = parts.slice(1).join("/"); // bucket/path...
      const dest = storagePath(rel);
      mkdirSync(path.dirname(dest), { recursive: true });

      const ct = req.headers["content-type"] || "";
      const raw = await readRaw(req);
      let fileBytes = raw;
      if (ct.includes("multipart/form-data")) {
        // Let undici's Response parse the multipart body for us.
        const form = await new Response(raw, { headers: { "content-type": ct } }).formData();
        const blob = form.get("") || [...form.values()].find((v) => typeof v !== "string");
        if (blob && typeof blob.arrayBuffer === "function") {
          fileBytes = Buffer.from(await blob.arrayBuffer());
        }
      }
      await new Promise((ok, no) => {
        const ws = createWriteStream(dest);
        ws.on("finish", ok);
        ws.on("error", no);
        ws.end(fileBytes);
      });
      return send(res, 200, { Id: randomUUID(), Key: rel });
    }

    // GET /object/authenticated/{bucket}/{path} or /object/{bucket}/{path}
    if (req.method === "GET" && parts[0] === "object") {
      const rel = parts.slice(parts[1] === "authenticated" ? 2 : 1).join("/");
      const file = storagePath(rel);
      if (!existsSync(file)) return send(res, 404, { message: "Object not found" });
      res.writeHead(200, { "content-type": "application/octet-stream" });
      return createReadStream(file).pipe(res);
    }

    send(res, 404, { message: `no storage-stub route for ${req.method} ${url.pathname}` });
  } catch (e) {
    send(res, e?.status ?? 500, { message: String(e?.message ?? e) });
  }
});

}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createStorageStub().listen(5000, () => console.log("storage-stub up on 5000"));
}
