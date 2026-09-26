import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/services/story-export.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const service = {};
new Function("exports", "require", outputText)(service, (specifier) => {
  if (specifier === "@/lib/story-export") return {};
  throw new Error(`Unexpected import: ${specifier}`);
});

test("selects the strongest advertised WebM codec", () => {
  assert.equal(
    service.chooseSupportedWebMMimeType((mimeType) => mimeType.includes("vp8") || mimeType === "video/webm"),
    "video/webm;codecs=vp8",
  );
});

test("reports no WebM MIME type when the browser advertises none", () => {
  assert.equal(service.chooseSupportedWebMMimeType(() => false), null);
});

test("maps video preparation, recording, and finalization to monotonic progress", () => {
  assert.equal(service.calculateVideoProgress("preparing", 1, 2), 5);
  assert.equal(service.calculateVideoProgress("recording", 1, 2), 53);
  assert.equal(service.calculateVideoProgress("recording", 2, 2), 95);
  assert.equal(service.calculateVideoProgress("finalizing", 2, 2), 98);
});
