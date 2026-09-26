"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { prepareStoryExport } from "@/lib/story-export";
import {
  downloadApprovedIllustration,
  downloadPortableVisualBook,
  downloadVisualStoryWebM,
  getWebMExportSupport,
  type VideoExportProgress,
  type VideoExportStatus,
  type WebMExportSupport,
} from "@/services/story-export";
import type { Project } from "@/types/domain";

interface VisualBookExportPanelProps {
  project: Project;
  currentPageId: string | null;
  onOpenPage: (pageId: string) => void;
}

const SERVER_VIDEO_SUPPORT: WebMExportSupport = {
  supported: false,
  mimeType: null,
  reason: "Checking browser video support...",
};
let cachedVideoSupport: WebMExportSupport | null = null;
const subscribeToBrowserSupport = () => () => undefined;
const getServerVideoSupport = () => SERVER_VIDEO_SUPPORT;
const getBrowserVideoSupport = () => {
  cachedVideoSupport ??= getWebMExportSupport();
  return cachedVideoSupport;
};

export function VisualBookExportPanel({ project, currentPageId, onOpenPage }: VisualBookExportPanelProps) {
  const exportPlan = useMemo(() => prepareStoryExport(project), [project]);
  const invalidAssetCount = exportPlan.incompletePages.filter(
    (page) => page.issueKind === "invalid_approved_asset",
  ).length;
  const videoSupport = useSyncExternalStore(
    subscribeToBrowserSupport,
    getBrowserVideoSupport,
    getServerVideoSupport,
  );
  const [status, setStatus] = useState<VideoExportStatus>("idle");
  const [message, setMessage] = useState("");
  const [videoProgress, setVideoProgress] = useState<VideoExportProgress | null>(null);
  const [videoActive, setVideoActive] = useState(false);
  const abortController = useRef<AbortController | null>(null);

  useEffect(() => () => abortController.current?.abort(), []);

  const busy = ["preparing", "recording", "finalizing"].includes(status);

  const handlePageDownload = () => {
    if (!currentPageId || busy) return;
    try {
      const result = downloadApprovedIllustration(project, currentPageId);
      setStatus("completed");
      setMessage(`Downloaded ${result.filename}`);
    } catch (error) {
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "The page illustration could not be downloaded.");
    }
  };

  const handleBookDownload = async () => {
    if (!exportPlan.ready || busy) return;
    setStatus("preparing");
    setMessage("Packaging the approved story and offline player...");
    setVideoProgress(null);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    try {
      const result = downloadPortableVisualBook(project);
      setStatus("completed");
      setMessage(`Downloaded ${result.filename}`);
    } catch (error) {
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "The portable visual book could not be created.");
    }
  };

  const handleVideoDownload = async () => {
    if (!exportPlan.ready || !videoSupport.supported || busy || abortController.current) return;
    const controller = new AbortController();
    abortController.current = controller;
    setVideoActive(true);
    setStatus("preparing");
    setMessage("Preparing approved artwork for real-time recording...");
    setVideoProgress(null);
    try {
      const result = await downloadVisualStoryWebM(project, {
        signal: controller.signal,
        onProgress: (progress) => {
          setStatus(progress.status);
          setVideoProgress(progress);
          setMessage(
            progress.status === "recording"
              ? `Recording page ${progress.currentPage} of ${progress.totalPages}. Keep this tab open.`
              : progress.status === "finalizing"
                ? "Finalizing the WebM file..."
                : `Preparing page ${progress.currentPage} of ${progress.totalPages}...`,
          );
        },
      });
      setStatus("completed");
      setVideoProgress({ status: "finalizing", currentPage: result.pageCount, totalPages: result.pageCount, progress: 100 });
      setMessage(`Downloaded ${result.filename}`);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setStatus("cancelled");
        setMessage("Video export was cancelled cleanly.");
      } else {
        setStatus("failed");
        setMessage(error instanceof Error ? error.message : "The WebM export failed.");
      }
    } finally {
      abortController.current = null;
      setVideoActive(false);
    }
  };

  const cancelVideo = () => abortController.current?.abort();
  const progressPercent = videoProgress?.progress ?? 0;

  return (
    <section className="mt-4 border-t border-white/10 pt-4" aria-label="Export visual book">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#b5ba8a]">Export approved story</p>
          <p className="mt-1 text-[9px] leading-relaxed text-white/50">
            {exportPlan.ready
              ? `${exportPlan.totalPages} approved pages are ready for portable export.`
              : invalidAssetCount > 0
                ? `${invalidAssetCount} approved illustration${invalidAssetCount === 1 ? " is" : "s are"} not export-compatible. Review the affected page${invalidAssetCount === 1 ? "" : "s"}; approval has been preserved.`
                : `${exportPlan.approvedIllustrations} of ${exportPlan.totalPages} illustrations are export-ready. Complete or approve the remaining pages before exporting the full visual book.`}
          </p>
        </div>
        {status !== "idle" && <span className="rounded-full bg-white/10 px-2.5 py-1 text-[8px] font-bold uppercase tracking-wide text-white/65">{status}</span>}
      </div>

      {!exportPlan.ready && exportPlan.incompletePages.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {exportPlan.incompletePages.map((page) => (
            <button key={page.pageId} type="button" onClick={() => onOpenPage(page.pageId)} className="rounded-md border border-[#d0a969]/25 bg-[#6d542b]/25 px-2 py-1 text-[8px] font-semibold text-[#f4dab0] hover:bg-[#6d542b]/40" title={page.issue}>
              {page.issueKind === "invalid_approved_asset"
                ? `Review export issue on page ${page.pageNumber}`
                : page.issueKind === "missing_approved_version"
                  ? `Approve artwork for page ${page.pageNumber}`
                  : `Finish page ${page.pageNumber}`}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={handlePageDownload} disabled={!currentPageId || busy} className="rounded-xl border border-white/15 p-3 text-left enabled:hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40">
          <span className="block text-[10px] font-bold">Download current page</span>
          <span className="mt-1 block text-[8px] leading-relaxed text-white/45">Preserves the approved SVG or raster asset.</span>
        </button>
        <button type="button" onClick={handleBookDownload} disabled={!exportPlan.ready || busy} className="rounded-xl bg-[#f6f1e8] p-3 text-left text-[#20211f] enabled:hover:bg-white disabled:cursor-not-allowed disabled:opacity-40">
          <span className="block text-[10px] font-bold">Download complete visual book</span>
          <span className="mt-1 block text-[8px] leading-relaxed text-[#5f5b54]">ZIP with offline player, manifest, and approved artwork.</span>
        </button>
        <button type="button" onClick={handleVideoDownload} disabled={!exportPlan.ready || !videoSupport.supported || busy} className="rounded-xl border border-white/15 p-3 text-left enabled:hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40">
          <span className="block text-[10px] font-bold">Export video (WebM)</span>
          <span className="mt-1 block text-[8px] leading-relaxed text-white/45">Real-time, silent 1280×720 browser recording.</span>
        </button>
      </div>

      {!videoSupport.supported && <p className="mt-2 text-[8px] text-white/40">WebM unavailable: {videoSupport.reason} The portable ZIP remains the reliable fallback.</p>}
      {message && <p className={`mt-2 text-[9px] ${status === "failed" ? "text-[#f0a89d]" : status === "completed" ? "text-[#b5d39b]" : "text-white/55"}`} role="status">{message}</p>}
      {busy && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#b5ba8a] transition-[width]" style={{ width: `${progressPercent}%` }} /></div>
          <span className="w-8 text-right text-[8px] text-white/45">{progressPercent}%</span>
          {videoActive && <button type="button" onClick={cancelVideo} className="rounded-md border border-white/15 px-2 py-1 text-[8px] font-semibold hover:bg-white/10">Cancel</button>}
        </div>
      )}
    </section>
  );
}
