import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadTypeScriptModule(relativePath, mocks = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  new Function("exports", "require", outputText)(exports, (specifier) => {
    if (specifier in mocks) return mocks[specifier];
    throw new Error(`Unexpected import: ${specifier}`);
  });
  return exports;
}

const zip = loadTypeScriptModule("../src/lib/zip.ts");
const assembly = loadTypeScriptModule("../src/lib/story-assembly.ts");
const storyExport = loadTypeScriptModule("../src/lib/story-export.ts", {
  "@/lib/story-assembly": assembly,
  "@/lib/zip": zip,
});

function svgData(label = "APPROVED PROTOTYPE") {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#223344"/><text x="80" y="120">${label}</text></svg>`)}`;
}

function imageVersion(pageId, id, options = {}) {
  return {
    id,
    pageId,
    imageUrl: options.imageUrl ?? svgData(id),
    prompt: "prompt",
    createdAt: "2026-09-25T00:00:00.000Z",
    selected: options.selected ?? false,
    parentVersionId: null,
    rootVersionId: id,
    generationBatchId: "batch",
    batchNumber: 1,
    optionIndex: 1,
    optionLabel: "Option A",
    aspectRatio: options.aspectRatio ?? "16:9",
    compositionDirection: "Wide",
    visualSeed: id,
    generationSource: "generated",
    refinementInstruction: null,
    refinementDepth: 0,
    refinementSequence: 0,
    status: options.selected ? "selected" : "approved",
  };
}

function page(id, order, options = {}) {
  const approved = imageVersion(id, `${id}-approved`, options);
  const selected = imageVersion(id, `${id}-selected`, { selected: true });
  return {
    id,
    storyPlanId: "plan",
    order,
    title: options.title ?? `Page ${order}`,
    description: `Description ${order}`,
    visualDirection: "Wide cinematic composition",
    narration: options.narration ?? `Narration ${order}`,
    dialogue: options.dialogue ?? `Dialogue ${order}`,
    status: options.pageStatus ?? "approved",
    creation: {
      illustrationStatus: options.approved === false ? "direction_selected" : "illustration_approved",
      settings: { aspectRatio: options.aspectRatio ?? "16:9" },
      prompt: {},
      references: [],
      chatHistory: [],
      imageVersions: [approved, selected],
      approvedImageVersionId: options.approved === false ? null : approved.id,
      illustrationApprovedAt: options.approved === false ? null : "2026-09-25T00:00:00.000Z",
    },
  };
}

function project(pages, options = {}) {
  return {
    id: "project",
    title: options.title ?? "D-Day: The Longest Day",
    description: "A short visual history.",
    createdAt: "",
    updatedAt: "",
    outputType: "visual_book",
    styleBible: {},
    characters: [],
    onboarding: { status: "complete" },
    chatHistory: [{ role: "user", content: "PRIVATE CHAT TOKEN" }],
    selectedPageBeatId: null,
    planningChatHistory: [],
    storyPlan: {
      id: "plan",
      projectId: "project",
      synopsis: options.synopsis ?? "Three moments from the longest day.",
      targetPageCount: pages.length,
      status: options.planStatus ?? "approved",
      pageBeats: pages,
      createdAt: "",
      updatedAt: "",
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

test("creates a versioned manifest in approved story order", () => {
  const result = storyExport.prepareStoryExport(
    project([page("two", 2), page("one", 1)]),
    "2026-09-25T12:00:00.000Z",
  );
  assert.equal(result.ready, true);
  assert.equal(result.manifest.schemaVersion, 1);
  assert.equal(result.manifest.exportedAt, "2026-09-25T12:00:00.000Z");
  assert.equal(result.manifest.outputFormat, "visual_book");
  assert.deepEqual(result.manifest.pages.map((item) => item.pageId), ["one", "two"]);
  assert.deepEqual(result.manifest.pages.map((item) => item.approvedImageVersionId), ["one-approved", "two-approved"]);
});

test("preserves narration, dialogue, aspect ratio, and bounded duration", () => {
  const result = storyExport.prepareStoryExport(project([page("one", 1, { aspectRatio: "3:4", narration: "Remember us", dialogue: "We will" })]), "now", 99);
  const exported = result.manifest.pages[0];
  assert.equal(exported.narration, "Remember us");
  assert.equal(exported.dialogue, "We will");
  assert.equal(exported.aspectRatio, "3:4");
  assert.equal(exported.durationSeconds, 30);
  assert.equal(result.manifest.defaultPageDurationSeconds, 30);
});

test("creates descriptive sanitized filenames", () => {
  assert.equal(storyExport.sanitizeExportFilename("  D-Day: L'été / 1944!  "), "d-day-l-ete-1944");
  const prepared = storyExport.prepareApprovedPageExport(project([page("one", 1)]), "one");
  assert.equal(prepared.asset.downloadFilename, "d-day-the-longest-day-page-01.svg");
});

test("decodes the existing percent-encoded SVG representation", () => {
  const decoded = storyExport.decodeExportImage(svgData("REAL APPROVED ASSET"));
  assert.equal(decoded.mimeType, "image/svg+xml");
  assert.match(new TextDecoder().decode(decoded.bytes), /REAL APPROVED ASSET/);
});

test("rejects missing and malformed approved assets", () => {
  const broken = page("one", 1, { imageUrl: "" });
  const result = storyExport.prepareStoryExport(project([broken]));
  assert.equal(result.ready, false);
  assert.equal(result.incompletePages.length, 1);
  assert.equal(result.incompletePages[0].issueKind, "invalid_approved_asset");
  assert.equal(broken.creation.approvedImageVersionId, "one-approved");
  assert.throws(() => storyExport.createPortableBookArchive(result), /approved image reference|Complete/i);
});

test("rejects incomplete books without silently omitting pages", () => {
  const result = storyExport.prepareStoryExport(project([page("one", 1), page("two", 2, { approved: false })]));
  assert.equal(result.ready, false);
  assert.equal(result.totalPages, 2);
  assert.equal(result.approvedIllustrations, 1);
  assert.deepEqual(result.incompletePages.map((item) => item.pageId), ["two"]);
  assert.equal(result.incompletePages[0].issueKind, "missing_approved_version");
  assert.equal(result.manifest, null);
});

test("classifies unfinished pages separately from approved assets that cannot be exported", () => {
  const unfinished = page("one", 1, { pageStatus: "draft" });
  const result = storyExport.prepareStoryExport(project([unfinished]));
  assert.equal(result.ready, false);
  assert.equal(result.incompletePages[0].issueKind, "incomplete_page");
});

test("rejects cross-page approved image references", () => {
  const crossed = page("one", 1);
  crossed.creation.imageVersions[0].pageId = "another-page";
  const result = storyExport.prepareStoryExport(project([crossed]));
  assert.equal(result.ready, false);
  assert.match(result.incompletePages[0].issue, /another page/);
});

test("never leaks a selected but unapproved version", () => {
  const unapproved = page("one", 1, { approved: false });
  const result = storyExport.prepareApprovedPageExport(project([unapproved]), "one");
  assert.equal(result.ready, false);
  assert.equal(result.asset, null);
});

test("reopened pages invalidate complete-book export", () => {
  const reopened = page("one", 1);
  reopened.creation.approvedImageVersionId = null;
  reopened.creation.illustrationApprovedAt = null;
  const result = storyExport.prepareStoryExport(project([reopened]));
  assert.equal(result.ready, false);
  assert.match(result.incompletePages[0].issue, /approval required/i);
});

test("maps every approved page to a distinct archive asset", () => {
  const result = storyExport.prepareStoryExport(project([page("one", 1), page("two", 2), page("three", 3)]));
  assert.deepEqual(result.assets.map((asset) => asset.archivePath), ["pages/page-01.svg", "pages/page-02.svg", "pages/page-03.svg"]);
  assert.equal(new Set(result.assets.map((asset) => asset.imageVersionId)).size, 3);
});

test("builds a valid single-page portable package structure", () => {
  const archive = storyExport.createPortableBookArchive(storyExport.prepareStoryExport(project([page("one", 1)]), "now"));
  const entries = unzipStored(archive.bytes);
  assert.deepEqual([...entries.keys()], ["index.html", "manifest.json", "pages/page-01.svg"]);
  assert.equal(archive.filename, "d-day-the-longest-day-visual-book.zip");
  assert.equal(JSON.parse(new TextDecoder().decode(entries.get("manifest.json"))).pageCount, 1);
});

test("builds a multi-page package using local offline-player references", () => {
  const archive = storyExport.createPortableBookArchive(storyExport.prepareStoryExport(project([page("one", 1), page("two", 2)]), "now"));
  const entries = unzipStored(archive.bytes);
  const html = new TextDecoder().decode(entries.get("index.html"));
  assert.equal(entries.size, 4);
  assert.match(html, /pages\/page-01\.svg/);
  assert.match(html, /pages\/page-02\.svg/);
  assert.doesNotMatch(html, /https?:\/\//);
});

test("escapes user text in the offline player and never uses innerHTML", () => {
  const hostile = "</script><script>alert('no')</script>";
  const result = storyExport.prepareStoryExport(project([page("one", 1, { title: hostile, narration: hostile, dialogue: hostile })], { title: hostile, synopsis: hostile }), "now");
  const html = storyExport.createOfflinePlayerHtml(result.manifest);
  assert.doesNotMatch(html, /<script>alert\('no'\)<\/script>/);
  assert.match(html, /\\u003c\/script\\u003e/);
  assert.doesNotMatch(html, /innerHTML/);
  assert.match(html, /textContent/);
});

test("accepts same-document gradient and filter references with valid targets", () => {
  const safe = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><filter id="blur"><feGaussianBlur stdDeviation="2"/></filter></defs><rect width="20" height="20" fill="url(#bg)" filter="url('#blur')"/></svg>`;
  const decoded = storyExport.decodeExportImage(`data:image/svg+xml,${encodeURIComponent(safe)}`);
  assert.equal(decoded.mimeType, "image/svg+xml");
  assert.match(new TextDecoder().decode(decoded.bytes), /url\(#bg\)/);
});

test("rejects external HTTP and HTTPS SVG resources, including fragment URLs", () => {
  for (const resource of [
    '<image href="http://example.com/a.png"/>',
    '<image href="https://example.com/a.png"/>',
    '<rect width="10" height="10" fill="url(https://example.com/palette.svg#bg)"/>',
  ]) {
    const external = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg">${resource}</svg>`)}`;
    assert.throws(() => storyExport.decodeExportImage(external), /active\/external/);
  }
});

test("rejects javascript, data resources, scripts, and event handlers in SVG", () => {
  const unsafeMarkup = [
    '<image href="javascript:alert(1)"/>',
    '<image href="data:image/png;base64,AAAA"/>',
    '<script>alert(1)</script>',
    '<rect width="10" height="10" onload="alert(1)"/>',
  ];
  for (const markup of unsafeMarkup) {
    const source = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)}`;
    assert.throws(() => storyExport.decodeExportImage(source), /active\/external/);
  }
});

test("rejects external stylesheets, imports, malformed SVG, and unresolved local references", () => {
  const unsafeDocuments = [
    '<?xml-stylesheet href="https://example.com/theme.css"?><svg xmlns="http://www.w3.org/2000/svg"></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://example.com/theme.css);</style></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><g></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="url(#missing)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="paint"/></defs><rect width="10" height="10" filter="url(#paint)"/></svg>',
  ];
  for (const svg of unsafeDocuments) {
    assert.throws(
      () => storyExport.decodeExportImage(`data:image/svg+xml,${encodeURIComponent(svg)}`),
      /active\/external/,
    );
  }
});

test("rejects raster data whose bytes do not match its declared image type", () => {
  const fakePng = `data:image/png;base64,${btoa("not a png")}`;
  assert.throws(() => storyExport.decodeExportImage(fakePng), /PNG payload is malformed/);
});

test("manifest excludes chat, browser storage, prompts, and secret-like project metadata", () => {
  const result = storyExport.prepareStoryExport(project([page("one", 1)]), "now");
  const json = JSON.stringify(result.manifest);
  assert.doesNotMatch(json, /PRIVATE CHAT TOKEN/);
  assert.doesNotMatch(json, /localStorage|chatHistory|prompt|visualSeed/);
});

test("ZIP writer prevents traversal paths", () => {
  assert.throws(() => zip.createStoreZip([{ path: "../secret.txt", data: "no" }]), /Unsafe ZIP entry/);
  assert.throws(() => zip.createStoreZip([{ path: "/absolute.txt", data: "no" }]), /Unsafe ZIP entry/);
});
