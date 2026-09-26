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

const imageGeneration = loadTypeScriptModule("../src/services/image-generation.ts");
const { MockImageGenerationService } = loadTypeScriptModule(
  "../src/services/mock-image-generation.ts",
  { "@/services/image-generation": imageGeneration },
);
const pageCreation = loadTypeScriptModule("../src/lib/page-creation.ts");
const zip = loadTypeScriptModule("../src/lib/zip.ts");
const assembly = loadTypeScriptModule("../src/lib/story-assembly.ts");
const storyExport = loadTypeScriptModule("../src/lib/story-export.ts", {
  "@/lib/story-assembly": assembly,
  "@/lib/zip": zip,
});

const styleBible = {
  projectId: "project-dday",
  artStyle: "Documentary graphic novel",
  mood: "Tense and reflective",
  palette: "Slate blue, sea green, and muted amber",
  characterDescriptions: "Allied soldiers shown with consistent field equipment.",
  visualReferences: "",
  additionalInstructions: "Clearly label all artwork as a local prototype.",
};

function generationRequest(pageId, batchNumber = 1) {
  return {
    projectId: "project-dday",
    pageId,
    prompt: `Approved illustration prompt for ${pageId}`,
    aspectRatio: "16:9",
    optionCount: 3,
    batchNumber,
    styleBible,
    references: [],
  };
}

async function createApprovedPage(pageId, order, options = {}) {
  const service = new MockImageGenerationService();
  const generation = await service.generate(generationRequest(pageId));
  let creation = pageCreation.createDefaultPageCreationState();
  creation = pageCreation.appendImageGenerationBatch(creation, generation.versions);
  const parent = generation.versions[options.optionIndex ?? 0];
  creation = pageCreation.selectImageVersion(creation, parent.id);
  let approvedVersion = parent;

  if (options.refine) {
    const refinement = await service.refine({
      projectId: "project-dday",
      pageId,
      parentVersion: parent,
      refinementInstructions: "Make the sea stormier, the light colder, and the soldiers more prominent.",
      refinementSequence: 1,
      styleBible,
      references: [],
    });
    approvedVersion = refinement.versions[0];
    creation = pageCreation.appendRefinedImageVersion(creation, approvedVersion);
  }

  creation = pageCreation.approveSelectedImageVersion(creation, "2026-09-26T10:00:00.000Z");
  if (options.selectUnapprovedAfterApproval) {
    const unapproved = generation.versions.find((version) => version.id !== approvedVersion.id);
    creation = pageCreation.selectImageVersion(creation, unapproved.id);
  }

  return {
    page: {
      id: pageId,
      storyPlanId: "plan-dday",
      order,
      title: options.title ?? `D-Day page ${order}`,
      description: `Scene description ${order}`,
      visualDirection: "Cinematic historical composition",
      narration: options.narration ?? `Narration for D-Day page ${order}.`,
      dialogue: options.dialogue ?? `Dialogue for D-Day page ${order}.`,
      status: "approved",
      creation,
    },
    generation,
    approvedVersion,
    parent,
  };
}

function project(pages) {
  return {
    id: "project-dday",
    title: "D-Day: The Longest Day",
    description: "A three-page visual history.",
    createdAt: "2026-09-26T09:00:00.000Z",
    updatedAt: "2026-09-26T10:00:00.000Z",
    outputType: "visual_book",
    styleBible,
    characters: [],
    onboarding: { currentStep: "complete", completedSteps: [], status: "complete" },
    chatHistory: [],
    selectedPageBeatId: pages[0]?.id ?? null,
    planningChatHistory: [],
    storyPlan: {
      id: "plan-dday",
      projectId: "project-dday",
      synopsis: "Three ordered moments from the Normandy landings.",
      targetPageCount: pages.length,
      status: "approved",
      pageBeats: pages,
      createdAt: "2026-09-26T09:30:00.000Z",
      updatedAt: "2026-09-26T10:00:00.000Z",
    },
  };
}

function unzipStored(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const entries = new Map();
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    entries.set(name, bytes.slice(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  return entries;
}

function assertLocalReferencesResolve(svg) {
  const ids = new Set([...svg.matchAll(/\sid=["']([^"']+)["']/g)].map((match) => match[1]));
  const references = [...svg.matchAll(/url\(\s*["']?#([^"')\s]+)["']?\s*\)/g)].map((match) => match[1]);
  assert.ok(references.length > 0);
  for (const reference of references) assert.ok(ids.has(reference), `Missing local SVG target #${reference}`);
}

test("actual initial mock generation can select, approve, and export the exact approved version", async () => {
  const result = await createApprovedPage("page-one", 1, { selectUnapprovedAfterApproval: true });
  assert.equal(result.generation.versions.length, 3);
  const prepared = storyExport.prepareApprovedPageExport(project([result.page]), result.page.id);

  assert.equal(prepared.ready, true);
  assert.equal(prepared.issueKind, null);
  assert.equal(prepared.asset.imageVersionId, result.approvedVersion.id);
  assert.equal(prepared.asset.imageVersionId, result.page.creation.approvedImageVersionId);
  assert.notEqual(
    prepared.asset.imageVersionId,
    result.page.creation.imageVersions.find((version) => version.selected).id,
  );
  const decoded = storyExport.decodeExportImage(prepared.asset.sourceUrl);
  const svg = new TextDecoder().decode(decoded.bytes);
  assert.ok(decoded.bytes.length > 0);
  assert.match(svg, /<linearGradient id="bg"/);
  assert.match(svg, /fill="url\(#bg\)"/);
  assertLocalReferencesResolve(svg);
});

test("actual option-C refinement preserves lineage and exports its gradient and filter artwork", async () => {
  const result = await createApprovedPage("page-refined", 1, { optionIndex: 2, refine: true });
  assert.equal(result.approvedVersion.parentVersionId, result.parent.id);
  assert.equal(result.approvedVersion.rootVersionId, result.parent.id);
  assert.equal(result.page.creation.approvedImageVersionId, result.approvedVersion.id);

  const prepared = storyExport.prepareApprovedPageExport(project([result.page]), result.page.id);
  assert.equal(prepared.ready, true);
  assert.equal(prepared.asset.imageVersionId, result.approvedVersion.id);
  const svg = new TextDecoder().decode(storyExport.decodeExportImage(prepared.asset.sourceUrl).bytes);
  assert.match(svg, /<linearGradient id="refined-bg"/);
  assert.match(svg, /fill="url\(#refined-bg\)"/);
  assert.match(svg, /<filter id="blur"/);
  assert.match(svg, /filter="url\(#blur\)"/);
  assertLocalReferencesResolve(svg);
});

test("production ZIP export packages three actual generated pages including a refinement", async () => {
  const [first, second, third] = await Promise.all([
    createApprovedPage("page-one", 1, { title: "The Approach", narration: "Landing craft cross the rough Channel.", dialogue: "Hold steady." }),
    createApprovedPage("page-two", 2, { optionIndex: 1, title: "The Landing", narration: "The ramps fall at the shoreline.", dialogue: "Move!" }),
    createApprovedPage("page-three", 3, { optionIndex: 2, refine: true, title: "Beyond the Beach", narration: "The unit advances inland.", dialogue: "Keep together." }),
  ]);
  const realProject = project([first.page, second.page, third.page]);
  const plan = storyExport.prepareStoryExport(realProject, "2026-09-26T11:00:00.000Z");
  const archive = storyExport.createPortableBookArchive(plan);
  const entries = unzipStored(archive.bytes);

  assert.equal(plan.ready, true);
  assert.deepEqual([...entries.keys()], [
    "index.html",
    "manifest.json",
    "pages/page-01.svg",
    "pages/page-02.svg",
    "pages/page-03.svg",
  ]);
  const manifest = JSON.parse(new TextDecoder().decode(entries.get("manifest.json")));
  assert.deepEqual(manifest.pages.map((page) => page.pageNumber), [1, 2, 3]);
  assert.deepEqual(
    manifest.pages.map((page) => page.approvedImageVersionId),
    [first.approvedVersion.id, second.approvedVersion.id, third.approvedVersion.id],
  );
  assert.deepEqual(
    manifest.pages.map((page) => page.illustrationAssetPath),
    ["pages/page-01.svg", "pages/page-02.svg", "pages/page-03.svg"],
  );
  assert.deepEqual(
    manifest.pages.map((page) => page.narration),
    ["Landing craft cross the rough Channel.", "The ramps fall at the shoreline.", "The unit advances inland."],
  );
  assert.deepEqual(manifest.pages.map((page) => page.dialogue), ["Hold steady.", "Move!", "Keep together."]);

  const approvedVersions = [first.approvedVersion, second.approvedVersion, third.approvedVersion];
  for (let index = 0; index < approvedVersions.length; index += 1) {
    const assetBytes = entries.get(`pages/page-0${index + 1}.svg`);
    assert.ok(assetBytes.length > 0);
    const expected = storyExport.decodeExportImage(approvedVersions[index].imageUrl).bytes;
    assert.deepEqual(assetBytes, expected);
    assertLocalReferencesResolve(new TextDecoder().decode(assetBytes));
  }

  const html = new TextDecoder().decode(entries.get("index.html"));
  assert.doesNotMatch(html, /<script\s+src=|<link\b[^>]*href=|https?:\/\//i);
});

test("all actual approved mock assets pass the decoder used by WebM preparation", async () => {
  const pages = await Promise.all([
    createApprovedPage("video-one", 1),
    createApprovedPage("video-two", 2, { optionIndex: 2 }),
    createApprovedPage("video-three", 3, { optionIndex: 2, refine: true }),
  ]);
  const plan = storyExport.prepareStoryExport(project(pages.map((entry) => entry.page)));
  assert.equal(plan.ready, true);
  assert.equal(plan.assets.length, 3);
  for (const asset of plan.assets) {
    const decoded = storyExport.decodeExportImage(asset.sourceUrl);
    assert.equal(decoded.mimeType, "image/svg+xml");
    assert.ok(decoded.bytes.length > 0);
  }
});
