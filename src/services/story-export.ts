import {
  createPortableBookArchive,
  decodeExportImage,
  prepareApprovedPageExport,
  prepareStoryExport,
  sanitizeExportFilename,
  type StoryExportPlan,
  type VisualBookManifestPage,
} from "@/lib/story-export";
import type { Project } from "@/types/domain";

export type VideoExportStatus = "idle" | "preparing" | "recording" | "finalizing" | "completed" | "failed" | "cancelled";

export interface VideoExportProgress {
  status: "preparing" | "recording" | "finalizing";
  currentPage: number;
  totalPages: number;
  progress: number;
}

export interface WebMExportSupport {
  supported: boolean;
  mimeType: string | null;
  reason: string | null;
}

const WEBM_MIME_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

function bytesToArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function chooseSupportedWebMMimeType(isTypeSupported: (mimeType: string) => boolean) {
  return WEBM_MIME_TYPES.find((mimeType) => isTypeSupported(mimeType)) ?? null;
}

export function calculateVideoProgress(
  status: VideoExportProgress["status"],
  currentPage: number,
  totalPages: number,
) {
  const pageProgress = totalPages > 0 ? Math.min(1, Math.max(0, currentPage / totalPages)) : 0;
  if (status === "preparing") return Math.round(pageProgress * 10);
  if (status === "recording") return 10 + Math.round(pageProgress * 85);
  return 98;
}

export function getWebMExportSupport(): WebMExportSupport {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return { supported: false, mimeType: null, reason: "This browser does not expose MediaRecorder." };
  }
  if (typeof HTMLCanvasElement === "undefined" || typeof HTMLCanvasElement.prototype.captureStream !== "function") {
    return { supported: false, mimeType: null, reason: "This browser cannot record a canvas stream." };
  }
  const mimeType = chooseSupportedWebMMimeType((candidate) => MediaRecorder.isTypeSupported(candidate));
  return mimeType
    ? { supported: true, mimeType, reason: null }
    : { supported: false, mimeType: null, reason: "This browser does not advertise a supported WebM codec." };
}

export function saveBrowserDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function downloadApprovedIllustration(project: Project, pageId: string) {
  const prepared = prepareApprovedPageExport(project, pageId);
  if (!prepared.ready || !prepared.asset) throw new Error(prepared.issue ?? "The approved page could not be exported.");
  const decoded = decodeExportImage(prepared.asset.sourceUrl);
  const blob = new Blob([bytesToArrayBuffer(decoded.bytes)], { type: decoded.mimeType });
  saveBrowserDownload(blob, prepared.asset.downloadFilename);
  return { filename: prepared.asset.downloadFilename, byteLength: decoded.bytes.length };
}

export function downloadPortableVisualBook(project: Project) {
  const exportPlan = prepareStoryExport(project);
  const archive = createPortableBookArchive(exportPlan);
  const blob = new Blob([bytesToArrayBuffer(archive.bytes)], { type: "application/zip" });
  saveBrowserDownload(blob, archive.filename);
  return { filename: archive.filename, byteLength: archive.bytes.length, manifest: archive.manifest };
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error("Video export was cancelled.");
    error.name = "AbortError";
    throw error;
  }
}

function waitForDuration(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    const handleAbort = () => {
      window.clearTimeout(timer);
      const error = new Error("Video export was cancelled.");
      error.name = "AbortError";
      reject(error);
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function loadImage(sourceUrl: string, signal?: AbortSignal) {
  return new Promise<{ image: HTMLImageElement; objectUrl: string }>((resolve, reject) => {
    try {
      throwIfCancelled(signal);
      const decoded = decodeExportImage(sourceUrl);
      const objectUrl = URL.createObjectURL(new Blob([bytesToArrayBuffer(decoded.bytes)], { type: decoded.mimeType }));
      const image = new Image();
      const cleanup = () => signal?.removeEventListener("abort", handleAbort);
      const handleAbort = () => {
        image.src = "";
        cleanup();
        URL.revokeObjectURL(objectUrl);
        const error = new Error("Video export was cancelled.");
        error.name = "AbortError";
        reject(error);
      };
      image.onload = () => { cleanup(); resolve({ image, objectUrl }); };
      image.onerror = () => { cleanup(); URL.revokeObjectURL(objectUrl); reject(new Error("An approved illustration could not be drawn for video export.")); };
      signal?.addEventListener("abort", handleAbort, { once: true });
      image.src = objectUrl;
    } catch (error) {
      reject(error);
    }
  });
}

function wrapCanvasText(context: CanvasRenderingContext2D, value: string, maxWidth: number, maxLines: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function drawVideoPage(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  page: VisualBookManifestPage,
) {
  const artHeight = 540;
  context.fillStyle = "#10110f";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / image.naturalWidth, artHeight / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (canvas.width - width) / 2, (artHeight - height) / 2, width, height);
  context.fillStyle = "#171815";
  context.fillRect(0, artHeight, canvas.width, canvas.height - artHeight);
  context.fillStyle = "#b5ba8a";
  context.font = "700 18px system-ui, sans-serif";
  context.fillText(`PAGE ${page.pageNumber}`, 48, 578);
  context.fillStyle = "#f8f4ec";
  context.font = "700 28px Georgia, serif";
  context.fillText(page.title.slice(0, 72), 48, 618);
  context.font = "20px Georgia, serif";
  const narrationLines = wrapCanvasText(context, page.narration, canvas.width - 96, 2);
  narrationLines.forEach((line, index) => context.fillText(line, 48, 653 + index * 27));
  if (page.dialogue) {
    context.fillStyle = "#c9c7c0";
    context.font = "17px system-ui, sans-serif";
    context.fillText(`“${page.dialogue.slice(0, 120)}”`, 48, 706);
  }
}

async function holdVideoPage(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  page: VisualBookManifestPage,
  signal?: AbortSignal,
) {
  drawVideoPage(context, canvas, image, page);
  const frameRefresh = window.setInterval(
    () => drawVideoPage(context, canvas, image, page),
    250,
  );
  try {
    await waitForDuration(page.durationSeconds * 1000, signal);
  } finally {
    window.clearInterval(frameRefresh);
  }
}

export async function recordVisualStoryWebM(
  exportPlan: StoryExportPlan,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: VideoExportProgress) => void;
  } = {},
) {
  if (!exportPlan.ready || !exportPlan.manifest) throw new Error("Complete and approve every page before exporting video.");
  const support = getWebMExportSupport();
  if (!support.supported || !support.mimeType) throw new Error(support.reason ?? "WebM export is unavailable.");
  const manifest = {
    ...exportPlan.manifest,
    pages: exportPlan.manifest.pages.map((page) => ({ ...page })),
  };
  const assets = exportPlan.assets.map((asset) => ({ ...asset }));
  const loaded: Array<{ image: HTMLImageElement; objectUrl: string }> = [];
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;

  try {
    for (let index = 0; index < assets.length; index += 1) {
      throwIfCancelled(options.signal);
      options.onProgress?.({ status: "preparing", currentPage: index + 1, totalPages: assets.length, progress: calculateVideoProgress("preparing", index + 1, assets.length) });
      loaded.push(await loadImage(assets[index].sourceUrl, options.signal));
    }

    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("A canvas context could not be created for video export.");
    stream = canvas.captureStream(30);
    const chunks: Blob[] = [];
    recorder = new MediaRecorder(stream, { mimeType: support.mimeType, videoBitsPerSecond: 4_000_000 });
    const stopped = new Promise<void>((resolve, reject) => {
      if (!recorder) return reject(new Error("Video recorder initialization failed."));
      recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunks.push(event.data); });
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.addEventListener("error", () => reject(new Error("The browser video recorder failed.")), { once: true });
    });

    drawVideoPage(context, canvas, loaded[0].image, manifest.pages[0]);
    recorder.start();
    for (let index = 0; index < manifest.pages.length; index += 1) {
      throwIfCancelled(options.signal);
      const page = manifest.pages[index];
      options.onProgress?.({
        status: "recording",
        currentPage: index + 1,
        totalPages: manifest.pages.length,
        progress: calculateVideoProgress("recording", index + 1, manifest.pages.length),
      });
      await holdVideoPage(context, canvas, loaded[index].image, page, options.signal);
    }
    options.onProgress?.({ status: "finalizing", currentPage: manifest.pages.length, totalPages: manifest.pages.length, progress: calculateVideoProgress("finalizing", manifest.pages.length, manifest.pages.length) });
    recorder.stop();
    await stopped;
    throwIfCancelled(options.signal);
    const blob = new Blob(chunks, { type: support.mimeType });
    if (!blob.size) throw new Error("The browser completed recording without producing video data.");
    return {
      blob,
      filename: `${sanitizeExportFilename(manifest.projectTitle)}-slideshow.webm`,
      mimeType: support.mimeType,
      pageCount: manifest.pages.length,
    };
  } finally {
    if (recorder?.state === "recording") recorder.stop();
    stream?.getTracks().forEach((track) => track.stop());
    loaded.forEach(({ objectUrl }) => URL.revokeObjectURL(objectUrl));
  }
}

export async function downloadVisualStoryWebM(
  project: Project,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: VideoExportProgress) => void;
  } = {},
) {
  const result = await recordVisualStoryWebM(prepareStoryExport(project), options);
  saveBrowserDownload(result.blob, result.filename);
  return result;
}
