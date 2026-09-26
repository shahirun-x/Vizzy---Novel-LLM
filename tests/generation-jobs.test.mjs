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
const illustrationPrompt = loadTypeScriptModule("../src/lib/illustration-prompt.ts");
const constants = loadTypeScriptModule("../src/lib/constants.ts");
const onboarding = loadTypeScriptModule("../src/lib/onboarding.ts", {
  "@/lib/constants": constants,
});
const storyPlanner = loadTypeScriptModule("../src/lib/story-planner.ts", {
  "@/lib/page-creation": pageCreation,
});
const projectCommands = loadTypeScriptModule("../src/lib/project-commands.ts", {
  "@/lib/illustration-prompt": illustrationPrompt,
  "@/lib/onboarding": onboarding,
  "@/lib/page-creation": pageCreation,
  "@/lib/story-planner": storyPlanner,
});
const projectStorage = loadTypeScriptModule("../src/lib/project-storage.ts", {
  "@/lib/page-creation": pageCreation,
});
const imageGeneration = loadTypeScriptModule("../src/services/image-generation.ts");
const orchestratorModule = loadTypeScriptModule(
  "../src/services/image-generation-orchestrator.ts",
  {
    "@/lib/page-creation": pageCreation,
    "@/services/image-generation": imageGeneration,
  },
);
const generationJobs = loadTypeScriptModule("../src/lib/generation-jobs.ts", {
  "@/lib/page-creation": pageCreation,
  "@/lib/project-commands": projectCommands,
});
const coordinatorModule = loadTypeScriptModule(
  "../src/services/generation-job-coordinator.ts",
  {
    "@/lib/generation-jobs": generationJobs,
    "@/services/image-generation": imageGeneration,
    "@/services/image-generation-orchestrator": orchestratorModule,
  },
);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class ControlledProvider {
  generateCalls = [];
  refineCalls = [];

  generate(request, options) {
    const completion = deferred();
    this.generateCalls.push({ request, options, completion });
    return completion.promise;
  }

  refine(request, options) {
    const completion = deferred();
    this.refineCalls.push({ request, options, completion });
    return completion.promise;
  }
}

function imageVersion(pageId, id, optionIndex = 1, overrides = {}) {
  return {
    id,
    pageId,
    imageUrl: `data:image/svg+xml,${id}`,
    prompt: "Prepared prompt",
    createdAt: "2026-01-01T00:00:00.000Z",
    selected: false,
    parentVersionId: null,
    rootVersionId: id,
    generationBatchId: "batch-existing",
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
    ...overrides,
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
    title: "Job Test",
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

function createHarness(initialState = stateWith(project())) {
  let state = initialState;
  let idSequence = 0;
  let timeSequence = 0;
  const provider = new ControlledProvider();
  const gateway = {
    read: () => state,
    update(updater) {
      state = updater(state);
    },
  };
  const coordinator = new coordinatorModule.GenerationJobCoordinator(
    new orchestratorModule.ImageGenerationOrchestrator(provider),
    gateway,
    {
      createJobId: () => `job-${(idSequence += 1)}`,
      now: () => `2026-01-01T00:00:${String(timeSequence++).padStart(2, "0")}.000Z`,
    },
  );
  return {
    provider,
    gateway,
    coordinator,
    get state() {
      return state;
    },
    set state(value) {
      state = value;
    },
  };
}

function generationResult(request, suffix = "one") {
  const generationBatchId = `batch-${suffix}`;
  return {
    generationBatchId,
    versions: [1, 2, 3].map((optionIndex) =>
      imageVersion(request.pageId, `${suffix}-option-${optionIndex}`, optionIndex, {
        prompt: request.prompt,
        rootVersionId: `${suffix}-option-${optionIndex}`,
        generationBatchId,
        batchNumber: request.batchNumber,
        aspectRatio: request.aspectRatio,
      }),
    ),
  };
}

function addSelectedParent(projectValue, pageIndex = 0) {
  const page = projectValue.storyPlan.pageBeats[pageIndex];
  const parent = imageVersion(page.id, `${page.id}-parent`, 1, {
    prompt: page.creation.prompt.automaticPrompt,
    selected: true,
    status: "selected",
  });
  page.creation.imageVersions = [parent];
  page.creation.illustrationStatus = "direction_selected";
  return parent;
}

function refinementResult(request, suffix = "child") {
  const parent = request.parentVersion;
  const child = imageVersion(request.pageId, `${parent.id}-${suffix}`, parent.optionIndex, {
    prompt: parent.prompt,
    selected: true,
    parentVersionId: parent.id,
    rootVersionId: parent.rootVersionId,
    generationBatchId: parent.generationBatchId,
    batchNumber: parent.batchNumber,
    aspectRatio: parent.aspectRatio,
    optionLabel: `Option A.${request.refinementSequence}`,
    generationSource: "refinement",
    refinementInstruction: request.refinementInstructions,
    refinementDepth: parent.refinementDepth + 1,
    refinementSequence: request.refinementSequence,
    status: "selected",
  });
  return { generationBatchId: parent.generationBatchId, versions: [child] };
}

test("jobs have unique IDs and are running before provider invocation returns", async () => {
  const harness = createHarness();
  const first = harness.coordinator.startInitialGeneration("project-1", "project-1-page-1");
  const second = harness.coordinator.startInitialGeneration("project-1", "project-1-page-2");

  assert.deepEqual(harness.state.generationJobs.map((job) => job.id), ["job-1", "job-2"]);
  assert.deepEqual(harness.state.generationJobs.map((job) => job.status), ["running", "running"]);
  assert.equal(harness.provider.generateCalls.length, 2);

  harness.provider.generateCalls[0].completion.resolve(
    generationResult(harness.provider.generateCalls[0].request, "first"),
  );
  harness.provider.generateCalls[1].completion.resolve(
    generationResult(harness.provider.generateCalls[1].request, "second"),
  );
  await Promise.all([first, second]);
});

test("duplicate active requests are blocked before a second provider call", async () => {
  const harness = createHarness();
  const first = harness.coordinator.startInitialGeneration("project-1", "project-1-page-1");
  await assert.rejects(
    harness.coordinator.startInitialGeneration("project-1", "project-1-page-1"),
    (error) => error.code === "DUPLICATE_ACTIVE_REQUEST",
  );
  assert.equal(harness.provider.generateCalls.length, 1);
  harness.coordinator.cancel("job-1");
  harness.provider.generateCalls[0].completion.resolve(
    generationResult(harness.provider.generateCalls[0].request),
  );
  await assert.rejects(first, (error) => error.category === "cancelled");
});

test("a valid initial batch applies exactly three options and succeeds atomically", async () => {
  const harness = createHarness();
  const pending = harness.coordinator.startInitialGeneration("project-1", "project-1-page-1");
  const call = harness.provider.generateCalls[0];
  const result = generationResult(call.request, "atomic");
  call.completion.resolve(result);
  await pending;

  const page = harness.state.projects[0].storyPlan.pageBeats[0];
  assert.deepEqual(page.creation.imageVersions.map((version) => version.id), result.versions.map((version) => version.id));
  assert.equal(harness.state.generationJobs[0].status, "succeeded");
  assert.deepEqual(harness.state.generationJobs[0].resultVersionIds, result.versions.map((version) => version.id));
});

test("invalid provider batches fail without partially applying versions", async () => {
  const harness = createHarness();
  const pending = harness.coordinator.startInitialGeneration("project-1", "project-1-page-1");
  const call = harness.provider.generateCalls[0];
  const invalid = generationResult(call.request);
  invalid.versions.pop();
  call.completion.resolve(invalid);

  await assert.rejects(pending, (error) => error.category === "invalid_result");
  assert.equal(harness.state.projects[0].storyPlan.pageBeats[0].creation.imageVersions.length, 0);
  assert.equal(harness.state.generationJobs[0].status, "failed");
  assert.equal(harness.state.generationJobs[0].error.category, "invalid_result");
});

test("provider rejection records a retryable failure without clearing artwork", async () => {
  const projectValue = project();
  const parent = addSelectedParent(projectValue);
  const harness = createHarness(stateWith(projectValue));
  const pending = harness.coordinator.startInitialGeneration("project-1", "project-1-page-1");
  harness.provider.generateCalls[0].completion.reject(new Error("provider unavailable"));

  await assert.rejects(pending, (error) => error.category === "provider_error");
  const creation = harness.state.projects[0].storyPlan.pageBeats[0].creation;
  assert.deepEqual(creation.imageVersions.map((version) => version.id), [parent.id]);
  assert.equal(harness.state.generationJobs[0].status, "failed");
});

test("cancellation prevents a late provider result from being applied", async () => {
  const harness = createHarness();
  const pending = harness.coordinator.startInitialGeneration("project-1", "project-1-page-1");
  const call = harness.provider.generateCalls[0];
  harness.coordinator.cancel("job-1");
  assert.equal(call.options.signal.aborted, true);
  assert.equal(harness.state.generationJobs[0].status, "cancelled");
  call.completion.resolve(generationResult(call.request, "late"));

  await assert.rejects(pending, (error) => error.category === "cancelled");
  assert.equal(harness.state.projects[0].storyPlan.pageBeats[0].creation.imageVersions.length, 0);
  assert.equal(harness.state.generationJobs[0].status, "cancelled");
});

test("successful refinement preserves parent and root lineage", async () => {
  const projectValue = project();
  const parent = addSelectedParent(projectValue);
  const harness = createHarness(stateWith(projectValue));
  const pending = harness.coordinator.startRefinement(
    "project-1",
    "project-1-page-1",
    "More mist",
  );
  const call = harness.provider.refineCalls[0];
  call.completion.resolve(refinementResult(call.request));
  const childId = await pending;

  const versions = harness.state.projects[0].storyPlan.pageBeats[0].creation.imageVersions;
  const child = versions.find((version) => version.id === childId);
  assert.equal(child.parentVersionId, parent.id);
  assert.equal(child.rootVersionId, parent.id);
  assert.equal(versions.length, 2);
  assert.equal(harness.state.generationJobs[0].status, "succeeded");
});

test("a cancelled refinement ignores a late child and preserves its selected parent", async () => {
  const projectValue = project();
  const parent = addSelectedParent(projectValue);
  const harness = createHarness(stateWith(projectValue));
  const pending = harness.coordinator.startRefinement("project-1", "project-1-page-1", "Colder");
  const call = harness.provider.refineCalls[0];
  harness.coordinator.cancel("job-1");
  call.completion.resolve(refinementResult(call.request, "late"));

  await assert.rejects(pending, (error) => error.category === "cancelled");
  const creation = harness.state.projects[0].storyPlan.pageBeats[0].creation;
  assert.deepEqual(creation.imageVersions.map((version) => version.id), [parent.id]);
  assert.equal(creation.imageVersions[0].selected, true);
});

test("explicit retry creates a new job with lineage and incremented attempt", async () => {
  const harness = createHarness();
  const first = harness.coordinator.startInitialGeneration("project-1", "project-1-page-1");
  harness.provider.generateCalls[0].completion.reject(new Error("temporary provider failure"));
  await assert.rejects(first);

  const retry = harness.coordinator.retry("job-1");
  assert.equal(harness.state.generationJobs[1].id, "job-2");
  assert.equal(harness.state.generationJobs[1].retryOfJobId, "job-1");
  assert.equal(harness.state.generationJobs[1].attempt, 2);
  assert.equal(harness.state.generationJobs[1].idempotencyKey, harness.state.generationJobs[0].idempotencyKey);
  const call = harness.provider.generateCalls[1];
  call.completion.resolve(generationResult(call.request, "retry"));
  await retry;
  assert.equal(harness.state.generationJobs[1].status, "succeeded");
});

test("interrupted jobs restore honestly and can be retried explicitly", async () => {
  const harness = createHarness();
  const abandoned = harness.coordinator.startInitialGeneration("project-1", "project-1-page-1");
  harness.state = generationJobs.recoverInterruptedGenerationJobs(
    harness.state,
    "2026-01-01T00:01:00.000Z",
  );
  assert.equal(harness.state.generationJobs[0].status, "interrupted");
  assert.equal(harness.state.projects[0].storyPlan.pageBeats[0].creation.illustrationStatus, "prompt_ready");

  const retry = harness.coordinator.retry("job-1");
  const retryCall = harness.provider.generateCalls[1];
  retryCall.completion.resolve(generationResult(retryCall.request, "restored"));
  await retry;
  assert.equal(harness.state.generationJobs[1].retryOfJobId, "job-1");
  assert.equal(harness.state.generationJobs[1].status, "succeeded");

  const oldCall = harness.provider.generateCalls[0];
  oldCall.completion.resolve(generationResult(oldCall.request, "abandoned"));
  await assert.rejects(abandoned, (error) => error.category === "stale_result");
});

test("prompt changes make an in-flight generation result stale", async () => {
  const harness = createHarness();
  const pending = harness.coordinator.startInitialGeneration("project-1", "project-1-page-1");
  const call = harness.provider.generateCalls[0];
  const page = harness.state.projects[0].storyPlan.pageBeats[0];
  page.creation.prompt = { ...page.creation.prompt, mode: "edited", editedPrompt: "Changed prompt" };
  call.completion.resolve(generationResult(call.request, "stale-prompt"));

  await assert.rejects(pending, (error) => error.category === "stale_result");
  assert.equal(page.creation.imageVersions.length, 0);
  assert.equal(harness.state.generationJobs[0].status, "failed");
});

test("page deletion makes an in-flight result stale without touching other pages", async () => {
  const harness = createHarness();
  const pending = harness.coordinator.startInitialGeneration("project-1", "project-1-page-1");
  const call = harness.provider.generateCalls[0];
  harness.state.projects[0].storyPlan.pageBeats = harness.state.projects[0].storyPlan.pageBeats.filter(
    (page) => page.id !== "project-1-page-1",
  );
  call.completion.resolve(generationResult(call.request, "deleted"));

  await assert.rejects(pending, (error) => error.category === "stale_result");
  assert.equal(harness.state.projects[0].storyPlan.pageBeats[0].id, "project-1-page-2");
  assert.equal(harness.state.projects[0].storyPlan.pageBeats[0].creation.imageVersions.length, 0);
});

test("approval during generation protects the exact approved version", async () => {
  const projectValue = project();
  const parent = addSelectedParent(projectValue);
  const harness = createHarness(stateWith(projectValue));
  const pending = harness.coordinator.startInitialGeneration("project-1", "project-1-page-1");
  const call = harness.provider.generateCalls[0];
  harness.gateway.update((state) =>
    projectCommands.approveProjectPageIllustration(state, "project-1-page-1"),
  );
  call.completion.resolve(generationResult(call.request, "after-approval"));

  await assert.rejects(pending, (error) => error.category === "stale_result");
  const creation = harness.state.projects[0].storyPlan.pageBeats[0].creation;
  assert.equal(creation.approvedImageVersionId, parent.id);
  assert.deepEqual(creation.imageVersions.map((version) => version.id), [parent.id]);
});

test("navigation away does not invalidate a job tied to its original page", async () => {
  const harness = createHarness();
  const pending = harness.coordinator.startInitialGeneration("project-1", "project-1-page-1");
  const call = harness.provider.generateCalls[0];
  harness.state.projects[0].selectedPageBeatId = "project-1-page-2";
  call.completion.resolve(generationResult(call.request, "navigated"));
  await pending;

  assert.equal(harness.state.projects[0].storyPlan.pageBeats[0].creation.imageVersions.length, 3);
  assert.equal(harness.state.projects[0].storyPlan.pageBeats[1].creation.imageVersions.length, 0);
});

test("jobs remain isolated to their original project when another project is selected", async () => {
  const firstProject = project("project-1");
  const secondProject = project("project-2");
  const harness = createHarness(stateWith(firstProject, secondProject));
  const pending = harness.coordinator.startInitialGeneration(
    "project-2",
    "project-2-page-1",
  );
  const call = harness.provider.generateCalls[0];
  harness.state.selectedProjectId = "project-1";
  call.completion.resolve(generationResult(call.request, "second-project"));
  await pending;

  assert.equal(harness.state.projects[0].storyPlan.pageBeats[0].creation.imageVersions.length, 0);
  assert.equal(harness.state.projects[1].storyPlan.pageBeats[0].creation.imageVersions.length, 3);
});

test("a cancelled older response cannot overwrite a newer successful operation", async () => {
  const harness = createHarness();
  const older = harness.coordinator.startInitialGeneration("project-1", "project-1-page-1");
  const olderCall = harness.provider.generateCalls[0];
  harness.coordinator.cancel("job-1");
  const newer = harness.coordinator.startInitialGeneration("project-1", "project-1-page-1");
  const newerCall = harness.provider.generateCalls[1];
  newerCall.completion.resolve(generationResult(newerCall.request, "newer"));
  await newer;
  olderCall.completion.resolve(generationResult(olderCall.request, "older"));
  await assert.rejects(older, (error) => error.category === "cancelled");

  const ids = harness.state.projects[0].storyPlan.pageBeats[0].creation.imageVersions.map(
    (version) => version.id,
  );
  assert.deepEqual(ids, ["newer-option-1", "newer-option-2", "newer-option-3"]);
  assert.deepEqual(harness.state.generationJobs.map((job) => job.status), ["cancelled", "succeeded"]);
});

test("duplicate completion handling does not append the same batch twice", async () => {
  const harness = createHarness();
  const pending = harness.coordinator.startInitialGeneration("project-1", "project-1-page-1");
  const call = harness.provider.generateCalls[0];
  const result = generationResult(call.request, "once");
  call.completion.resolve(result);
  await pending;
  const completed = harness.state;
  const duplicate = generationJobs.applyInitialGenerationJobResult(
    completed,
    "job-1",
    result,
    "2026-01-01T00:03:00.000Z",
  );
  assert.equal(duplicate, completed);
  assert.equal(duplicate.projects[0].storyPlan.pageBeats[0].creation.imageVersions.length, 3);
});

test("completed job metadata survives serialization and version-5 migrates safely", async () => {
  const harness = createHarness();
  const pending = harness.coordinator.startInitialGeneration("project-1", "project-1-page-1");
  const call = harness.provider.generateCalls[0];
  call.completion.resolve(generationResult(call.request, "persisted"));
  await pending;

  const restored = projectStorage.parseStudioSnapshot(JSON.stringify(harness.state));
  assert.equal(restored.version, 7);
  assert.equal(restored.generationJobs[0].status, "succeeded");
  assert.deepEqual(restored.generationJobs[0].resultVersionIds, [
    "persisted-option-1",
    "persisted-option-2",
    "persisted-option-3",
  ]);

  const version5 = { ...harness.state, version: 5 };
  delete version5.generationJobs;
  const migrated = projectStorage.migrateStudioState(version5);
  assert.equal(migrated.version, 7);
  assert.deepEqual(migrated.generationJobs, []);
  assert.equal(migrated.projects[0].storyPlan.pageBeats[0].creation.imageVersions.length, 3);
});

test("retry refuses obsolete context instead of replaying a stale paid operation", async () => {
  const harness = createHarness();
  const pending = harness.coordinator.startInitialGeneration("project-1", "project-1-page-1");
  harness.provider.generateCalls[0].completion.reject(new Error("temporary failure"));
  await assert.rejects(pending);
  harness.state.projects[0].storyPlan.pageBeats[0].creation.prompt = {
    ...harness.state.projects[0].storyPlan.pageBeats[0].creation.prompt,
    mode: "edited",
    editedPrompt: "New context",
  };

  await assert.rejects(
    harness.coordinator.retry("job-1"),
    (error) => error.category === "stale_result",
  );
  assert.equal(harness.state.generationJobs.length, 1);
  assert.equal(harness.provider.generateCalls.length, 1);
});
