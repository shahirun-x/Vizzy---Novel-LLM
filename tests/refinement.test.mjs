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

const contract = loadTypeScriptModule("../src/services/image-generation.ts");
const { MockImageGenerationService } = loadTypeScriptModule(
  "../src/services/mock-image-generation.ts",
  { "@/services/image-generation": contract },
);
const pageCreation = loadTypeScriptModule("../src/lib/page-creation.ts");

const styleBible = {
  projectId: "project-1",
  artStyle: "Ink",
  mood: "Tense",
  palette: "Blue",
  characterDescriptions: "A watchful traveler",
  visualReferences: "",
  additionalInstructions: "",
};

async function generatedParent(pageId = "page-1") {
  const service = new MockImageGenerationService();
  const result = await service.generate({
    projectId: "project-1",
    pageId,
    prompt: "Exact prompt snapshot",
    aspectRatio: "16:9",
    optionCount: 3,
    batchNumber: 1,
    styleBible,
    references: [],
  });
  return { service, parent: result.versions[0], versions: result.versions };
}

function refinementRequest(parent, overrides = {}) {
  return {
    projectId: "project-1",
    pageId: parent?.pageId ?? "page-1",
    parentVersion: parent,
    refinementInstructions: "Lower the camera and make the morning light colder.",
    refinementSequence: 1,
    styleBible,
    references: [],
    ...overrides,
  };
}

test("refinement requires an existing page-matched parent and a non-empty instruction", async () => {
  const { service, parent } = await generatedParent();
  await assert.rejects(
    service.refine(refinementRequest(undefined)),
    (error) => error.code === "INVALID_REQUEST",
  );
  await assert.rejects(
    service.refine(refinementRequest(parent, { refinementInstructions: "   " })),
    (error) => error.code === "INVALID_REQUEST",
  );
  await assert.rejects(
    service.refine(refinementRequest(parent, { pageId: "another-page" })),
    (error) => error.code === "INVALID_REQUEST",
  );
});

test("refinement creates a distinct child while preserving exact parent snapshots", async () => {
  const { service, parent } = await generatedParent();
  const parentSnapshot = structuredClone(parent);
  const instruction = "Keep everything but make the soldiers more prominent.";
  const result = await service.refine(
    refinementRequest(parent, { refinementInstructions: instruction }),
  );
  const child = result.versions[0];

  assert.deepEqual(parent, parentSnapshot);
  assert.notEqual(child.id, parent.id);
  assert.equal(child.parentVersionId, parent.id);
  assert.equal(child.rootVersionId, parent.id);
  assert.equal(child.refinementInstruction, instruction);
  assert.equal(child.prompt, parent.prompt);
  assert.equal(child.aspectRatio, parent.aspectRatio);
  assert.equal(child.pageId, parent.pageId);
  assert.equal(child.generationSource, "refinement");
  assert.equal(child.selected, true);
  assert.match(decodeURIComponent(child.imageUrl), /PROTOTYPE VISUAL/);
  assert.match(decodeURIComponent(child.imageUrl), /Demo refinement/);
});

test("sequential refinements form a chain and branching from an older parent remains unique", async () => {
  const { service, parent } = await generatedParent();
  const first = (await service.refine(refinementRequest(parent))).versions[0];
  const second = (
    await service.refine(
      refinementRequest(first, {
        refinementInstructions: "Make the sea stormier.",
        refinementSequence: 2,
      }),
    )
  ).versions[0];
  const branch = (
    await service.refine(
      refinementRequest(parent, {
        refinementInstructions: "Make the scene warmer.",
        refinementSequence: 3,
      }),
    )
  ).versions[0];

  assert.equal(second.parentVersionId, first.id);
  assert.equal(branch.parentVersionId, parent.id);
  assert.equal(second.rootVersionId, parent.id);
  assert.equal(branch.rootVersionId, parent.id);
  assert.equal(new Set([parent.id, first.id, second.id, branch.id]).size, 4);
  assert.deepEqual([first.optionLabel, second.optionLabel, branch.optionLabel], [
    "Option A.1",
    "Option A.2",
    "Option A.3",
  ]);
});

test("appending refinements selects the child, preserves parents, and exposes branching lineage", async () => {
  const { service, parent, versions } = await generatedParent();
  let creation = pageCreation.appendImageGenerationBatch(
    pageCreation.createDefaultPageCreationState(),
    versions,
  );
  creation = pageCreation.selectImageVersion(creation, parent.id);
  const first = (await service.refine(refinementRequest(parent))).versions[0];
  creation = pageCreation.appendRefinedImageVersion(creation, first);
  const branch = (
    await service.refine(
      refinementRequest(parent, {
        refinementInstructions: "Wider composition",
        refinementSequence: 2,
      }),
    )
  ).versions[0];
  creation = pageCreation.appendRefinedImageVersion(creation, branch);

  assert.equal(creation.imageVersions.length, 5);
  assert.deepEqual(
    creation.imageVersions.filter((version) => version.selected).map((version) => version.id),
    [branch.id],
  );
  assert.ok(creation.imageVersions.some((version) => version.id === parent.id));
  const root = pageCreation
    .getImageVersionLineage(creation.imageVersions)
    .find((node) => node.version.id === parent.id);
  assert.equal(root.children.length, 2);
});

test("refinement state stays isolated to its page", async () => {
  const { service, parent, versions } = await generatedParent("page-1");
  const child = (await service.refine(refinementRequest(parent))).versions[0];
  const firstPage = pageCreation.appendRefinedImageVersion(
    pageCreation.appendImageGenerationBatch(pageCreation.createDefaultPageCreationState(), versions),
    child,
  );
  const secondPage = pageCreation.createDefaultPageCreationState();

  assert.ok(firstPage.imageVersions.every((version) => version.pageId === "page-1"));
  assert.equal(secondPage.imageVersions.length, 0);
  assert.equal(secondPage.approvedImageVersionId, null);
});

test("approval requires selection and records the selected page-level version", async () => {
  const { versions } = await generatedParent();
  const emptyApproval = pageCreation.approveSelectedImageVersion(
    pageCreation.createDefaultPageCreationState(),
  );
  assert.equal(emptyApproval.approvedImageVersionId, null);

  let creation = pageCreation.appendImageGenerationBatch(
    pageCreation.createDefaultPageCreationState(),
    versions,
  );
  creation = pageCreation.selectImageVersion(creation, versions[1].id);
  creation = pageCreation.approveSelectedImageVersion(
    creation,
    "2026-09-25T12:00:00.000Z",
  );
  assert.equal(creation.approvedImageVersionId, versions[1].id);
  assert.equal(creation.illustrationApprovedAt, "2026-09-25T12:00:00.000Z");
  assert.equal(creation.illustrationStatus, "illustration_approved");
});

test("selection, generation, and refinement never silently replace page approval", async () => {
  const { service, parent, versions } = await generatedParent();
  let creation = pageCreation.appendImageGenerationBatch(
    pageCreation.createDefaultPageCreationState(),
    versions,
  );
  creation = pageCreation.selectImageVersion(creation, parent.id);
  creation = pageCreation.approveSelectedImageVersion(creation, "approved-at");
  const approvedId = creation.approvedImageVersionId;

  creation = pageCreation.selectImageVersion(creation, versions[1].id);
  assert.equal(creation.approvedImageVersionId, approvedId);
  creation = pageCreation.appendImageGenerationBatch(creation, [
    { ...versions[2], id: "later-option", generationBatchId: "batch-2", batchNumber: 2 },
  ]);
  assert.equal(creation.approvedImageVersionId, approvedId);
  const child = (await service.refine(refinementRequest(parent))).versions[0];
  creation = pageCreation.appendRefinedImageVersion(creation, child);
  assert.equal(creation.approvedImageVersionId, approvedId);
  assert.ok(creation.imageVersions.some((version) => version.id === approvedId));
});

test("explicit reopening clears active approval but retains the formerly approved version", async () => {
  const { versions } = await generatedParent();
  let creation = pageCreation.appendImageGenerationBatch(
    pageCreation.createDefaultPageCreationState(),
    versions,
  );
  creation = pageCreation.selectImageVersion(creation, versions[0].id);
  creation = pageCreation.approveSelectedImageVersion(creation, "approved-at");
  creation = pageCreation.reopenIllustrationDevelopment(creation);

  assert.equal(creation.approvedImageVersionId, null);
  assert.equal(creation.illustrationApprovedAt, null);
  assert.ok(creation.imageVersions.some((version) => version.id === versions[0].id));
  assert.equal(creation.imageVersions.find((version) => version.id === versions[0].id).selected, true);
});

test("illustration progress and next-page navigation represent partial and complete plans", async () => {
  const { versions } = await generatedParent("page-1");
  let approvedCreation = pageCreation.appendImageGenerationBatch(
    pageCreation.createDefaultPageCreationState(),
    versions,
  );
  approvedCreation = pageCreation.selectImageVersion(approvedCreation, versions[0].id);
  approvedCreation = pageCreation.approveSelectedImageVersion(approvedCreation, "approved-at");
  const pendingCreation = pageCreation.createDefaultPageCreationState();
  const basePage = {
    storyPlanId: "plan-1",
    title: "Page",
    description: "",
    visualDirection: "",
    narration: "",
    dialogue: "",
    status: "approved",
  };
  const plan = {
    id: "plan-1",
    projectId: "project-1",
    synopsis: "",
    targetPageCount: 2,
    status: "approved",
    createdAt: "",
    updatedAt: "",
    pageBeats: [
      { ...basePage, id: "page-1", order: 1, creation: approvedCreation },
      { ...basePage, id: "page-2", order: 2, creation: pendingCreation },
    ],
  };

  assert.deepEqual(pageCreation.getIllustrationProgress(plan), {
    approved: 1,
    total: 2,
    complete: false,
  });
  assert.equal(pageCreation.getAdjacentPageBeatId(plan, "page-1", "next"), "page-2");
  plan.pageBeats[1].creation = approvedCreation;
  assert.equal(pageCreation.getIllustrationProgress(plan).complete, true);
  assert.equal(pageCreation.getAdjacentPageBeatId(plan, "page-2", "next"), null);
});
