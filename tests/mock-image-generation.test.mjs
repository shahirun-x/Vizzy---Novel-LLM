import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadTypeScriptModule(relativePath, mocks = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  const exports = {};
  new Function("exports", "require", outputText)(exports, (specifier) => {
    if (specifier in mocks) return mocks[specifier];
    throw new Error(`Unexpected test import: ${specifier}`);
  });
  return exports;
}

const serviceContract = loadTypeScriptModule("../src/services/image-generation.ts");
const { MockImageGenerationService } = loadTypeScriptModule(
  "../src/services/mock-image-generation.ts",
  { "@/services/image-generation": serviceContract },
);

function request(overrides = {}) {
  return {
    projectId: "project-1",
    pageId: "page-1",
    prompt: "An exact prepared illustration prompt.",
    aspectRatio: "3:4",
    optionCount: 3,
    batchNumber: 1,
    styleBible: {
      projectId: "project-1",
      artStyle: "Ink",
      mood: "Quiet",
      palette: "Blue",
      characterDescriptions: "Ira",
      visualReferences: "",
      additionalInstructions: "",
    },
    references: [],
    ...overrides,
  };
}

test("mock generation returns exactly three unique, labelled options with immutable request metadata", async () => {
  const service = new MockImageGenerationService();
  const result = await service.generate(request({ aspectRatio: "16:9", batchNumber: 4 }));

  assert.equal(result.versions.length, 3);
  assert.equal(new Set(result.versions.map((version) => version.id)).size, 3);
  assert.deepEqual(result.versions.map((version) => version.optionLabel), ["Option A", "Option B", "Option C"]);
  for (const version of result.versions) {
    assert.equal(version.pageId, "page-1");
    assert.equal(version.aspectRatio, "16:9");
    assert.equal(version.batchNumber, 4);
    assert.equal(version.generationBatchId, result.generationBatchId);
    assert.equal(version.prompt, "An exact prepared illustration prompt.");
    assert.match(version.imageUrl, /^data:image\/svg\+xml/);
    assert.match(decodeURIComponent(version.imageUrl), /PROTOTYPE VISUAL/);
  }
});

test("mock generation uses stable seeds while giving each batch distinct IDs", async () => {
  const service = new MockImageGenerationService();
  const first = await service.generate(request());
  const repeated = await service.generate(request());
  const second = await service.generate(request({ batchNumber: 2 }));

  assert.deepEqual(
    first.versions.map((version) => version.id),
    repeated.versions.map((version) => version.id),
  );
  assert.notEqual(first.generationBatchId, second.generationBatchId);
  assert.ok(
    first.versions.every(
      (version) => !second.versions.some((candidate) => candidate.id === version.id),
    ),
  );
});

test("mock generation rejects any request that is not an exact three-option batch", async () => {
  const service = new MockImageGenerationService();
  await assert.rejects(
    service.generate(request({ optionCount: 2 })),
    (error) => error.code === "INVALID_REQUEST",
  );
});

test("mock generation cooperatively cancels without producing a result", async () => {
  const service = new MockImageGenerationService(10_000);
  const controller = new AbortController();
  const pending = service.generate(request(), { signal: controller.signal });

  controller.abort();

  await assert.rejects(
    pending,
    (error) => error.code === "CANCELLED",
  );
});
