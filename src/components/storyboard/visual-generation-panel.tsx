"use client";

import Image from "next/image";
import { useState } from "react";
import { getImageGenerationBatches } from "@/lib/page-creation";
import type { ImageVersion, PageBeat } from "@/types/domain";

export function aspectClass(aspectRatio: ImageVersion["aspectRatio"]) {
  if (aspectRatio === "16:9") return "aspect-video";
  if (aspectRatio === "1:1") return "aspect-square";
  return "aspect-[3/4]";
}

export function PrototypeImage({ version, sizes }: { version: ImageVersion; sizes: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-[#17151f] ${aspectClass(version.aspectRatio)}`}
    >
      <Image
        src={version.imageUrl}
        alt={`${version.optionLabel}, ${version.compositionDirection}`}
        fill
        sizes={sizes}
        unoptimized
        className="object-cover"
      />
    </div>
  );
}

interface VisualGenerationPanelProps {
  page: PageBeat;
  onGenerate: () => Promise<void>;
  onSelect: (versionId: string) => void;
}

export function VisualGenerationPanel({
  page,
  onGenerate,
  onSelect,
}: VisualGenerationPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const batches = getImageGenerationBatches(page.creation.imageVersions);
  const currentBatch = batches[0];
  const isApproved = Boolean(page.creation.approvedImageVersionId);
  const activePrompt =
    page.creation.prompt.editedPrompt ?? page.creation.prompt.automaticPrompt;

  async function generate() {
    if (isGenerating || !activePrompt.trim() || isApproved) return;
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      await onGenerate();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The prototype visual service could not prepare this set.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#625b50]/10 bg-[#f7f2ea]/90 p-4 shadow-[0_10px_30px_rgba(75,67,58,.07)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[12px] font-semibold text-[#34342f]">Visual directions</h3>
            <span className="rounded-full bg-[#777fd7]/10 px-2 py-1 text-[7px] font-bold uppercase tracking-[0.12em] text-[#656cb7]">
              Local prototype
            </span>
          </div>
          <p className="mt-1 max-w-xl text-[9px] leading-relaxed text-[#89837a]">
            Each set contains an establishing, character, and atmospheric composition.
            These demo visuals are generated locally without an external provider.
          </p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={isGenerating || !activePrompt.trim() || isApproved}
          className="rounded-xl bg-[#777fd7] px-4 py-2.5 text-[9px] font-semibold text-white shadow-sm transition hover:bg-[#686fca] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isGenerating
            ? "Preparing three directions…"
            : isApproved
              ? "Illustration locked"
              : batches.length
              ? "Generate another set"
              : "Generate visual options"}
        </button>
      </div>

      {!activePrompt.trim() && (
        <div className="mt-4 rounded-xl border border-[#a77d58]/20 bg-[#f2e5d7] px-3 py-2.5 text-[9px] text-[#7d5c40]">
          Prepare or save an illustration prompt before generating visual options.
        </div>
      )}

      {isApproved && (
        <div className="mt-4 rounded-xl border border-[#607251]/20 bg-[#e5eddc] px-3 py-2.5 text-[9px] text-[#536346]">
          This page is approved. Reopen visual development before generating or selecting alternatives.
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="mt-4 rounded-xl border border-[#a86767]/20 bg-[#f3dddd] px-3 py-2.5 text-[9px] text-[#854f4f]">
          {errorMessage} Your prompt and earlier versions are still available.
        </div>
      )}

      {isGenerating && (
        <div className="mt-4 grid grid-cols-3 gap-2" aria-label="Preparing prototype visuals">
          {[0, 1, 2].map((item) => (
            <div key={item} className="aspect-[3/4] animate-pulse rounded-xl bg-[#ddd7ce]" />
          ))}
        </div>
      )}

      {!isGenerating && !currentBatch && (
        <div className="mt-4 rounded-xl border border-dashed border-[#625b50]/15 bg-white/35 px-5 py-8 text-center">
          <p className="text-[10px] font-semibold text-[#54514b]">No visual options yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[9px] leading-relaxed text-[#8b857c]">
            Generate a first set to compare three composition directions. Your exact saved
            prompt and chosen aspect ratio will be recorded with the batch.
          </p>
        </div>
      )}

      {!isGenerating && currentBatch && (
        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[8px] font-bold uppercase tracking-[0.13em] text-[#8c857b]">
              Current set · Batch {currentBatch.batchNumber}
            </p>
            <span className="text-[8px] text-[#999188]">
              {currentBatch.versions[0]?.aspectRatio}
            </span>
          </div>
          <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {currentBatch.versions.map((version) => (
              <article
                key={version.id}
                className={`rounded-2xl border p-2 transition ${
                  version.selected
                    ? "border-[#777fd7] bg-[#777fd7]/8 shadow-[0_0_0_3px_rgba(119,127,215,.12)]"
                    : "border-[#625b50]/10 bg-white/40"
                }`}
              >
                <PrototypeImage version={version} sizes="(max-width: 640px) 90vw, 24vw" />
                <div className="px-1 pb-1 pt-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-[9px] font-semibold text-[#3e3b35]">{version.optionLabel}</h4>
                    {version.selected && (
                      <span className="rounded-full bg-[#777fd7] px-2 py-1 text-[6px] font-bold uppercase tracking-wide text-white">
                        Selected direction
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-3 text-[8px] leading-relaxed text-[#7c766e]">
                    {version.compositionDirection}
                  </p>
                  <button
                    type="button"
                    onClick={() => onSelect(version.id)}
                    disabled={version.selected || isApproved}
                    className={`mt-2.5 w-full rounded-lg px-2 py-2 text-[8px] font-semibold ${
                      version.selected
                        ? "cursor-default bg-[#777fd7]/12 text-[#656cb7]"
                        : "bg-[#292a27] text-white hover:bg-[#3a3b38]"
                    }`}
                  >
                    {version.selected ? "Direction selected" : `Select ${version.optionLabel}`}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {batches.length > 0 && (
        <div className="mt-5 border-t border-[#625b50]/10 pt-4">
          <div>
            <h4 className="text-[10px] font-semibold text-[#44413a]">Generation history</h4>
            <p className="mt-1 text-[8px] text-[#8b857c]">Newest batches appear first. Earlier options remain selectable.</p>
          </div>
          <div className="mt-3 space-y-2">
            {batches.map((batch) => (
              <details key={batch.id} open={batch.id === currentBatch?.id} className="group rounded-xl border border-[#625b50]/10 bg-white/35 p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[9px] font-semibold text-[#555149]">
                  <span>Batch {batch.batchNumber}</span>
                  <span className="text-[7px] font-medium uppercase tracking-wide text-[#918a81]">
                    {batch.versions[0]?.aspectRatio} · {batch.versions.length} options
                  </span>
                </summary>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {batch.versions.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => onSelect(version.id)}
                      disabled={isApproved}
                      className={`rounded-xl border p-1.5 text-left ${
                        version.selected
                          ? "border-[#777fd7] bg-[#777fd7]/8"
                          : "border-transparent bg-[#ece7df] hover:border-[#777fd7]/35"
                      }`}
                      aria-label={`Select ${version.optionLabel} from batch ${batch.batchNumber}`}
                    >
                      <PrototypeImage version={version} sizes="120px" />
                      <span className="mt-1.5 block truncate px-0.5 text-[7px] font-semibold text-[#615d56]">
                        {version.optionLabel}{version.selected ? " · Selected" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
