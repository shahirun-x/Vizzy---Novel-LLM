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
const { migrateStudioState, parseStudioSnapshot } = loadTypeScriptModule(
  "../src/lib/project-storage.ts",
  { "@/lib/page-creation": pageCreation },
);

const sprint11Project = {
  id: "legacy-project",
  title: "Existing Story",
  description: "An existing Sprint 1.1 concept.",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  outputType: "visual_book",
  styleBible: {
    projectId: "legacy-project",
    artStyle: "Watercolour",
    mood: "Gentle",
    palette: "Soft green",
    characterDescriptions: "",
    visualReferences: "",
    additionalInstructions: "",
  },
  characters: [],
  onboarding: { currentStep: "complete", completedSteps: [], status: "complete" },
  chatHistory: [],
};

test("migrates a Sprint 1.1 version-1 envelope without losing project data", () => {
  const migrated = migrateStudioState({
    version: 1,
    projects: [sprint11Project],
    selectedProjectId: "legacy-project",
    activeView: "story",
  });

  assert.equal(migrated.version, 4);
  assert.equal(migrated.projects[0].title, "Existing Story");
  assert.equal(migrated.projects[0].description, sprint11Project.description);
  assert.equal(migrated.projects[0].styleBible.artStyle, "Watercolour");
  assert.equal(migrated.projects[0].storyPlan, null);
  assert.equal(migrated.projects[0].selectedPageBeatId, null);
  assert.deepEqual(migrated.projects[0].planningChatHistory, []);
});

test("migrates and restores a version-2 planning state with page creation defaults", () => {
  const version2 = migrateStudioState({
    version: 1,
    projects: [sprint11Project],
    selectedProjectId: "legacy-project",
    activeView: "planning",
  });
  version2.projects[0].selectedPageBeatId = "beat-2";
  version2.projects[0].storyPlan = {
    id: "plan-1",
    projectId: "legacy-project",
    synopsis: sprint11Project.description,
    targetPageCount: 1,
    status: "draft",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    pageBeats: [
      {
        id: "beat-2",
        storyPlanId: "plan-1",
        order: 1,
        title: "Opening",
        description: "A saved scene.",
        visualDirection: "Quiet wide composition.",
        narration: "",
        dialogue: "",
        status: "draft",
      },
    ],
  };
  version2.version = 2;

  const restored = parseStudioSnapshot(JSON.stringify(version2));
  assert.equal(restored.version, 4);
  assert.equal(restored.activeView, "planning");
  assert.equal(restored.projects[0].selectedPageBeatId, "beat-2");
  assert.equal(restored.projects[0].storyPlan.id, "plan-1");
  assert.equal(restored.projects[0].storyPlan.pageBeats[0].creation.settings.aspectRatio, "3:4");
  assert.deepEqual(restored.projects[0].storyPlan.pageBeats[0].creation.references, []);
});

test("preserves version-3 page prompt, references, chat, and selected workspace", () => {
  const migrated = migrateStudioState({
    version: 2,
    projects: [sprint11Project],
    selectedProjectId: "legacy-project",
    activeView: "story",
  });
  migrated.activeView = "page_creation";
  migrated.projects[0].storyPlan = {
    id: "plan-3",
    projectId: "legacy-project",
    synopsis: "A scene",
    targetPageCount: 1,
    status: "approved",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    pageBeats: [
      {
        id: "beat-3",
        storyPlanId: "plan-3",
        order: 1,
        title: "Opening",
        description: "A scene",
        visualDirection: "Wide",
        narration: "",
        dialogue: "",
        status: "approved",
        creation: {
          ...pageCreation.createDefaultPageCreationState(),
          prompt: {
            automaticPrompt: "Automatic",
            editedPrompt: "Saved edit",
            mode: "edited",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          chatHistory: [{ id: "m1", role: "user", content: "Keep the rain", createdAt: "2026-01-01T00:00:00.000Z" }],
        },
      },
    ],
  };
  migrated.projects[0].selectedPageBeatId = "beat-3";

  const restored = parseStudioSnapshot(JSON.stringify(migrated));
  const creation = restored.projects[0].storyPlan.pageBeats[0].creation;
  assert.equal(restored.activeView, "page_creation");
  assert.equal(restored.projects[0].selectedPageBeatId, "beat-3");
  assert.equal(creation.prompt.editedPrompt, "Saved edit");
  assert.equal(creation.chatHistory[0].content, "Keep the rain");
});

test("migrates legacy image history and preserves complete version-4 batch metadata", () => {
  const migrated = migrateStudioState({
    version: 3,
    projects: [
      {
        ...sprint11Project,
        selectedPageBeatId: "beat-images",
        planningChatHistory: [],
        storyPlan: {
          id: "plan-images",
          projectId: "legacy-project",
          synopsis: "A visual scene",
          targetPageCount: 1,
          status: "approved",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          pageBeats: [
            {
              id: "beat-images",
              storyPlanId: "plan-images",
              order: 1,
              title: "Visual",
              description: "A visual scene",
              visualDirection: "Wide",
              narration: "",
              dialogue: "",
              status: "approved",
              creation: {
                ...pageCreation.createDefaultPageCreationState(),
                settings: {
                  ...pageCreation.createDefaultCreativeSettings(),
                  aspectRatio: "16:9",
                },
                imageVersions: [
                  {
                    id: "legacy-image",
                    pageId: "beat-images",
                    imageUrl: "data:image/svg+xml,legacy",
                    prompt: "Exact legacy prompt",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    selected: true,
                    parentVersionId: null,
                    generationBatchId: "batch-one",
                    status: "selected",
                  },
                ],
              },
            },
          ],
        },
      },
    ],
    selectedProjectId: "legacy-project",
    activeView: "page_creation",
  });

  const image = migrated.projects[0].storyPlan.pageBeats[0].creation.imageVersions[0];
  assert.equal(migrated.version, 4);
  assert.equal(image.prompt, "Exact legacy prompt");
  assert.equal(image.aspectRatio, "16:9");
  assert.equal(image.batchNumber, 1);
  assert.equal(image.optionLabel, "Option A");

  const restored = parseStudioSnapshot(JSON.stringify(migrated));
  assert.deepEqual(
    restored.projects[0].storyPlan.pageBeats[0].creation.imageVersions,
    migrated.projects[0].storyPlan.pageBeats[0].creation.imageVersions,
  );
});
