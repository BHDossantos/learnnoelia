import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStorageStub } from "./storage-stub.mjs";

async function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "storage-stub-test-"));
  const server = createStorageStub(root);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    rmSync(root, { recursive: true, force: true });
  });
  const request = (url, options) => fetch(base + url, options);
  const json = (url, body, method = "POST") => request(url, {
    method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const upload = async (key, body = "proof") => {
    const result = await request("/object/submissions/" + key, { method: "POST", body });
    assert.equal(result.status, 200);
  };
  return { request, json, upload };
}

test("listing returns virtual folders and files, sorted and paginated", async t => {
  const { json, upload } = await fixture(t);
  assert.deepEqual(await (await json("/object/list/submissions", { prefix: "missing" })).json(), []);
  await upload("owner/z.txt");
  await upload("owner/a.txt");
  await upload("owner/nested/proof.txt");
  const listing = await (await json("/object/list/submissions", {
    prefix: "owner", limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" },
  })).json();
  assert.ok(Array.isArray(listing));
  assert.deepEqual(listing.map(item => item.name), ["a.txt", "nested", "z.txt"]);
  assert.ok(listing[0].id);
  assert.equal(listing[1].id, null);
  const second = await (await json("/object/list/submissions", { prefix: "owner", limit: 1, offset: 1 })).json();
  assert.deepEqual(second.map(item => item.name), ["nested"]);
  const reverse = await (await json("/object/list/submissions", {
    prefix: "owner", sortBy: { column: "name", order: "desc" },
  })).json();
  assert.deepEqual(reverse.map(item => item.name), ["z.txt", "nested", "a.txt"]);
});

test("batch removal deletes nested keys and preserves another user's files", async t => {
  const { request, json, upload } = await fixture(t);
  await upload("owner/assignment/nested/proof.txt");
  await upload("other/assignment/proof.txt", "keep me");
  const removed = await json("/object/submissions", {
    prefixes: ["owner/assignment/nested/proof.txt", "owner/missing.txt"],
  }, "DELETE");
  assert.equal(removed.status, 200);
  assert.deepEqual((await removed.json()).map(item => item.name), ["owner/assignment/nested/proof.txt"]);
  assert.equal((await request("/object/authenticated/submissions/owner/assignment/nested/proof.txt")).status, 404);
  assert.equal(await (await request("/object/authenticated/submissions/other/assignment/proof.txt")).text(), "keep me");
  assert.deepEqual(await (await json("/object/list/submissions", { prefix: "owner" })).json(), []);
  assert.deepEqual(await (await json("/object/submissions", {
    prefixes: ["owner/assignment/nested/proof.txt"],
  }, "DELETE")).json(), []);
});

test("invalid deletion is rejected before any file is removed", async t => {
  const { request, json, upload } = await fixture(t);
  await upload("owner/proof.txt");
  assert.equal((await json("/object/submissions", { prefixes: ["owner/proof.txt", "../outside"] }, "DELETE")).status, 400);
  assert.equal((await request("/object/submissions/owner/proof.txt")).status, 200);
  assert.equal((await json("/object/submissions", { prefixes: ["owner"] }, "DELETE")).status, 400);
  assert.equal((await json("/object/list/submissions", { prefix: "../outside" })).status, 400);
  assert.equal((await json("/object/list/submissions", { offset: -1 })).status, 400);
});

test("multipart uploads and signed downloads retain the existing protocol", async t => {
  const { request, json, upload } = await fixture(t);
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", new Blob(["multipart proof"]), "proof.txt");
  await upload("owner/proof.txt", form);
  const signed = await (await json("/object/sign/submissions/owner/proof.txt", { expiresIn: 60 })).json();
  assert.equal(await (await request(signed.signedURL)).text(), "multipart proof");
  assert.equal((await request("/object/submissions/owner/missing.txt")).status, 404);
});
