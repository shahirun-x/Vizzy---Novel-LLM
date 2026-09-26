import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
function loadTypeScriptModule(relativePath, mocks = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  const exports = {};
  new Function("exports", "require", outputText)(exports, (specifier) => {
    if (specifier in mocks) return mocks[specifier];
    if (specifier === "zod") return nodeRequire("zod");
    throw new Error(`Unexpected test import: ${specifier}`);
  });
  return exports;
}

const pageCreation = loadTypeScriptModule("../src/lib/page-creation.ts");
const illustrationPrompt = loadTypeScriptModule("../src/lib/illustration-prompt.ts");
const constants = loadTypeScriptModule("../src/lib/constants.ts");
const onboarding = loadTypeScriptModule("../src/lib/onboarding.ts", { "@/lib/constants": constants });
const storyPlanner = loadTypeScriptModule("../src/lib/story-planner.ts", { "@/lib/page-creation": pageCreation });
const projectCommands = loadTypeScriptModule("../src/lib/project-commands.ts", {
  "@/lib/illustration-prompt": illustrationPrompt,
  "@/lib/onboarding": onboarding,
  "@/lib/page-creation": pageCreation,
  "@/lib/story-planner": storyPlanner,
});
const generationJobs = loadTypeScriptModule("../src/lib/generation-jobs.ts", {
  "@/lib/page-creation": pageCreation,
  "@/lib/project-commands": projectCommands,
});
const promptModule = loadTypeScriptModule("../src/lib/story-director-prompt.ts");
const schemaModule = loadTypeScriptModule("../src/lib/story-director-schema.ts");
const aiConverter = loadTypeScriptModule("../src/lib/ai-story-director.ts", {
  "@/lib/illustration-prompt": illustrationPrompt,
  "@/lib/page-creation": pageCreation,
  "@/lib/story-planner": storyPlanner,
});
const storyService = loadTypeScriptModule("../src/services/story-director.ts");
class FakeOpenAI {
  static RateLimitError = class extends Error {};
  static APIError = class extends Error {};
}
const openAIProvider = loadTypeScriptModule("../src/services/openai-story-director.server.ts", {
  "server-only": {},
  openai: FakeOpenAI,
  "openai/helpers/zod": { zodTextFormat: () => ({}) },
  "@/lib/story-director-prompt": promptModule,
  "@/lib/story-director-schema": schemaModule,
  "@/services/story-director": storyService,
});
const coordinatorModule = loadTypeScriptModule("../src/services/story-generation-coordinator.ts", {
  "@/lib/ai-story-director": aiConverter,
  "@/lib/generation-jobs": generationJobs,
  "@/services/story-director": storyService,
});

const request = {
  prompt: "A young astronomer returns a fallen star to the sky without abandoning her seaside village.",
  outputType: "visual_book",
  pageCount: 3,
  visualStyle: "Luminous ink wash",
  aspectRatio: "3:4",
  referenceNotes: "Keep the brass telescope and red scarf consistent.",
};

function specification() {
  return {
    project: { title: "The Fallen Star", synopsis: "Mira finds courage by sharing a star with her village.", genre: "Hopeful fantasy", narrativePremise: "A choice between wonder and home reveals that both can coexist.", outputFormat: "visual_book" },
    storyBible: { artisticStyle: "Luminous ink wash", colourPalette: "Midnight blue, amber, coral", mood: "Tender and wondrous", atmosphere: "Salt mist and starlight", visualDirection: "Painterly shapes with clear silhouettes", continuityInstructions: "Mira always wears her red scarf and carries the brass telescope." },
    characters: [{ id: "mira", name: "Mira", role: "Young astronomer", physicalDescription: "Small, dark curls, alert brown eyes", clothing: "Navy coat and red scarf", distinguishingFeatures: "Brass telescope", continuityNotes: "Scarf, coat, and telescope remain unchanged." }],
    storyPlan: {
      beginning: "Mira discovers a fallen star.", middle: "She climbs the lighthouse as the village gathers.", ending: "The star returns while leaving a warm spark for home.",
      pages: [1, 2, 3].map((order) => ({ id: `page-${order}`, order, title: ["The Visitor", "The Climb", "Two Lights"][order - 1], sceneDescription: `Complete scene ${order}`, narration: `Narration ${order}`, dialogue: order === 2 ? "Mira: Hold the light for me." : "", characterIds: ["mira"], location: order === 1 ? "Rocky shore" : "Lighthouse", timeAndLighting: "Night, warm lantern against blue starlight", cameraDirection: "Eye-level cinematic frame", shotType: "Wide shot", composition: "Mira in the foreground with a clear luminous focal point", emotionalTone: "Hopeful", illustrationInstructions: "Preserve the scarf, telescope, mist, and star scale.", actLabel: `Act ${order}` })),
    },
  };
}

test("validates a complete structured story and enforces the requested contract", () => {
  const parsedRequest = schemaModule.storyDirectorRequestSchema.parse(request);
  const result = schemaModule.validateGeneratedStory(parsedRequest, specification());
  assert.equal(result.storyPlan.pages.length, 3);
  assert.equal(result.project.outputFormat, "visual_book");
});

test("accepts omitted creative preferences as explicit nulls", () => {
  const parsed = schemaModule.storyDirectorRequestSchema.parse({
    ...request,
    visualStyle: null,
    referenceNotes: null,
  });
  assert.equal(parsed.visualStyle, null);
  assert.equal(parsed.referenceNotes, null);
});

test("rejects unknown character references, duplicate IDs, and page-count drift", () => {
  const unknown = specification();
  unknown.storyPlan.pages[0].characterIds = ["stranger"];
  assert.throws(() => schemaModule.generatedStorySpecificationSchema.parse(unknown), /Unknown character ID/);
  const duplicate = specification();
  duplicate.storyPlan.pages[1].id = duplicate.storyPlan.pages[0].id;
  assert.throws(() => schemaModule.generatedStorySpecificationSchema.parse(duplicate), /Page IDs must be unique/);
  const unordered = specification();
  unordered.storyPlan.pages[1].order = 3;
  assert.throws(() => schemaModule.generatedStorySpecificationSchema.parse(unordered), /consecutively ordered/);
  const short = specification();
  short.storyPlan.pages.pop();
  assert.throws(() => schemaModule.validateGeneratedStory(request, short), /exactly 3 pages/);
});

test("server provider fails closed with an accurate missing-key error", () => {
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    assert.throws(
      () => new openAIProvider.OpenAIStoryDirector(),
      (error) => error.code === "NOT_CONFIGURED" && /not configured/i.test(error.message),
    );
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  }
});

test("prompt construction preserves explicit user constraints and describes one combined request", () => {
  const instructions = promptModule.buildStoryDirectorInstructions();
  const input = promptModule.buildStoryDirectorInput(request);
  assert.match(instructions, /complete, coherent visual story specification/i);
  assert.match(instructions, /do not ask follow-up/i);
  assert.match(input, /3-page visual book/);
  assert.match(input, /brass telescope and red scarf/);
  assert.match(input, /Luminous ink wash/);
});

test("atomically converts generated output into an approved illustration-ready Vizzy project", () => {
  const project = aiConverter.createProjectFromGeneratedStory(specification(), request, "2026-01-01T00:00:00.000Z");
  assert.equal(project.creationSource, "ai");
  assert.equal(project.onboarding.status, "complete");
  assert.equal(project.storyPlan.status, "approved");
  assert.equal(project.storyPlan.pageBeats.length, 3);
  assert.ok(project.storyPlan.pageBeats.every((page) => page.status === "approved"));
  assert.ok(project.storyPlan.pageBeats.every((page) => page.creation.illustrationStatus === "prompt_ready"));
  assert.ok(project.storyPlan.pageBeats.every((page) => page.creation.prompt.automaticPrompt.length > 50));
  assert.ok(project.storyPlan.pageBeats.every((page) => page.creation.imageVersions.length === 0));
  assert.equal(project.storyPlan.pageBeats[0].characterIds[0], project.characters[0].id);
});

function studio() {
  let value = { version: 7, projects: [], selectedProjectId: null, activeView: "ai_create", generationJobs: [] };
  return {
    read: () => value,
    update: (updater) => { value = updater(value); },
    value: () => value,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

test("fake provider success persists one completed job and one complete project", async () => {
  const state = studio();
  const provider = { generate: async () => specification() };
  const coordinator = new coordinatorModule.StoryGenerationCoordinator(provider, state, { createJobId: () => "story-job-1", now: () => "2026-01-01T00:00:00.000Z" });
  const projectId = await coordinator.start(request);
  assert.equal(state.value().projects.length, 1);
  assert.equal(state.value().selectedProjectId, projectId);
  assert.equal(state.value().generationJobs[0].status, "succeeded");
  assert.equal(state.value().generationJobs[0].resultProjectId, projectId);
});

test("successful story generation appends without mutating an existing project", async () => {
  const state = studio();
  const existing = { id: "existing-project", title: "Keep me" };
  state.update((current) => ({ ...current, projects: [existing], selectedProjectId: existing.id }));
  const coordinator = new coordinatorModule.StoryGenerationCoordinator(
    { generate: async () => specification() },
    state,
    { createJobId: () => "story-job-isolated" },
  );
  await coordinator.start(request);
  assert.equal(state.value().projects.length, 2);
  assert.strictEqual(state.value().projects[0], existing);
  assert.equal(state.value().projects[0].title, "Keep me");
});

test("fake provider failure records a retryable terminal job without partial project state", async () => {
  const state = studio();
  const provider = { generate: async () => { throw new storyService.StoryDirectorError("PROVIDER_FAILURE", "Temporary provider failure", true); } };
  const coordinator = new coordinatorModule.StoryGenerationCoordinator(provider, state, { createJobId: () => "story-job-fail" });
  await assert.rejects(coordinator.start(request), /Temporary provider failure/);
  assert.equal(state.value().projects.length, 0);
  assert.equal(state.value().generationJobs[0].status, "failed");
  assert.equal(state.value().generationJobs[0].error.code, "PROVIDER_FAILURE");
});

test("cancellation ignores a late fake-provider response and applies no project", async () => {
  const state = studio();
  const pending = deferred();
  const provider = { generate: () => pending.promise };
  const coordinator = new coordinatorModule.StoryGenerationCoordinator(provider, state, { createJobId: () => "story-job-cancel" });
  const operation = coordinator.start(request);
  coordinator.cancel("story-job-cancel");
  pending.resolve(specification());
  await assert.rejects(operation, /cancelled/i);
  assert.equal(state.value().projects.length, 0);
  assert.equal(state.value().generationJobs[0].status, "cancelled");
});

test("duplicate active story requests are blocked and interrupted jobs retry with lineage", async () => {
  const state = studio();
  const pending = deferred();
  let calls = 0;
  const provider = { generate: () => { calls += 1; return pending.promise; } };
  let ids = 0;
  const coordinator = new coordinatorModule.StoryGenerationCoordinator(provider, state, { createJobId: () => `story-job-${++ids}` });
  const first = coordinator.start(request);
  await assert.rejects(coordinator.start(request), /already running/);
  assert.equal(calls, 1);
  coordinator.cancel("story-job-1");
  pending.resolve(specification());
  await assert.rejects(first, /cancelled/i);

  const interruptedState = studio();
  interruptedState.update((current) => ({ ...current, generationJobs: [{ ...state.value().generationJobs[0], id: "old", status: "interrupted", error: { category: "persistence_error", message: "interrupted", code: "INTERRUPTED" } }] }));
  const retryCoordinator = new coordinatorModule.StoryGenerationCoordinator({ generate: async () => specification() }, interruptedState, { createJobId: () => "retry" });
  await retryCoordinator.retry("old");
  assert.equal(interruptedState.value().generationJobs.at(-1).retryOfJobId, "old");
  assert.equal(interruptedState.value().generationJobs.at(-1).attempt, 2);
});

test("interruption recovery prevents a late story result from creating a project", async () => {
  const state = studio();
  const pending = deferred();
  const coordinator = new coordinatorModule.StoryGenerationCoordinator(
    { generate: () => pending.promise },
    state,
    { createJobId: () => "story-job-interrupted" },
  );
  const operation = coordinator.start(request);
  state.update((current) => generationJobs.recoverInterruptedGenerationJobs(current, "2026-01-01T00:00:00.000Z"));
  pending.resolve(specification());
  await assert.rejects(operation, /no longer active/i);
  assert.equal(state.value().projects.length, 0);
  assert.equal(state.value().generationJobs[0].status, "interrupted");
});
