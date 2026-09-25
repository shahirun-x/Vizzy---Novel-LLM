import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadTypeScriptModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  new Function("exports", "require", outputText)(exports, (specifier) => {
    throw new Error(`Unexpected test import: ${specifier}`);
  });
  return exports;
}

const {
  addVisualReference,
  appendImageGenerationBatch,
  canOpenPageCreation,
  createDefaultPageCreationState,
  getAdjacentPageBeatId,
  getImageGenerationBatches,
  removeVisualReference,
  resetEditedPrompt,
  saveEditedPrompt,
  selectImageVersion,
} = loadTypeScriptModule("../src/lib/page-creation.ts");
const { buildIllustrationPrompt } = loadTypeScriptModule("../src/lib/illustration-prompt.ts");

function fixture() {
  const creation = createDefaultPageCreationState();
  const page = {
    id: "page-1",
    storyPlanId: "plan-1",
    order: 1,
    title: "The flooded archive",
    description: "Ira enters the archive as shallow water reflects the shelves.",
    visualDirection: "Keep Ira small against the towering shelves.",
    narration: "The archive remembered the rain.",
    dialogue: "Ira: This should be impossible.",
    optionalActLabel: "Act I",
    status: "approved",
    creation: {
      ...creation,
      settings: {
        ...creation.settings,
        lighting: "Copper emergency lights",
        additionalInstructions: "Keep the doorway visible.",
        aspectRatio: "16:9",
      },
    },
  };
  const project = {
    id: "project-1",
    title: "Night Archive",
    description: "An archivist discovers that forgotten memories leave physical shadows.",
    outputType: "graphic_novel",
    styleBible: {
      projectId: "project-1",
      artStyle: "Expressive ink",
      mood: "Quietly mysterious",
      palette: "Midnight blue and oxidized copper",
      characterDescriptions: "Ira wears a long archive coat and round glasses.",
      visualReferences: "Architectural photography with deep vanishing points.",
      additionalInstructions: "No modern screens.",
    },
    characters: [],
    onboarding: { currentStep: "complete", completedSteps: [], status: "complete" },
    chatHistory: [],
    storyPlan: null,
    selectedPageBeatId: page.id,
    planningChatHistory: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  return { project, page };
}

test("builds a deterministic prompt from the complete Style Bible and page settings", () => {
  const { project, page } = fixture();
  const prompt = buildIllustrationPrompt(project, page);

  assert.equal(prompt, buildIllustrationPrompt(project, page));
  for (const expected of [
    "Night Archive",
    "Graphic novel",
    "Expressive ink",
    "Quietly mysterious",
    "Midnight blue and oxidized copper",
    "Ira wears a long archive coat",
    "Architectural photography",
    "No modern screens",
    "The flooded archive",
    "Keep the doorway visible",
    "16:9",
  ]) assert.match(prompt, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("omits missing optional values and deduplicates repeated source text", () => {
  const { project, page } = fixture();
  project.styleBible.mood = "";
  page.narration = "";
  page.dialogue = "";
  page.visualDirection = project.styleBible.artStyle;
  const prompt = buildIllustrationPrompt(project, page);

  assert.doesNotMatch(prompt, /undefined|null/);
  assert.equal(prompt.match(/Expressive ink/g)?.length, 1);
  assert.doesNotMatch(prompt, /^Narration:/m);
});

test("does not repeat a planner-generated Style Bible summary as page direction", () => {
  const { project, page } = fixture();
  page.visualDirection = `Style: ${project.styleBible.artStyle}. Mood: ${project.styleBible.mood}. Palette: ${project.styleBible.palette}. Maintain character continuity from: ${project.styleBible.characterDescriptions}`;
  const prompt = buildIllustrationPrompt(project, page);

  assert.equal(prompt.match(/Expressive ink/g)?.length, 1);
  assert.doesNotMatch(prompt, /^Visual direction:/m);
});

test("keeps edited prompts explicit until reset", () => {
  let creation = createDefaultPageCreationState();
  creation.prompt.automaticPrompt = "Automatic prompt";
  creation = saveEditedPrompt(creation, "A deliberate user edit");
  const changedSettings = {
    ...creation,
    settings: { ...creation.settings, lighting: "Moonlit" },
  };

  assert.equal(changedSettings.prompt.mode, "edited");
  assert.equal(changedSettings.prompt.editedPrompt, "A deliberate user edit");
  creation = resetEditedPrompt(changedSettings);
  assert.equal(creation.prompt.mode, "automatic");
  assert.equal(creation.prompt.editedPrompt, null);
});

test("adds and removes reference metadata without leaking between pages", () => {
  const firstPage = addVisualReference(createDefaultPageCreationState(), "page-1", {
    title: "Station light",
    url: "https://example.com/light",
    description: "Use the amber falloff.",
    purpose: "lighting",
  });
  const secondPage = createDefaultPageCreationState();

  assert.equal(firstPage.references.length, 1);
  assert.equal(firstPage.references[0].pageId, "page-1");
  assert.equal(secondPage.references.length, 0);
  assert.equal(removeVisualReference(firstPage, firstPage.references[0].id).references.length, 0);
});

test("opens only approved pages and navigates previous and next in order", () => {
  const { page } = fixture();
  const plan = {
    id: "plan-1",
    projectId: "project-1",
    synopsis: "",
    targetPageCount: 3,
    status: "approved",
    createdAt: "",
    updatedAt: "",
    pageBeats: [
      { ...page, id: "page-2", order: 2 },
      { ...page, id: "page-1", order: 1 },
      { ...page, id: "page-3", order: 3 },
    ],
  };

  assert.equal(getAdjacentPageBeatId(plan, "page-2", "previous"), "page-1");
  assert.equal(getAdjacentPageBeatId(plan, "page-2", "next"), "page-3");
  assert.equal(getAdjacentPageBeatId(plan, "page-1", "previous"), null);
  assert.equal(canOpenPageCreation(plan, "page-2"), true);
  assert.equal(canOpenPageCreation({ ...plan, status: "draft" }, "page-2"), false);
  assert.equal(canOpenPageCreation(plan, "missing-page"), false);
});

function imageVersion({ id, pageId = "page-1", batchNumber = 1, optionIndex = 1, prompt = "Exact prompt", aspectRatio = "3:4" }) {
  return {
    id,
    pageId,
    imageUrl: `data:image/svg+xml,${id}`,
    prompt,
    createdAt: `2026-01-0${batchNumber}T00:00:00.000Z`,
    selected: false,
    parentVersionId: null,
    generationBatchId: `batch-${batchNumber}`,
    batchNumber,
    optionIndex,
    optionLabel: `Option ${String.fromCharCode(64 + optionIndex)}`,
    aspectRatio,
    compositionDirection: "Prototype direction",
    visualSeed: `${id}-seed`,
    status: "generated",
  };
}

test("appends immutable batches newest first without deleting prior versions or prompts", () => {
  let creation = createDefaultPageCreationState();
  creation.prompt.automaticPrompt = "Exact prompt";
  const first = [1, 2, 3].map((optionIndex) =>
    imageVersion({ id: `first-${optionIndex}`, optionIndex }),
  );
  const second = [1, 2, 3].map((optionIndex) =>
    imageVersion({
      id: `second-${optionIndex}`,
      batchNumber: 2,
      optionIndex,
      aspectRatio: "16:9",
    }),
  );

  creation = appendImageGenerationBatch(creation, first);
  creation = appendImageGenerationBatch(creation, second);
  const batches = getImageGenerationBatches(creation.imageVersions);

  assert.equal(creation.imageVersions.length, 6);
  assert.deepEqual(batches.map((batch) => batch.batchNumber), [2, 1]);
  assert.equal(batches[1].versions[0].aspectRatio, "3:4");
  assert.ok(creation.imageVersions.every((version) => version.prompt === "Exact prompt"));
});

test("selects exactly one version across history and preserves every candidate", () => {
  const allVersions = [
    ...[1, 2, 3].map((optionIndex) => imageVersion({ id: `first-${optionIndex}`, optionIndex })),
    ...[1, 2, 3].map((optionIndex) =>
      imageVersion({ id: `second-${optionIndex}`, batchNumber: 2, optionIndex }),
    ),
  ];
  let creation = appendImageGenerationBatch(createDefaultPageCreationState(), allVersions);
  creation = selectImageVersion(creation, "first-2");
  creation = selectImageVersion(creation, "second-3");

  assert.equal(creation.imageVersions.length, 6);
  assert.deepEqual(
    creation.imageVersions.filter((version) => version.selected).map((version) => version.id),
    ["second-3"],
  );
  assert.equal(creation.illustrationStatus, "direction_selected");
});

test("keeps generation history isolated by page and historical ratios immutable", () => {
  const firstPage = appendImageGenerationBatch(createDefaultPageCreationState(), [
    imageVersion({ id: "page-one", pageId: "page-1", aspectRatio: "1:1" }),
  ]);
  const secondPage = createDefaultPageCreationState();
  const updatedSettings = {
    ...firstPage,
    settings: { ...firstPage.settings, aspectRatio: "16:9" },
  };

  assert.equal(updatedSettings.imageVersions[0].aspectRatio, "1:1");
  assert.equal(secondPage.imageVersions.length, 0);
  assert.equal(updatedSettings.imageVersions[0].pageId, "page-1");
});
