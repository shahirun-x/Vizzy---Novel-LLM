"use client";

import { useEffect, useMemo, useState } from "react";
import {
  STORY_DIRECTOR_DEFAULT_PAGE_COUNT,
  STORY_DIRECTOR_MAX_PAGE_COUNT,
  storyDirectorRequestSchema,
} from "@/lib/story-director-schema";
import type { GenerationJob } from "@/types/generation-job";
import type { PageAspectRatio, VisualOutputType } from "@/types/domain";
import type { StoryDirectorConfiguration, StoryDirectorRequest } from "@/types/story-director";

interface AIStoryCreatorProps {
  jobs: GenerationJob[];
  onGenerate: (request: StoryDirectorRequest, accessCode?: string) => Promise<string>;
  onCancel: (jobId: string) => void;
  onRetry: (jobId: string, accessCode?: string) => Promise<string>;
  onManualCreate: () => void;
}

const PROGRESS_LABELS = [
  "Understanding your story…",
  "Creating the characters…",
  "Developing the visual identity…",
  "Writing the story…",
  "Preparing your pages…",
];

export function AIStoryCreator({ jobs, onGenerate, onCancel, onRetry, onManualCreate }: AIStoryCreatorProps) {
  const [prompt, setPrompt] = useState("");
  const [outputType, setOutputType] = useState<VisualOutputType>("visual_book");
  const [pageCount, setPageCount] = useState(STORY_DIRECTOR_DEFAULT_PAGE_COUNT);
  const [visualStyle, setVisualStyle] = useState("");
  const [aspectRatio, setAspectRatio] = useState<PageAspectRatio>("3:4");
  const [referenceNotes, setReferenceNotes] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [configuration, setConfiguration] = useState<StoryDirectorConfiguration | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [progressIndex, setProgressIndex] = useState(0);
  const storyJobs = useMemo(() => jobs.filter((job) => job.operationType === "story_generation"), [jobs]);
  const latestJob = storyJobs.at(-1) ?? null;
  const active = latestJob?.status === "queued" || latestJob?.status === "running";

  useEffect(() => {
    let current = true;
    fetch("/api/story-director", { cache: "no-store" })
      .then((response) => response.json())
      .then((value: StoryDirectorConfiguration) => current && setConfiguration(value))
      .catch(() => current && setConfiguration({ apiConfigured: false, accessCodeRequired: false, available: false, message: "Could not inspect AI configuration. Manual creation remains available." }));
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setProgressIndex((value) => Math.min(value + 1, PROGRESS_LABELS.length - 1)), 3_000);
    return () => window.clearInterval(timer);
  }, [active]);

  async function submit() {
    setLocalError(null);
    setProgressIndex(0);
    const parsed = storyDirectorRequestSchema.safeParse({
      prompt,
      outputType,
      pageCount,
      visualStyle: visualStyle.trim() || null,
      aspectRatio,
      referenceNotes: referenceNotes.trim() || null,
    });
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? "Review the story request.");
      return;
    }
    try {
      await onGenerate(parsed.data, accessCode.trim() || undefined);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Story generation failed safely.");
    }
  }

  async function retry() {
    if (!latestJob) return;
    setLocalError(null);
    try {
      await onRetry(latestJob.id, accessCode.trim() || undefined);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Story retry failed safely.");
    }
  }

  return (
    <div className="relative z-10 mx-auto w-full max-w-[760px] rounded-2xl border border-white/70 bg-[#fbf8f2]/95 p-7 shadow-[0_22px_60px_rgba(75,67,58,.15)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#777fd7]">AI Story Director</p>
          <h2 className="mt-2 font-serif text-[30px] tracking-[-0.04em] text-[#292a27]">One idea. A complete visual story.</h2>
          <p className="mt-2 max-w-[580px] text-[11px] leading-relaxed text-[#716d65]">Vizzy creates the story, visual identity, character continuity, final narration and dialogue, and an approved page plan. Illustration generation remains the clearly labelled local prototype.</p>
        </div>
        <button type="button" onClick={onManualCreate} className="rounded-lg border border-[#5e594f]/15 px-3 py-2 text-[9px] font-semibold text-[#5f5b54] hover:bg-white">Use manual setup</button>
      </div>

      {configuration?.message && (
        <div className="mt-5 rounded-xl border border-[#b78955]/20 bg-[#fff4df] px-4 py-3 text-[10px] leading-relaxed text-[#765d3f]">{configuration.message}</div>
      )}

      <label className="mt-6 block text-[9px] font-bold uppercase tracking-[0.13em] text-[#777269]" htmlFor="story-idea">Story idea</label>
      <textarea id="story-idea" value={prompt} disabled={active} onChange={(event) => setPrompt(event.target.value)} rows={7} maxLength={8_000} placeholder="Example: A shy lighthouse keeper discovers that the stars are disappearing into the sea. Tell a hopeful three-page story about her first attempt to return one to the sky." className="mt-2 w-full resize-y rounded-xl border border-[#5e594f]/15 bg-white/65 p-4 text-[12px] leading-relaxed text-[#34342f] outline-none focus:border-[#777fd7]/50 disabled:opacity-60" />

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-[9px] font-bold uppercase tracking-wide text-[#777269]">Format
          <select value={outputType} disabled={active} onChange={(event) => setOutputType(event.target.value as VisualOutputType)} className="mt-1.5 block w-full rounded-lg border border-[#5e594f]/15 bg-white/70 px-3 py-2.5 text-[10px] font-medium normal-case text-[#3d3d38]">
            <option value="visual_book">Visual book</option><option value="graphic_novel">Graphic novel</option><option value="storyboard">Storyboard</option>
          </select>
        </label>
        <label className="text-[9px] font-bold uppercase tracking-wide text-[#777269]">Pages
          <input type="number" min={1} max={STORY_DIRECTOR_MAX_PAGE_COUNT} value={pageCount} disabled={active} onChange={(event) => setPageCount(Number(event.target.value))} className="mt-1.5 block w-full rounded-lg border border-[#5e594f]/15 bg-white/70 px-3 py-2.5 text-[10px] font-medium normal-case text-[#3d3d38]" />
        </label>
        <label className="text-[9px] font-bold uppercase tracking-wide text-[#777269]">Aspect ratio
          <select value={aspectRatio} disabled={active} onChange={(event) => setAspectRatio(event.target.value as PageAspectRatio)} className="mt-1.5 block w-full rounded-lg border border-[#5e594f]/15 bg-white/70 px-3 py-2.5 text-[10px] font-medium normal-case text-[#3d3d38]">
            <option value="3:4">Portrait 3:4</option><option value="16:9">Wide 16:9</option><option value="1:1">Square 1:1</option>
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-[9px] font-bold uppercase tracking-wide text-[#777269]">Optional visual style<input value={visualStyle} disabled={active} maxLength={500} onChange={(event) => setVisualStyle(event.target.value)} placeholder="Cinematic ink wash, warm practical light…" className="mt-1.5 block w-full rounded-lg border border-[#5e594f]/15 bg-white/70 px-3 py-2.5 text-[10px] font-medium normal-case text-[#3d3d38]" /></label>
        <label className="text-[9px] font-bold uppercase tracking-wide text-[#777269]">Optional reference notes<input value={referenceNotes} disabled={active} maxLength={2_000} onChange={(event) => setReferenceNotes(event.target.value)} placeholder="Continuity, era, visual motifs…" className="mt-1.5 block w-full rounded-lg border border-[#5e594f]/15 bg-white/70 px-3 py-2.5 text-[10px] font-medium normal-case text-[#3d3d38]" /></label>
      </div>

      {configuration?.accessCodeRequired && <label className="mt-3 block text-[9px] font-bold uppercase tracking-wide text-[#777269]">Deployment AI access code<input type="password" value={accessCode} disabled={active} autoComplete="off" onChange={(event) => setAccessCode(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-[#5e594f]/15 bg-white/70 px-3 py-2.5 text-[10px] font-medium normal-case text-[#3d3d38]" /><span className="mt-1 block font-normal normal-case text-[#969087]">Used for this request only; never saved in the project or job history.</span></label>}

      {active && latestJob && <div className="mt-5 rounded-xl bg-[#ece9fb] p-4"><p className="text-[10px] font-semibold text-[#4f548f]">{PROGRESS_LABELS[progressIndex]}</p><p className="mt-1 text-[9px] text-[#777269]">These are local waiting stages for one combined request, not provider-reported milestones.</p><button type="button" onClick={() => onCancel(latestJob.id)} className="mt-3 rounded-lg border border-[#777fd7]/25 px-3 py-2 text-[9px] font-semibold text-[#555ba0]">Cancel safely</button></div>}
      {!active && latestJob && ["failed", "cancelled", "interrupted"].includes(latestJob.status) && <div className="mt-5 rounded-xl border border-[#b96d64]/20 bg-[#fff0ed] p-4"><p className="text-[10px] text-[#754c48]">{latestJob.error?.message ?? "The story was not applied. Existing projects are unchanged."}</p><button type="button" onClick={retry} className="mt-3 rounded-lg bg-[#754c48] px-3 py-2 text-[9px] font-semibold text-white">Retry exact request</button></div>}
      {localError && <p role="alert" className="mt-4 text-[10px] text-[#9a4942]">{localError}</p>}

      <div className="mt-6 flex items-center gap-3">
        <button type="button" disabled={active || configuration?.available === false} onClick={submit} className="rounded-xl bg-[#282927] px-5 py-3 text-[10px] font-semibold text-white transition hover:bg-[#3b3c39] disabled:cursor-not-allowed disabled:opacity-45">Generate My Visual Novel</button>
        <span className="text-[9px] text-[#8a857d]">Default: 3 pages · no images generated</span>
      </div>
    </div>
  );
}
