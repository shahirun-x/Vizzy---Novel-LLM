"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/icon";
import Image from "next/image";
import { VisualGenerationPanel } from "@/components/storyboard/visual-generation-panel";
import { VisualRefinementPanel } from "@/components/storyboard/visual-refinement-panel";
import { getOutputTypeLabel } from "@/lib/onboarding";
import { getIllustrationProgress } from "@/lib/page-creation";
import type {
  PageBeat,
  PageCreativeSettings,
  Project,
  VisualReferenceMetadata,
  VisualReferencePurpose,
} from "@/types/domain";

interface PageCreationWorkspaceProps {
  project: Project;
  page: PageBeat;
  onBack: () => void;
  onNavigate: (direction: "previous" | "next") => void;
  onUpdateSettings: (updates: Partial<PageCreativeSettings>) => void;
  onSavePrompt: (prompt: string) => void;
  onResetPrompt: () => void;
  onAddReference: (
    reference: Pick<VisualReferenceMetadata, "title" | "url" | "description" | "purpose">,
  ) => void;
  onRemoveReference: (referenceId: string) => void;
  onGenerateVisuals: () => Promise<void>;
  onSelectImageVersion: (versionId: string) => void;
  onRefineImageVersion: (instruction: string) => Promise<string>;
  onApproveIllustration: () => void;
  onReopenIllustration: () => void;
}

const fieldClass =
  "mt-1.5 w-full rounded-xl border border-[#625b50]/15 bg-white/55 px-3 py-2.5 text-[10px] text-[#3e3b35] outline-none transition focus:border-[#777fd7]/45 focus:bg-white/80";
const labelClass = "text-[8px] font-bold uppercase tracking-[0.13em] text-[#8c857b]";

function PromptEditor({
  page,
  onSave,
  onReset,
  locked,
}: {
  page: PageBeat;
  onSave: (prompt: string) => void;
  onReset: () => void;
  locked: boolean;
}) {
  const activePrompt = page.creation.prompt.editedPrompt ?? page.creation.prompt.automaticPrompt;
  const [draft, setDraft] = useState(activePrompt);
  const [dirty, setDirty] = useState(false);
  const displayedPrompt = dirty ? draft : activePrompt;
  const isEdited = page.creation.prompt.mode === "edited";

  return (
    <section className="rounded-2xl border border-[#625b50]/10 bg-[#f7f2ea]/90 p-4 shadow-[0_10px_30px_rgba(75,67,58,.07)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[11px] font-semibold text-[#34342f]">Illustration prompt</h3>
            <span
              className={`rounded-full px-2 py-1 text-[7px] font-bold uppercase tracking-[0.12em] ${
                isEdited ? "bg-[#777fd7]/12 text-[#656cb7]" : "bg-[#dce6d4] text-[#607251]"
              }`}
            >
              {isEdited ? "Edited" : "Automatic"}
            </span>
          </div>
          <p className="mt-1 text-[9px] text-[#89837a]">
            Deterministically assembled from saved project and page details.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDirty(false);
            onReset();
          }}
          disabled={locked || (!isEdited && !dirty)}
          className="rounded-lg border border-[#625b50]/12 bg-white/45 px-2.5 py-2 text-[8px] font-semibold text-[#69645d] disabled:cursor-not-allowed disabled:opacity-35"
        >
          Reset to automatic
        </button>
      </div>
      <textarea
        aria-label="Illustration prompt"
        value={displayedPrompt}
        disabled={locked}
        onChange={(event) => {
          setDraft(event.target.value);
          setDirty(true);
        }}
        rows={14}
        className="studio-scrollbar mt-3 w-full resize-y rounded-xl border border-[#625b50]/12 bg-[#fffdf9]/75 p-3 font-mono text-[9px] leading-[1.65] text-[#4d4942] outline-none focus:border-[#777fd7]/40"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[8px] text-[#989188]">
          {dirty ? "Unsaved prompt changes" : "Prompt state saved locally"}
        </p>
        <button
          type="button"
          onClick={() => {
            onSave(displayedPrompt);
            setDraft(displayedPrompt);
            setDirty(false);
          }}
          disabled={locked || !displayedPrompt.trim() || (!dirty && isEdited)}
          className="rounded-lg bg-[#282927] px-3 py-2 text-[9px] font-semibold text-white hover:bg-[#3a3b38] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save prompt changes
        </button>
      </div>
    </section>
  );
}

function ReferenceLibrary({
  page,
  onAdd,
  onRemove,
  locked,
}: {
  page: PageBeat;
  onAdd: PageCreationWorkspaceProps["onAddReference"];
  onRemove: (referenceId: string) => void;
  locked: boolean;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [purpose, setPurpose] = useState<VisualReferencePurpose>("environment");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    onAdd({
      title: title.trim(),
      url: url.trim(),
      description: description.trim(),
      purpose,
    });
    setTitle("");
    setUrl("");
    setDescription("");
  }

  return (
    <section className="rounded-2xl border border-[#625b50]/10 bg-[#f7f2ea]/90 p-4 shadow-[0_10px_30px_rgba(75,67,58,.07)]">
      <div>
        <h3 className="text-[11px] font-semibold text-[#34342f]">Visual references</h3>
        <p className="mt-1 text-[9px] text-[#89837a]">
          Save links and notes only. Vizzy does not upload or copy image files.
        </p>
      </div>

      {page.creation.references.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {page.creation.references.map((reference) => (
            <article key={reference.id} className="rounded-xl border border-[#625b50]/10 bg-white/45 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-semibold text-[#44413a]">{reference.title}</p>
                  <p className="mt-1 text-[7px] font-bold uppercase tracking-[0.12em] text-[#777fd7]">
                    {reference.purpose}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(reference.id)}
                  disabled={locked}
                  className="rounded-md px-2 py-1 text-[8px] text-[#9a6f67] hover:bg-[#9a6f67]/10"
                  aria-label={`Remove ${reference.title}`}
                >
                  Remove
                </button>
              </div>
              {reference.description && (
                <p className="mt-2 line-clamp-2 text-[8px] leading-relaxed text-[#777269]">
                  {reference.description}
                </p>
              )}
              {reference.url && (
                <a
                  href={reference.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block truncate text-[8px] text-[#656cb7] underline decoration-[#656cb7]/25 underline-offset-2"
                >
                  {reference.url}
                </a>
              )}
            </article>
          ))}
        </div>
      )}

      <form onSubmit={submit} className={`mt-4 grid gap-3 border-t border-[#625b50]/10 pt-4 sm:grid-cols-2 ${locked ? "pointer-events-none opacity-45" : ""}`}>
        <label>
          <span className={labelClass}>Reference title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} placeholder="Rain-soaked station" />
        </label>
        <label>
          <span className={labelClass}>Purpose</span>
          <select value={purpose} onChange={(event) => setPurpose(event.target.value as VisualReferencePurpose)} className={fieldClass}>
            {(["character", "costume", "environment", "lighting", "composition"] as const).map((item) => (
              <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-2">
          <span className={labelClass}>URL</span>
          <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} className={fieldClass} placeholder="https://example.com/reference" />
        </label>
        <label className="sm:col-span-2">
          <span className={labelClass}>What should this inform?</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} className={`${fieldClass} resize-none`} rows={2} placeholder="Describe the useful visual qualities without adding story facts." />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={!title.trim()} className="rounded-lg bg-[#777fd7] px-3 py-2 text-[9px] font-semibold text-white hover:bg-[#686fca] disabled:cursor-not-allowed disabled:opacity-40">
            Add reference metadata
          </button>
        </div>
      </form>
    </section>
  );
}

export function PageCreationWorkspace({
  project,
  page,
  onBack,
  onNavigate,
  onUpdateSettings,
  onSavePrompt,
  onResetPrompt,
  onAddReference,
  onRemoveReference,
  onGenerateVisuals,
  onSelectImageVersion,
  onRefineImageVersion,
  onApproveIllustration,
  onReopenIllustration,
}: PageCreationWorkspaceProps) {
  const pages = [...(project.storyPlan?.pageBeats ?? [])].sort((a, b) => a.order - b.order);
  const pageIndex = pages.findIndex((candidate) => candidate.id === page.id);
  const isApproved = Boolean(page.creation.approvedImageVersionId);
  const progress = getIllustrationProgress(project.storyPlan);
  const aspectClass =
    (page.creation.imageVersions.find((version) => version.selected)?.aspectRatio ??
      page.creation.imageVersions.at(-1)?.aspectRatio ??
      page.creation.settings.aspectRatio) === "16:9"
      ? "aspect-video"
      : (page.creation.imageVersions.find((version) => version.selected)?.aspectRatio ??
            page.creation.imageVersions.at(-1)?.aspectRatio ??
            page.creation.settings.aspectRatio) === "1:1"
        ? "aspect-square"
        : "aspect-[3/4]";
  const previewVersion =
    page.creation.imageVersions.find(
      (version) => version.id === page.creation.approvedImageVersionId,
    ) ?? page.creation.imageVersions.find((version) => version.selected) ??
    page.creation.imageVersions.at(-3);
  const statusLabel = {
    not_started: "Not started",
    prompt_ready: "Prepared",
    generating: "Preparing options",
    options_ready: "Options generated",
    direction_selected: "Direction selected",
    refining: "Refining",
    illustration_approved: "Illustration approved",
    approved: "Approved",
  }[page.creation.illustrationStatus];

  return (
    <div className="relative z-10 mx-auto w-full max-w-[900px] pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-[#777269] hover:text-[#393a36]">
          <span className="rotate-180"><Icon name="chevron" size={14} /></span>
          All approved pages
        </button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onNavigate("previous")} disabled={pageIndex <= 0} className="rounded-lg border border-[#625b50]/12 bg-white/40 px-3 py-2 text-[9px] font-semibold text-[#5f5b54] disabled:cursor-not-allowed disabled:opacity-35">
            Previous
          </button>
          <span className="min-w-16 text-center text-[8px] font-bold uppercase tracking-[0.13em] text-[#888178]">
            {pageIndex + 1} / {pages.length}
          </span>
          <button type="button" onClick={() => onNavigate("next")} disabled={pageIndex >= pages.length - 1} className="rounded-lg border border-[#625b50]/12 bg-white/40 px-3 py-2 text-[9px] font-semibold text-[#5f5b54] disabled:cursor-not-allowed disabled:opacity-35">
            Next
          </button>
        </div>
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(240px,.8fr)]">
        <div className="min-w-0 space-y-4">
          <section className="overflow-hidden rounded-2xl border border-white/65 bg-[#f7f2ea]/90 p-4 shadow-[0_18px_50px_rgba(75,67,58,.12)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[8px] font-bold uppercase tracking-[0.15em] text-[#777fd7]">Page {page.order} · {getOutputTypeLabel(project.outputType)}</p>
                <h2 className="mt-1.5 truncate font-serif text-[23px] tracking-[-0.03em] text-[#292a27]">{page.title}</h2>
              </div>
              <span className="shrink-0 rounded-full bg-[#dce6d4] px-2.5 py-1.5 text-[7px] font-bold uppercase tracking-[0.11em] text-[#607251]">{statusLabel}</span>
            </div>

            <div className="mt-4 grid place-items-center rounded-xl bg-[#20211f] p-5 sm:p-7">
              <div className={`grid max-h-[440px] w-full max-w-[360px] place-items-center overflow-hidden rounded-lg border border-dashed border-white/15 bg-[radial-gradient(circle_at_50%_35%,rgba(124,131,218,.16),transparent_45%),linear-gradient(145deg,#292a27,#171816)] ${aspectClass}`}>
              {previewVersion ? (
                <div className="relative h-full w-full">
                  <Image src={previewVersion.imageUrl} alt={`${previewVersion.optionLabel} prototype visual`} fill sizes="360px" unoptimized className="object-cover" />
                  <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1.5 text-[7px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur-sm">
                    {previewVersion.id === page.creation.approvedImageVersionId
                      ? "Approved illustration"
                      : previewVersion.selected
                        ? "Selected direction"
                        : "Latest prototype"}
                  </span>
                </div>
              ) : (
                <div className="px-6 text-center">
                  <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-[#8b8fce]"><Icon name="sparkles" size={18} /></div>
                  <p className="mt-3 text-[10px] font-semibold text-[#d5d4cf]">No illustration yet</p>
                  <p className="mt-1.5 text-[8px] leading-relaxed text-[#74756f]">Generate three local prototype compositions from the prepared prompt.</p>
                </div>
              )}
              </div>
            </div>

            <div className="mt-4 grid gap-3 text-[9px] sm:grid-cols-2">
              <div><span className={labelClass}>Scene</span><p className="mt-1.5 leading-relaxed text-[#625e57]">{page.description}</p></div>
              <div><span className={labelClass}>Visual direction</span><p className="mt-1.5 leading-relaxed text-[#625e57]">{page.visualDirection}</p></div>
              <div><span className={labelClass}>Narration</span><p className="mt-1.5 leading-relaxed text-[#625e57]">{page.narration || "No narration saved."}</p></div>
              <div><span className={labelClass}>Dialogue</span><p className="mt-1.5 leading-relaxed text-[#625e57]">{page.dialogue || "No dialogue saved."}</p></div>
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-[#625b50]/10 bg-[#f7f2ea]/90 p-4 shadow-[0_10px_30px_rgba(75,67,58,.07)]">
          <h3 className="text-[11px] font-semibold text-[#34342f]">Creative settings</h3>
          <p className="mt-1 text-[9px] leading-relaxed text-[#89837a]">{isApproved ? "Reopen visual development to change page settings." : "Tune the page without changing its approved story beat."}</p>
          <div inert={isApproved ? true : undefined} className={`mt-4 grid gap-3 ${isApproved ? "opacity-45" : ""}`}>
            <label><span className={labelClass}>Camera angle</span><select value={page.creation.settings.cameraAngle} onChange={(event) => onUpdateSettings({ cameraAngle: event.target.value })} className={fieldClass}>{["Eye level", "Low angle", "High angle", "Overhead", "Dutch angle", "Close perspective"].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span className={labelClass}>Shot type</span><select value={page.creation.settings.shotType} onChange={(event) => onUpdateSettings({ shotType: event.target.value })} className={fieldClass}>{["Wide shot", "Medium shot", "Close-up", "Extreme close-up", "Full shot"].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span className={labelClass}>Lighting</span><select value={page.creation.settings.lighting} onChange={(event) => onUpdateSettings({ lighting: event.target.value })} className={fieldClass}>{["Natural soft light", "Dramatic contrast", "Golden hour", "Moonlit", "Diffused studio", "Backlit silhouette"].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span className={labelClass}>Composition</span><textarea value={page.creation.settings.composition} onChange={(event) => onUpdateSettings({ composition: event.target.value })} className={`${fieldClass} resize-none`} rows={2} /></label>
            <label><span className={labelClass}>Emotional tone</span><input value={page.creation.settings.emotionalTone} onChange={(event) => onUpdateSettings({ emotionalTone: event.target.value })} className={fieldClass} /></label>
            <label><span className={labelClass}>Additional instructions</span><textarea value={page.creation.settings.additionalInstructions} onChange={(event) => onUpdateSettings({ additionalInstructions: event.target.value })} className={`${fieldClass} resize-none`} rows={3} placeholder="Page-specific must-haves or boundaries" /></label>
            <fieldset>
              <legend className={labelClass}>Aspect ratio</legend>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {(["3:4", "16:9", "1:1"] as const).map((ratio) => (
                  <button key={ratio} type="button" onClick={() => onUpdateSettings({ aspectRatio: ratio })} className={`rounded-lg px-2 py-2 text-[9px] font-semibold ${page.creation.settings.aspectRatio === ratio ? "bg-[#777fd7] text-white" : "border border-[#625b50]/12 bg-white/45 text-[#6d6860]"}`}>{ratio}</button>
                ))}
              </div>
            </fieldset>
          </div>
        </section>
      </div>

      <div className="mt-5">
        <VisualGenerationPanel
          page={page}
          onGenerate={onGenerateVisuals}
          onSelect={onSelectImageVersion}
        />
      </div>

      <div className="mt-5">
        <VisualRefinementPanel
          page={page}
          hasNextPage={pageIndex < pages.length - 1}
          allIllustrationsApproved={progress.complete}
          onSelect={onSelectImageVersion}
          onRefine={onRefineImageVersion}
          onApprove={onApproveIllustration}
          onReopen={onReopenIllustration}
          onContinue={() => onNavigate("next")}
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <PromptEditor key={`${page.id}-prompt`} page={page} onSave={onSavePrompt} onReset={onResetPrompt} locked={isApproved} />
        <ReferenceLibrary key={`${page.id}-references`} page={page} onAdd={onAddReference} onRemove={onRemoveReference} locked={isApproved} />
      </div>
    </div>
  );
}
