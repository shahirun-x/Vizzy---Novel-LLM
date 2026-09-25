import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/story-assembly.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const assembly = {};
new Function("exports", "require", outputText)(assembly, (specifier) => { throw new Error(`Unexpected import: ${specifier}`); });

function version(id, selected = false) {
  return { id, pageId: "", imageUrl: `data:image/svg+xml,${id}`, prompt: "prompt", createdAt: "", selected, parentVersionId: null, rootVersionId: id, generationBatchId: "batch", batchNumber: 1, optionIndex: 1, optionLabel: "Option A", aspectRatio: "16:9", compositionDirection: "Wide", visualSeed: id, generationSource: "generated", refinementInstruction: null, refinementDepth: 0, refinementSequence: 0, status: "approved" };
}
function page(id, order, approved = true) {
  const approvedVersion = version(`${id}-approved`);
  const selectedOther = version(`${id}-selected`, true);
  approvedVersion.pageId = id; selectedOther.pageId = id;
  return { id, storyPlanId: "plan", order, title: `Page ${order}`, description: "", visualDirection: "", narration: `Narration ${order}`, dialogue: `Dialogue ${order}`, status: "approved", creation: { illustrationStatus: approved ? "illustration_approved" : "refining", settings: { aspectRatio: "16:9" }, prompt: {}, references: [], chatHistory: [], imageVersions: [approvedVersion, selectedOther], approvedImageVersionId: approved ? approvedVersion.id : null, illustrationApprovedAt: approved ? "now" : null } };
}
function project(pages, status = "approved") { return { id: "project", title: "Book", storyPlan: { id: "plan", projectId: "project", synopsis: "Synopsis", targetPageCount: pages.length, status, pageBeats: pages, createdAt: "", updatedAt: "" } }; }

test("assembles approved artwork in story order with exact text and aspect ratio", () => {
  const result = assembly.assembleVisualStory(project([page("two", 2), page("one", 1)]));
  assert.equal(result.ready, true); assert.deepEqual(result.readerPages.map((item) => item.pageId), ["one", "two"]);
  assert.equal(result.readerPages[0].imageVersionId, "one-approved"); assert.equal(result.readerPages[0].narration, "Narration 1");
  assert.equal(result.readerPages[0].dialogue, "Dialogue 1"); assert.equal(result.readerPages[0].aspectRatio, "16:9");
});
test("never substitutes selected unapproved artwork and reports incomplete pages", () => {
  const result = assembly.assembleVisualStory(project([page("one", 1, false)]));
  assert.equal(result.ready, false); assert.equal(result.readerPages.length, 0); assert.equal(result.incompletePages, 1);
});
test("detects missing approved references and invalid image URLs", () => {
  const missing = page("one", 1); missing.creation.approvedImageVersionId = "missing";
  assert.match(assembly.assembleVisualStory(project([missing])).pages[0].issue, /missing/);
  const invalid = page("two", 1); invalid.creation.imageVersions[0].imageUrl = "";
  assert.match(assembly.assembleVisualStory(project([invalid])).pages[0].issue, /invalid/);
});
test("rejects unapproved beats and cross-page approved versions", () => {
  const unapproved = page("one", 1); unapproved.status = "draft";
  assert.match(assembly.assembleVisualStory(project([unapproved])).pages[0].issue, /beat approval/);
  const crossed = page("two", 1); crossed.creation.imageVersions[0].pageId = "another-page";
  assert.match(assembly.assembleVisualStory(project([crossed])).pages[0].issue, /another page/);
});
test("reports empty, unapproved, and invalidly ordered plans", () => {
  assert.equal(assembly.assembleVisualStory(project([])).ready, false);
  assert.match(assembly.assembleVisualStory(project([page("one", 1)], "draft")).issues[0], /Approve/);
  assert.equal(assembly.assembleVisualStory(project([page("two", 2)])).invalidOrdering, true);
});
test("supports single and multi-page progress without mutating refinement history", () => {
  const first = page("one", 1); first.creation.imageVersions.push({ ...version("child"), pageId: "one", parentVersionId: "one-approved", generationSource: "refinement" });
  const result = assembly.assembleVisualStory(project([first, page("two", 2, false)]));
  assert.equal(result.totalPages, 2); assert.equal(result.approvedIllustrations, 1); assert.equal(first.creation.imageVersions.length, 3);
  assert.equal(assembly.assembleVisualStory(project([first])).ready, true);
});
test("playback navigation handles boundaries and looping", () => {
  assert.equal(assembly.getNextReaderIndex(0, 3, false), 1); assert.equal(assembly.getPreviousReaderIndex(2, 3), 1);
  assert.equal(assembly.getNextReaderIndex(2, 3, false), 2); assert.equal(assembly.getNextReaderIndex(2, 3, true), 0);
  assert.equal(assembly.getPreviousReaderIndex(0, 3), 0);
});
test("page duration is constrained to the supported range", () => {
  assert.equal(assembly.normalizePageDuration(1), 2); assert.equal(assembly.normalizePageDuration(31), 30);
  assert.equal(assembly.normalizePageDuration(5), 5); assert.equal(assembly.normalizePageDuration(Number.NaN), 5);
});
