"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  assembleVisualStory,
  DEFAULT_PAGE_DURATION_SECONDS,
  getNextReaderIndex,
  getPreviousReaderIndex,
  MAX_PAGE_DURATION_SECONDS,
  MIN_PAGE_DURATION_SECONDS,
  normalizePageDuration,
} from "@/lib/story-assembly";
import type { Project } from "@/types/domain";

interface VisualBookReaderProps {
  project: Project;
  onClose: () => void;
  onOpenPage: (pageBeatId: string) => void;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function VisualBookReader({ project, onClose, onOpenPage }: VisualBookReaderProps) {
  const assembly = useMemo(() => assembleVisualStory(project), [project]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [durationSeconds, setDurationSeconds] = useState(DEFAULT_PAGE_DURATION_SECONDS);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenNotice, setFullscreenNotice] = useState("");
  const readerRef = useRef<HTMLDivElement>(null);
  const pages = assembly.readerPages;
  const boundedIndex = Math.min(currentIndex, Math.max(0, pages.length - 1));
  const currentPage = pages[boundedIndex] ?? null;

  useEffect(() => {
    if (!isPlaying || pages.length === 0) return;
    const timer = window.setTimeout(() => {
      if (boundedIndex === pages.length - 1 && !loop) {
        setIsPlaying(false);
        return;
      }
      setCurrentIndex((index) => getNextReaderIndex(index, pages.length, loop));
    }, durationSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [boundedIndex, durationSeconds, isPlaying, loop, pages.length]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === readerRef.current);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === " ") {
        event.preventDefault();
        if (pages.length) setIsPlaying((playing) => !playing);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setCurrentIndex((index) => getNextReaderIndex(index, pages.length, loop));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCurrentIndex((index) => getPreviousReaderIndex(index, pages.length));
      } else if (event.key === "Escape" && !document.fullscreenElement) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loop, onClose, pages.length]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (readerRef.current?.requestFullscreen) await readerRef.current.requestFullscreen();
      setFullscreenNotice("");
    } catch {
      setFullscreenNotice("Fullscreen could not be opened; distraction-free preview remains active.");
    }
  };

  const fullscreenAvailable = typeof document !== "undefined" && "fullscreenEnabled" in document
    ? document.fullscreenEnabled
    : false;
  const progress = pages.length ? ((boundedIndex + 1) / pages.length) * 100 : 0;

  return (
    <div ref={readerRef} className="relative z-10 flex min-h-[640px] w-full flex-col overflow-hidden rounded-3xl bg-[#10110f] text-white shadow-[0_28px_80px_rgba(22,21,19,.28)] fullscreen:min-h-screen fullscreen:rounded-none">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-[#b5ba8a]">Visual book preview</p>
          <h2 className="mt-1 truncate font-serif text-lg text-[#f8f4ec]">{project.title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setShowCaptions((value) => !value)} aria-pressed={showCaptions} className="rounded-lg border border-white/15 px-3 py-2 text-[9px] font-semibold text-white/80 hover:bg-white/10">
            Captions {showCaptions ? "on" : "off"}
          </button>
          <button type="button" onClick={toggleFullscreen} disabled={!fullscreenAvailable} className="rounded-lg border border-white/15 px-3 py-2 text-[9px] font-semibold text-white/80 enabled:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45">
            {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg bg-white px-3 py-2 text-[9px] font-bold text-[#20211f] hover:bg-[#eee9df]">
            Close preview
          </button>
        </div>
      </header>

      {!assembly.ready && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d0a969]/25 bg-[#6d542b]/25 px-4 py-2.5 text-[9px] text-[#f4dab0] sm:px-6">
          <span>Incomplete preview: {assembly.approvedIllustrations} of {assembly.totalPages} pages have approved artwork. Only approved pages are shown.</span>
          <div className="flex flex-wrap gap-1.5">
            {assembly.pages.filter((page) => !page.complete).map((page) => (
              <button key={page.pageId} type="button" onClick={() => onOpenPage(page.pageId)} className="rounded-md bg-white/10 px-2 py-1 font-semibold hover:bg-white/15">
                Finish page {page.pageNumber}
              </button>
            ))}
          </div>
        </div>
      )}

      {currentPage ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative min-h-[360px] flex-1 bg-black/25">
            <Image
              key={currentPage.imageVersionId}
              src={currentPage.imageUrl}
              alt={`Approved illustration for page ${currentPage.pageNumber}: ${currentPage.title}`}
              fill
              priority
              sizes="(max-width: 760px) 100vw, 70vw"
              unoptimized
              className="object-contain"
            />
            <div className="absolute left-4 top-4 rounded-full bg-black/55 px-3 py-1.5 text-[9px] font-semibold backdrop-blur-sm">
              Page {currentPage.pageNumber} · {boundedIndex + 1} of {pages.length} in preview
            </div>
            {showCaptions && (currentPage.narration || currentPage.dialogue) && (
              <div className="absolute inset-x-3 bottom-3 mx-auto max-w-2xl rounded-2xl border border-white/10 bg-black/70 px-4 py-3 text-center shadow-lg backdrop-blur-md sm:inset-x-6">
                {currentPage.narration && <p className="font-serif text-sm leading-relaxed text-[#fffaf0]">{currentPage.narration}</p>}
                {currentPage.dialogue && <p className="mt-1.5 text-[11px] leading-relaxed text-white/75">&ldquo;{currentPage.dialogue}&rdquo;</p>}
              </div>
            )}
          </div>

          <div className="border-t border-white/10 bg-[#171815] px-4 py-3 sm:px-6">
            <div className="mb-3 h-1 overflow-hidden rounded-full bg-white/10" aria-label={`Reading progress: page ${boundedIndex + 1} of ${pages.length}`}>
              <div className="h-full rounded-full bg-[#b5ba8a] transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 sm:w-48">
                <p className="truncate text-[11px] font-semibold text-[#f8f4ec]">{currentPage.title}</p>
                <p className="mt-0.5 text-[8px] uppercase tracking-wide text-white/45">Approved artwork</p>
              </div>
              <div className="flex items-center gap-1.5" aria-label="Playback controls">
                <button type="button" onClick={() => { setCurrentIndex(0); setIsPlaying(false); }} className="rounded-lg border border-white/15 px-2.5 py-2 text-[9px] font-semibold hover:bg-white/10">Restart</button>
                <button type="button" onClick={() => setCurrentIndex((index) => getPreviousReaderIndex(index, pages.length))} disabled={boundedIndex === 0} className="rounded-lg border border-white/15 px-2.5 py-2 text-[9px] font-semibold enabled:hover:bg-white/10 disabled:opacity-35">Previous</button>
                <button type="button" onClick={() => setIsPlaying((playing) => !playing)} className="min-w-16 rounded-lg bg-[#f6f1e8] px-3 py-2 text-[9px] font-bold text-[#20211f] hover:bg-white">{isPlaying ? "Pause" : "Play"}</button>
                <button type="button" onClick={() => setCurrentIndex((index) => getNextReaderIndex(index, pages.length, loop))} disabled={boundedIndex === pages.length - 1 && !loop} className="rounded-lg border border-white/15 px-2.5 py-2 text-[9px] font-semibold enabled:hover:bg-white/10 disabled:opacity-35">Next</button>
              </div>
              <div className="flex items-center gap-3 text-[9px] text-white/65">
                <label className="flex items-center gap-1.5">
                  <span>Seconds</span>
                  <input type="number" min={MIN_PAGE_DURATION_SECONDS} max={MAX_PAGE_DURATION_SECONDS} value={durationSeconds} onChange={(event) => setDurationSeconds(normalizePageDuration(Number(event.target.value)))} className="w-14 rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-white outline-none focus:border-[#b5ba8a]" />
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />
                  Loop
                </label>
              </div>
            </div>
            {(!fullscreenAvailable || fullscreenNotice) && <p className="mt-2 text-right text-[8px] text-white/40">{fullscreenNotice || "Fullscreen is unavailable here; distraction-free preview remains active."}</p>}
          </div>
        </div>
      ) : (
        <div className="grid flex-1 place-items-center px-6 py-16 text-center">
          <div className="max-w-sm">
            <p className="font-serif text-2xl text-[#f8f4ec]">No approved pages to preview</p>
            <p className="mt-3 text-[11px] leading-relaxed text-white/55">Approve at least one page illustration, then return to the visual book preview.</p>
            {assembly.pages[0] && <button type="button" onClick={() => onOpenPage(assembly.pages[0].pageId)} className="mt-5 rounded-lg bg-white px-4 py-2.5 text-[10px] font-bold text-[#20211f]">Open first page</button>}
          </div>
        </div>
      )}
    </div>
  );
}
