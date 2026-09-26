import { assembleVisualStory, DEFAULT_PAGE_DURATION_SECONDS, normalizePageDuration } from "@/lib/story-assembly";
import { createStoreZip } from "@/lib/zip";
import type { PageAspectRatio, Project, VisualOutputType } from "@/types/domain";

export const STORY_EXPORT_SCHEMA_VERSION = 1;

export type ExportImageMimeType = "image/svg+xml" | "image/png" | "image/jpeg" | "image/webp";

export interface VisualBookManifestPage {
  pageId: string;
  pageNumber: number;
  title: string;
  approvedImageVersionId: string;
  illustrationAssetPath: string;
  aspectRatio: PageAspectRatio;
  narration: string;
  dialogue: string;
  durationSeconds: number;
}

export interface VisualBookManifest {
  schemaVersion: 1;
  projectTitle: string;
  storySynopsis: string;
  outputFormat: VisualOutputType | null;
  exportedAt: string;
  pageCount: number;
  defaultPageDurationSeconds: number;
  pages: VisualBookManifestPage[];
}

export interface StoryExportAsset {
  pageId: string;
  pageNumber: number;
  imageVersionId: string;
  sourceUrl: string;
  mimeType: ExportImageMimeType;
  extension: "svg" | "png" | "jpg" | "webp";
  archivePath: string;
  downloadFilename: string;
}

export interface IncompleteExportPage {
  pageId: string;
  pageNumber: number;
  title: string;
  issueKind: ExportIssueKind;
  issue: string;
}

export type ExportIssueKind =
  | "incomplete_page"
  | "missing_approved_version"
  | "invalid_approved_asset";

export interface StoryExportPlan {
  ready: boolean;
  issues: string[];
  incompletePages: IncompleteExportPage[];
  approvedIllustrations: number;
  totalPages: number;
  archiveFilename: string;
  manifest: VisualBookManifest | null;
  assets: StoryExportAsset[];
}

export interface ApprovedPageExport {
  ready: boolean;
  issueKind: ExportIssueKind | null;
  issue: string | null;
  asset: StoryExportAsset | null;
}

export interface PortableBookArchive {
  filename: string;
  bytes: Uint8Array;
  manifest: VisualBookManifest;
  entries: string[];
}

const MIME_FORMATS: Record<ExportImageMimeType, StoryExportAsset["extension"]> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function normalizeMimeType(value: string): ExportImageMimeType | null {
  const normalized = value.toLowerCase() === "image/jpg" ? "image/jpeg" : value.toLowerCase();
  return normalized in MIME_FORMATS ? normalized as ExportImageMimeType : null;
}

function parseDataImageUrl(sourceUrl: string) {
  const match = /^data:([^;,]+)(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/i.exec(sourceUrl);
  if (!match) return null;
  const mimeType = normalizeMimeType(match[1]);
  if (!mimeType) return null;
  return { mimeType, base64: Boolean(match[2]), payload: match[3] };
}

function decodeBase64(payload: string) {
  const binary = atob(payload.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

const SAFE_SVG_ELEMENTS = new Set([
  "svg",
  "defs",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "lineargradient",
  "radialgradient",
  "stop",
  "filter",
  "fegaussianblur",
  "clippath",
  "mask",
]);

const SAFE_SVG_ATTRIBUTES = new Set([
  "xmlns",
  "id",
  "viewbox",
  "preserveaspectratio",
  "role",
  "aria-label",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "opacity",
  "transform",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "offset",
  "stop-color",
  "stop-opacity",
  "stddeviation",
  "filter",
  "clip-path",
  "mask",
]);

const LOCAL_REFERENCE_TARGETS: Record<string, ReadonlySet<string>> = {
  fill: new Set(["lineargradient", "radialgradient"]),
  stroke: new Set(["lineargradient", "radialgradient"]),
  filter: new Set(["filter"]),
  "clip-path": new Set(["clippath"]),
  mask: new Set(["mask"]),
};

const LOCAL_REFERENCE_PATTERN = /^url\(\s*(["']?)(#[A-Za-z_][A-Za-z0-9_.:-]*)\1\s*\)$/i;

function invalidSvg(): never {
  throw new Error("The approved SVG is malformed or contains unsupported active/external content.");
}

function findSvgTagEnd(svg: string, start: number) {
  let quote = "";
  for (let index = start; index < svg.length; index += 1) {
    const character = svg[index];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return -1;
}

function parseSvgAttributes(
  source: string,
  ids: Map<string, string>,
  references: Array<{ attribute: string; id: string }>,
) {
  let cursor = 0;
  const names = new Set<string>();
  while (cursor < source.length) {
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;
    if (cursor >= source.length) break;

    const nameMatch = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(source.slice(cursor));
    if (!nameMatch) invalidSvg();
    const originalName = nameMatch[0];
    const name = originalName.toLowerCase();
    cursor += originalName.length;
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;
    if (source[cursor] !== "=") invalidSvg();
    cursor += 1;
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;
    const quote = source[cursor];
    if (quote !== '"' && quote !== "'") invalidSvg();
    const valueStart = cursor + 1;
    const valueEnd = source.indexOf(quote, valueStart);
    if (valueEnd < 0) invalidSvg();
    const value = source.slice(valueStart, valueEnd);
    cursor = valueEnd + 1;

    if (
      names.has(name) ||
      name.startsWith("on") ||
      name === "style" ||
      name === "href" ||
      name === "xlink:href" ||
      name === "src" ||
      !SAFE_SVG_ATTRIBUTES.has(name) ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\\]/.test(value)
    ) {
      invalidSvg();
    }
    names.add(name);

    if (name === "xmlns") {
      if (value !== "http://www.w3.org/2000/svg") invalidSvg();
      continue;
    }

    if (name === "id") {
      if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(value) || ids.has(value)) invalidSvg();
      ids.set(value, "");
      continue;
    }

    const localReference = LOCAL_REFERENCE_PATTERN.exec(value);
    if (localReference) {
      if (!LOCAL_REFERENCE_TARGETS[name]) invalidSvg();
      references.push({ attribute: name, id: localReference[2].slice(1) });
      continue;
    }

    if (
      /url\s*\(/i.test(value) ||
      /@import\b|expression\s*\(|javascript\s*:|data\s*:|https?\s*:|\/\//i.test(value)
    ) {
      invalidSvg();
    }
  }
}

function assertSafeSvg(svg: string) {
  if (!svg.trim() || /<!|<\?|@import\b/i.test(svg)) invalidSvg();

  const ids = new Map<string, string>();
  const references: Array<{ attribute: string; id: string }> = [];
  const stack: string[] = [];
  let cursor = 0;
  let rootSeen = false;
  let rootClosed = false;

  while (cursor < svg.length) {
    const tagStart = svg.indexOf("<", cursor);
    const text = svg.slice(cursor, tagStart < 0 ? svg.length : tagStart);
    if (!stack.length && text.trim()) invalidSvg();
    if (tagStart < 0) break;

    const tagEnd = findSvgTagEnd(svg, tagStart + 1);
    if (tagEnd < 0) invalidSvg();
    const rawTag = svg.slice(tagStart + 1, tagEnd).trim();
    if (!rawTag || rawTag.startsWith("!") || rawTag.startsWith("?")) invalidSvg();

    if (rawTag.startsWith("/")) {
      const closingMatch = /^\/\s*([A-Za-z][A-Za-z0-9_.:-]*)\s*$/.exec(rawTag);
      if (!closingMatch || stack.pop() !== closingMatch[1]) invalidSvg();
      if (!stack.length) rootClosed = true;
      cursor = tagEnd + 1;
      continue;
    }

    if (rootClosed) invalidSvg();
    const selfClosing = /\/\s*$/.test(rawTag);
    const opening = selfClosing ? rawTag.replace(/\/\s*$/, "").trimEnd() : rawTag;
    const elementMatch = /^([A-Za-z][A-Za-z0-9_.:-]*)([\s\S]*)$/.exec(opening);
    if (!elementMatch) invalidSvg();
    const elementName = elementMatch[1];
    const normalizedElementName = elementName.toLowerCase();
    if (!SAFE_SVG_ELEMENTS.has(normalizedElementName)) invalidSvg();
    if (!rootSeen) {
      if (normalizedElementName !== "svg") invalidSvg();
      rootSeen = true;
    } else if (!stack.length) {
      invalidSvg();
    }

    const idsBefore = new Set(ids.keys());
    parseSvgAttributes(elementMatch[2], ids, references);
    for (const id of ids.keys()) {
      if (!idsBefore.has(id) && ids.get(id) === "") ids.set(id, normalizedElementName);
    }

    if (!selfClosing) stack.push(elementName);
    else if (normalizedElementName === "svg") rootClosed = true;
    cursor = tagEnd + 1;
  }

  if (!rootSeen || !rootClosed || stack.length) invalidSvg();
  for (const reference of references) {
    const targetElement = ids.get(reference.id);
    if (!targetElement || !LOCAL_REFERENCE_TARGETS[reference.attribute].has(targetElement)) invalidSvg();
  }
}

function assertRasterSignature(mimeType: ExportImageMimeType, bytes: Uint8Array) {
  const valid = mimeType === "image/png"
    ? bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
    : mimeType === "image/jpeg"
      ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : mimeType === "image/webp"
        ? bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
        : true;
  if (!valid) throw new Error(`The approved ${mimeType.replace("image/", "").toUpperCase()} payload is malformed.`);
}

export function decodeExportImage(sourceUrl: string) {
  const parsed = parseDataImageUrl(sourceUrl);
  if (!parsed) {
    throw new Error("Only embedded SVG, PNG, JPEG, and WebP approved artwork can be exported in this prototype.");
  }
  let bytes: Uint8Array;
  try {
    bytes = parsed.base64
      ? decodeBase64(parsed.payload)
      : new TextEncoder().encode(decodeURIComponent(parsed.payload));
  } catch {
    throw new Error("The approved illustration data could not be decoded.");
  }
  if (!bytes.length) throw new Error("The approved illustration is empty.");
  if (parsed.mimeType === "image/svg+xml") assertSafeSvg(new TextDecoder().decode(bytes));
  else assertRasterSignature(parsed.mimeType, bytes);
  return { mimeType: parsed.mimeType, extension: MIME_FORMATS[parsed.mimeType], bytes };
}

export function sanitizeExportFilename(value: string, fallback = "vizzy-story") {
  const sanitized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return sanitized || fallback;
}

function createAsset(
  project: Project,
  pageId: string,
  pageNumber: number,
  imageVersionId: string,
  sourceUrl: string,
  totalPages: number,
) {
  const decoded = decodeExportImage(sourceUrl);
  const pageToken = String(pageNumber).padStart(Math.max(2, String(totalPages).length), "0");
  const baseName = sanitizeExportFilename(project.title);
  return {
    pageId,
    pageNumber,
    imageVersionId,
    sourceUrl,
    mimeType: decoded.mimeType,
    extension: decoded.extension,
    archivePath: `pages/page-${pageToken}.${decoded.extension}`,
    downloadFilename: `${baseName}-page-${pageToken}.${decoded.extension}`,
  } satisfies StoryExportAsset;
}

export function prepareApprovedPageExport(project: Project, pageId: string): ApprovedPageExport {
  const plan = project.storyPlan;
  const page = plan?.pageBeats.find((candidate) => candidate.id === pageId);
  if (!plan || plan.status !== "approved") return { ready: false, issueKind: "incomplete_page", issue: "Approve the story plan before exporting artwork.", asset: null };
  if (!page || page.status !== "approved") return { ready: false, issueKind: "incomplete_page", issue: "This page is not part of the approved story plan.", asset: null };
  const approvedId = page.creation.approvedImageVersionId;
  const version = approvedId ? page.creation.imageVersions.find((candidate) => candidate.id === approvedId) : null;
  if (!approvedId) return { ready: false, issueKind: "missing_approved_version", issue: "Approve an illustration for this page before downloading it.", asset: null };
  if (!version) return { ready: false, issueKind: "missing_approved_version", issue: "The approved image version is missing.", asset: null };
  if (version.pageId !== page.id) return { ready: false, issueKind: "invalid_approved_asset", issue: "The approved image version belongs to another page.", asset: null };
  try {
    return {
      ready: true,
      issueKind: null,
      issue: null,
      asset: createAsset(project, page.id, page.order, version.id, version.imageUrl, plan.pageBeats.length),
    };
  } catch (error) {
    return { ready: false, issueKind: "invalid_approved_asset", issue: error instanceof Error ? error.message : "The approved illustration is not exportable.", asset: null };
  }
}

export function prepareStoryExport(
  project: Project,
  exportedAt = new Date().toISOString(),
  defaultDurationSeconds = DEFAULT_PAGE_DURATION_SECONDS,
): StoryExportPlan {
  const assembly = assembleVisualStory(project);
  const plan = project.storyPlan;
  const totalPages = plan?.pageBeats.length ?? 0;
  const incompletePages: IncompleteExportPage[] = [];
  const assets: StoryExportAsset[] = [];
  const issues = [...assembly.issues];

  if (plan) {
    const ordered = [...plan.pageBeats].sort((left, right) => left.order - right.order);
    for (const page of ordered) {
      const assembled = assembly.pages.find((candidate) => candidate.pageId === page.id);
      if (!assembled?.complete || !assembled.approvedVersion) {
        const issueKind: ExportIssueKind = page.status !== "approved" || plan.status !== "approved"
          ? "incomplete_page"
          : !page.creation.approvedImageVersionId || !page.creation.imageVersions.some((version) => version.id === page.creation.approvedImageVersionId)
            ? "missing_approved_version"
            : "invalid_approved_asset";
        incompletePages.push({
          pageId: page.id,
          pageNumber: page.order,
          title: page.title,
          issueKind,
          issue: assembled?.issue ?? (plan.status === "approved" ? "Approved illustration required." : "Story plan approval required."),
        });
        continue;
      }
      try {
        assets.push(createAsset(project, page.id, page.order, assembled.approvedVersion.id, assembled.approvedVersion.imageUrl, totalPages));
      } catch (error) {
        const issue = error instanceof Error ? error.message : "The approved illustration is not exportable.";
        incompletePages.push({ pageId: page.id, pageNumber: page.order, title: page.title, issueKind: "invalid_approved_asset", issue });
        issues.push(`Page ${page.order}: ${issue}`);
      }
    }
  }

  const ready = assembly.ready && assets.length === totalPages && incompletePages.length === 0;
  const durationSeconds = normalizePageDuration(defaultDurationSeconds);
  const manifest: VisualBookManifest | null = ready && plan
    ? {
        schemaVersion: STORY_EXPORT_SCHEMA_VERSION,
        projectTitle: project.title,
        storySynopsis: plan.synopsis,
        outputFormat: project.outputType,
        exportedAt,
        pageCount: totalPages,
        defaultPageDurationSeconds: durationSeconds,
        pages: assembly.readerPages.map((page) => {
          const asset = assets.find((candidate) => candidate.pageId === page.pageId);
          if (!asset) throw new Error(`Export asset missing for page ${page.pageNumber}.`);
          return {
            pageId: page.pageId,
            pageNumber: page.pageNumber,
            title: page.title,
            approvedImageVersionId: page.imageVersionId,
            illustrationAssetPath: asset.archivePath,
            aspectRatio: page.aspectRatio,
            narration: page.narration,
            dialogue: page.dialogue,
            durationSeconds,
          };
        }),
      }
    : null;

  return {
    ready,
    issues,
    incompletePages,
    approvedIllustrations: assets.length,
    totalPages,
    archiveFilename: `${sanitizeExportFilename(project.title)}-visual-book.zip`,
    manifest,
    assets,
  };
}

function safeJsonForScript(value: unknown) {
  return JSON.stringify(value)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function createOfflinePlayerHtml(manifest: VisualBookManifest) {
  const bookJson = safeJsonForScript(manifest);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${sanitizeExportFilename(manifest.projectTitle, "Vizzy visual book")}</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#10110f;color:#f8f4ec}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#10110f}.app{min-height:100vh;display:flex;flex-direction:column}.top{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:14px 24px;border-bottom:1px solid #ffffff18}.eyebrow{margin:0;color:#b5ba8a;font-size:10px;text-transform:uppercase;letter-spacing:.18em;font-weight:800}h1{font-family:Georgia,serif;font-size:21px;margin:4px 0 0}.stage{position:relative;flex:1;min-height:360px;background:#090a08;display:grid;place-items:center;overflow:hidden}.stage img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.badge{position:absolute;top:16px;left:16px;background:#000b;border-radius:999px;padding:7px 12px;font-size:11px}.caption{position:absolute;left:16px;right:16px;bottom:16px;max-width:760px;margin:auto;background:#000c;border:1px solid #ffffff1c;border-radius:16px;padding:14px;text-align:center;backdrop-filter:blur(10px)}.caption p{margin:0;line-height:1.5}.caption .narration{font-family:Georgia,serif;font-size:16px}.caption .dialogue{margin-top:6px;color:#ffffffbd;font-size:13px}.controls{padding:14px 24px 18px;background:#171815;border-top:1px solid #ffffff18}.progress{height:4px;background:#ffffff17;border-radius:99px;overflow:hidden;margin-bottom:14px}.progress span{display:block;height:100%;background:#b5ba8a;transition:width .2s}.row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.title{font-size:13px;font-weight:700;max-width:260px}.buttons{display:flex;gap:7px;flex-wrap:wrap}button,input{font:inherit}button{border:1px solid #ffffff24;border-radius:9px;background:transparent;color:#fff;padding:8px 11px;font-size:11px;font-weight:700;cursor:pointer}button.primary{background:#f6f1e8;color:#20211f;border-color:#f6f1e8}button:disabled{opacity:.35;cursor:not-allowed}.settings{display:flex;gap:12px;align-items:center;font-size:11px;color:#ffffffa8}.settings label{display:flex;gap:6px;align-items:center}.settings input[type=number]{width:58px;border:1px solid #ffffff24;border-radius:7px;background:#ffffff0c;color:#fff;padding:6px}.empty{padding:40px;text-align:center}@media(max-width:600px){.top,.controls{padding-left:12px;padding-right:12px}.stage{min-height:430px}.row{align-items:flex-start}.title{width:100%;max-width:none}.caption{left:8px;right:8px;bottom:8px}.buttons{order:3;width:100%}button{flex:1}}
</style>
</head>
<body>
<main class="app">
  <header class="top"><div><p class="eyebrow">Vizzy offline visual book</p><h1 id="bookTitle"></h1></div><span id="counter"></span></header>
  <section class="stage" id="stage"><img id="art" alt=""><span class="badge" id="badge"></span><div class="caption" id="caption"><p class="narration" id="narration"></p><p class="dialogue" id="dialogue"></p></div></section>
  <footer class="controls"><div class="progress"><span id="progress"></span></div><div class="row"><div class="title" id="pageTitle"></div><div class="buttons"><button id="restart">Restart</button><button id="previous">Previous</button><button class="primary" id="play">Play</button><button id="next">Next</button></div><div class="settings"><label>Seconds <input id="duration" type="number" min="2" max="30"></label><label><input id="loop" type="checkbox"> Loop</label></div></div></footer>
</main>
<script>
"use strict";
const book=${bookJson};
let index=0,timer=null,playing=false;
const byId=(id)=>document.getElementById(id);
const art=byId("art"),play=byId("play"),duration=byId("duration"),loop=byId("loop");
byId("bookTitle").textContent=book.projectTitle;
duration.value=String(book.defaultPageDurationSeconds);
function stop(){if(timer)window.clearTimeout(timer);timer=null;playing=false;play.textContent="Play"}
function schedule(){if(!playing)return;if(timer)window.clearTimeout(timer);timer=window.setTimeout(()=>{if(index>=book.pages.length-1){if(loop.checked){index=0;render()}else stop()}else{index+=1;render()}},Math.max(2,Math.min(30,Number(duration.value)||5))*1000)}
function render(){const page=book.pages[index];if(!page){byId("stage").textContent="No pages were exported.";return}art.src=page.illustrationAssetPath;art.alt="Approved illustration for page "+page.pageNumber+": "+page.title;byId("badge").textContent="Page "+page.pageNumber;byId("counter").textContent=(index+1)+" of "+book.pages.length;byId("pageTitle").textContent=page.title;byId("narration").textContent=page.narration;byId("dialogue").textContent=page.dialogue?"“"+page.dialogue+"”":"";byId("caption").hidden=!(page.narration||page.dialogue);byId("progress").style.width=((index+1)/book.pages.length*100)+"%";byId("previous").disabled=index===0;byId("next").disabled=index===book.pages.length-1&&!loop.checked;schedule()}
play.addEventListener("click",()=>{playing=!playing;play.textContent=playing?"Pause":"Play";schedule()});
byId("previous").addEventListener("click",()=>{index=Math.max(0,index-1);render()});
byId("next").addEventListener("click",()=>{index=index<book.pages.length-1?index+1:(loop.checked?0:index);render()});
byId("restart").addEventListener("click",()=>{stop();index=0;render()});
duration.addEventListener("change",()=>{duration.value=String(Math.max(2,Math.min(30,Number(duration.value)||5)));schedule()});
loop.addEventListener("change",render);
window.addEventListener("keydown",(event)=>{if(event.target&&["INPUT","TEXTAREA","SELECT"].includes(event.target.tagName))return;if(event.key===" "){event.preventDefault();play.click()}else if(event.key==="ArrowLeft")byId("previous").click();else if(event.key==="ArrowRight")byId("next").click()});
render();
</script>
</body>
</html>`;
}

export function createPortableBookArchive(plan: StoryExportPlan): PortableBookArchive {
  if (!plan.ready || !plan.manifest) {
    const incomplete = plan.incompletePages[0];
    throw new Error(
      incomplete
        ? `Page ${incomplete.pageNumber} cannot be exported: ${incomplete.issue}`
        : plan.issues[0] ?? "Complete and approve every page before exporting the visual book.",
    );
  }
  const entries = [
    { path: "index.html", data: createOfflinePlayerHtml(plan.manifest) },
    { path: "manifest.json", data: JSON.stringify(plan.manifest, null, 2) },
    ...plan.assets.map((asset) => {
      const decoded = decodeExportImage(asset.sourceUrl);
      if (decoded.mimeType !== asset.mimeType) throw new Error(`Asset type changed for page ${asset.pageNumber}.`);
      return { path: asset.archivePath, data: decoded.bytes };
    }),
  ];
  return {
    filename: plan.archiveFilename,
    bytes: createStoreZip(entries),
    manifest: plan.manifest,
    entries: entries.map((entry) => entry.path),
  };
}
