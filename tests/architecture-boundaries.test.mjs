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

const pageCreation = loadTypeScriptModule("../src/lib/page-creation.ts");
const projectStorage = loadTypeScriptModule("../src/lib/project-storage.ts", {
  "@/lib/page-creation": pageCreation,
});
const imageGeneration = loadTypeScriptModule("../src/services/image-generation.ts");
const mockImageGeneration = loadTypeScriptModule(
  "../src/services/mock-image-generation.ts",
  { "@/services/image-generation": imageGeneration },
);
const studioPersistence = loadTypeScriptModule(
  "../src/services/studio-persistence.ts",
  { "@/lib/project-storage": projectStorage },
);
const applicationServices = loadTypeScriptModule(
  "../src/services/application-services.ts",
  {
    "@/services/mock-image-generation": mockImageGeneration,
    "@/services/studio-persistence": studioPersistence,
  },
);
const orchestratorModule = loadTypeScriptModule(
  "../src/services/image-generation-orchestrator.ts",
  {
    "@/lib/page-creation": pageCreation,
    "@/services/image-generation": imageGeneration,
  },
);
const illustrationPrompt = loadTypeScriptModule("../src/lib/illustration-prompt.ts");
const constants = loadTypeScriptModule("../src/lib/constants.ts");
const onboarding = loadTypeScriptModule("../src/lib/onboarding.ts", {
  "@/lib/constants": constants,
});
const storyPlanner = loadTypeScriptModule("../src/lib/story-planner.ts", {
  "@/lib/page-creation": pageCreation,
});
const commands = loadTypeScriptModule("../src/lib/project-commands.ts", {
  "@/lib/illustration-prompt": illustrationPrompt,
  "@/lib/onboarding": onboarding,
  "@/lib/page-creation": pageCreation,
  "@/lib/story-planner": storyPlanner,
});

function imageVersion(pageId, id, optionIndex = 1) {
  return {
    id,
    pageId,
    imageUrl: `data:image/svg+xml,${id}`,
    prompt: "Prepared prompt",
    createdAt: "2026-01-01T00:00:00.000Z",
    selected: false,
    parentVersionId: null,
    rootVersionId: id,
    generationBatchId: "batch-1",
    batchNumber: 1,
    optionIndex,
    optionLabel: `Option ${String.fromCharCode(64 + optionIndex)}`,
    aspectRatio: "3:4",
    compositionDirection: "Test composition",
    visualSeed: id,
    generationSource: "generated",
    refinementInstruction: null,
    refinementDepth: 0,
    refinementSequence: 0,
    status: "generated",
  };
}

function project(id = "project-1") {
  const makePage = (pageId, order) => ({
    id: pageId,
    storyPlanId: `plan-${id}`,
    order,
    title: `Page ${order}`,
    description: "Description",
    visualDirection: "Direction",
    narration: "Narration",
    dialogue: "",
    status: "approved",
    creation: {
      ...pageCreation.createDefaultPageCreationState(),
      illustrationStatus: "prompt_ready",
      prompt: {
        automaticPrompt: `Prepared prompt for ${pageId}`,
        editedPrompt: null,
        mode: "automatic",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
  });
  return {
    id,
    title: "Boundary Test",
    description: "Story",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    outputType: "visual_book",
    styleBible: {
      projectId: id,
      artStyle: "Ink",
      mood: "Quiet",
      palette: "Blue",
      characterDescriptions: "Ira",
      visualReferences: "",
      additionalInstructions: "",
    },
    characters: [],
    onboarding: { currentStep: "complete", completedSteps: [], status: "complete" },
    chatHistory: [],
    storyPlan: {
      id: `plan-${id}`,
      projectId: id,
      synopsis: "Story",
      targetPageCount: 2,
      status: "approved",
      pageBeats: [makePage(`${id}-page-1`, 1), makePage(`${id}-page-2`, 2)],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    selectedPageBeatId: `${id}-page-1`,
    planningChatHistory: [],
  };
}

function stateWith(...projects) {
  return {
    version: 6,
    projects,
    selectedProjectId: projects[0]?.id ?? null,
    activeView: "page_creation",
    generationJobs: [],
  };
}

test("application services default to the mock and accept alternate injected implementations", () => {
  assert.ok(
    applicationServices.defaultApplicationServices.imageGeneration instanceof
      mockImageGeneration.MockImageGenerationService,
  );

  const alternate = { generate() {}, refine() {} };
  const persistence = { subscribe() {}, getSnapshot() {}, getServerSnapshot() {}, write() {} };
  const configured = applicationServices.createApplicationServices({
    imageGeneration: alternate,
    persistence,
  });
  assert.equal(configured.imageGeneration, alternate);
  assert.equal(configured.persistence, persistence);
});

test("generation runs through the injected service with provider-independent request data", async () => {
  const calls = [];
  const generated = [1, 2, 3].map((index) =>
    imageVersion("project-1-page-1", `generated-${index}`, index),
  );
  const alternate = {
    async generate(request) {
      calls.push(request);
      return { generationBatchId: "alternate-batch", versions: generated };
    },
    async refine() {
      throw new Error("not used");
    },
  };
  const projectValue = project();
  const operation = orchestratorModule.preparePageGeneration(
    projectValue,
    "project-1-page-1",
  );
  const result = await new orchestratorModule.ImageGenerationOrchestrator(
    alternate,
  ).generate(operation);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].optionCount, 3);
  assert.equal(calls[0].projectId, projectValue.id);
  assert.equal(calls[0].pageId, "project-1-page-1");
  assert.equal(result.versions, generated);
});

test("refinement runs through the injected service and preserves parent request metadata", async () => {
  const parent = { ...imageVersion("project-1-page-1", "parent"), selected: true };
  const projectValue = project();
  projectValue.storyPlan.pageBeats[0].creation.imageVersions = [parent];
  const child = {
    ...imageVersion("project-1-page-1", "child"),
    selected: true,
    parentVersionId: parent.id,
    rootVersionId: parent.id,
    generationSource: "refinement",
    refinementInstruction: "More mist",
    refinementDepth: 1,
    refinementSequence: 1,
  };
  let received;
  const alternate = {
    async generate() {
      throw new Error("not used");
    },
    async refine(request) {
      received = request;
      return { generationBatchId: request.parentVersion.generationBatchId, versions: [child] };
    },
  };
  const operation = orchestratorModule.preparePageRefinement(
    projectValue,
    "project-1-page-1",
    "More mist",
  );
  const result = await new orchestratorModule.ImageGenerationOrchestrator(
    alternate,
  ).refine(operation);

  assert.deepEqual(received.parentVersion, parent);
  assert.equal(received.refinementSequence, 1);
  assert.equal(received.refinementInstructions, "More mist");
  assert.equal(result.versions[0], child);
});

test("provider errors propagate without being converted into domain validation errors", async () => {
  const providerError = new Error("provider unavailable");
  const alternate = {
    async generate() {
      throw providerError;
    },
    async refine() {
      throw providerError;
    },
  };
  const operation = orchestratorModule.preparePageGeneration(project(), "project-1-page-1");
  await assert.rejects(
    new orchestratorModule.ImageGenerationOrchestrator(alternate).generate(operation),
    (error) => error === providerError,
  );
});

test("generation commands keep projects and pages isolated", () => {
  const first = project("first");
  const second = project("second");
  const versions = [1, 2, 3].map((index) =>
    imageVersion("first-page-1", `first-option-${index}`, index),
  );
  const next = commands.appendPageGenerationResult(
    stateWith(first, second),
    first.id,
    "first-page-1",
    versions,
    1,
  );

  assert.equal(next.projects[0].storyPlan.pageBeats[0].creation.imageVersions.length, 3);
  assert.equal(next.projects[0].storyPlan.pageBeats[1].creation.imageVersions.length, 0);
  assert.equal(next.projects[1].storyPlan.pageBeats[0].creation.imageVersions.length, 0);
});

test("selection, approval protection, and reopening retain exact version history", () => {
  const projectValue = project();
  const pageId = "project-1-page-1";
  const first = imageVersion(pageId, "option-1", 1);
  const second = imageVersion(pageId, "option-2", 2);
  projectValue.storyPlan.pageBeats[0].creation.imageVersions = [first, second];
  let state = stateWith(projectValue);

  state = commands.selectProjectPageImageVersion(state, pageId, first.id);
  state = commands.approveProjectPageIllustration(state, pageId);
  state = commands.selectProjectPageImageVersion(state, pageId, second.id);
  let creation = state.projects[0].storyPlan.pageBeats[0].creation;
  assert.equal(creation.approvedImageVersionId, first.id);
  assert.equal(creation.imageVersions.find((version) => version.selected).id, first.id);

  state = commands.reopenProjectPageIllustration(state, pageId);
  state = commands.selectProjectPageImageVersion(state, pageId, second.id);
  creation = state.projects[0].storyPlan.pageBeats[0].creation;
  assert.equal(creation.approvedImageVersionId, null);
  assert.equal(creation.imageVersions.find((version) => version.selected).id, second.id);
  assert.equal(creation.imageVersions.length, 2);
});

test("browser persistence restores version-6 state and notifies same-tab subscribers", () => {
  const originalWindow = globalThis.window;
  const values = new Map();
  const listeners = new Map();
  const fakeWindow = {
    localStorage: {
      getItem(key) {
        return values.get(key) ?? null;
      },
      setItem(key, value) {
        values.set(key, value);
      },
    },
    addEventListener(type, listener) {
      const entries = listeners.get(type) ?? new Set();
      entries.add(listener);
      listeners.set(type, entries);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
      return true;
    },
  };
  globalThis.window = fakeWindow;
  try {
    const persistence = studioPersistence.createBrowserStudioPersistence();
    let notifications = 0;
    const unsubscribe = persistence.subscribe(() => {
      notifications += 1;
    });
    const state = stateWith(project());
    persistence.write(state);

    assert.equal(notifications, 1);
    assert.deepEqual(projectStorage.parseStudioSnapshot(persistence.getSnapshot()), state);
    unsubscribe();
    persistence.write(state);
    assert.equal(notifications, 1);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
