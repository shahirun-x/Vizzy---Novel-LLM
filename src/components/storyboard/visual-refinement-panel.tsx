"use client";

import { useState } from "react";
import { PrototypeImage } from "@/components/storyboard/visual-generation-panel";
import {
  getImageVersionLineage,
  type ImageVersionLineageNode,
} from "@/lib/page-creation";
import type { ImageVersion, PageBeat } from "@/types/domain";

const QUICK_REFINEMENTS = [
  "Closer shot",
  "Wider composition",
  "Colder lighting",
  "More atmospheric",
  "Emphasize character",
  "Emphasize environment",
] as const;

function lineageLabel(version: ImageVersion) {
  return version.generationSource === "generated"
    ? `Original ${version.optionLabel} · Batch ${version.batchNumber}`
    : `${version.optionLabel} · Refinement ${version.refinementSequence}`;
}

function LineageItem({
  node,
  level,
  approvedVersionId,
  locked,
  onSelect,
  onCompare,
  parentLabel,
}: {
  node: ImageVersionLineageNode;
  level: number;
  approvedVersionId: string | null;
  locked: boolean;
  onSelect: (versionId: string) => void;
  onCompare: (versionId: string) => void;
  parentLabel?: string;
}) {
  const version = node.version;
  return (
    <div className={level ? "ml-4 border-l border-[#777fd7]/20 pl-3" : ""}>
      <div
        className={`rounded-xl border p-2.5 ${
          version.selected
            ? "border-[#777fd7]/55 bg-[#777fd7]/8"
            : "border-[#625b50]/10 bg-white/40"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[8px] font-semibold text-[#4d4942]">
              {lineageLabel(version)}
            </p>
            <p className="mt-0.5 text-[7px] text-[#918a81]">
              {version.parentVersionId
                ? `Refined from ${parentLabel ?? "parent version"}`
                : version.compositionDirection}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {version.id === approvedVersionId && (
              <span className="rounded-full bg-[#657053] px-2 py-1 text-[6px] font-bold uppercase tracking-wide text-white">
                Approved
              </span>
            )}
            {version.parentVersionId && (
              <button
                type="button"
                onClick={() => onCompare(version.id)}
                className="rounded-md border border-[#625b50]/12 px-2 py-1 text-[7px] font-semibold text-[#69645d]"
              >
                Compare
              </button>
            )}
            <button
              type="button"
              onClick={() => onSelect(version.id)}
              disabled={locked || version.selected}
              className="rounded-md bg-[#292a27] px-2 py-1 text-[7px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              {version.selected ? "Selected" : "Select"}
            </button>
          </div>
        </div>
        {version.refinementInstruction && (
          <p className="mt-2 rounded-lg bg-[#ece7df]/80 px-2 py-1.5 text-[7px] leading-relaxed text-[#716b63]">
            “{version.refinementInstruction}”
          </p>
        )}
      </div>
      {node.children.length > 0 && (
        <div className="mt-2 space-y-2">
          {node.children.map((child) => (
            <LineageItem
              key={child.version.id}
              node={child}
              level={level + 1}
              approvedVersionId={approvedVersionId}
              locked={locked}
              onSelect={onSelect}
              onCompare={onCompare}
              parentLabel={version.optionLabel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface VisualRefinementPanelProps {
  page: PageBeat;
  hasNextPage: boolean;
  allIllustrationsApproved: boolean;
  onSelect: (versionId: string) => void;
  onRefine: (instruction: string) => Promise<string>;
  onApprove: () => void;
  onReopen: () => void;
  onContinue: () => void;
}

export function VisualRefinementPanel({
  page,
  hasNextPage,
  allIllustrationsApproved,
  onSelect,
  onRefine,
  onApprove,
  onReopen,
  onContinue,
}: VisualRefinementPanelProps) {
  const [draft, setDraft] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [comparisonVersionId, setComparisonVersionId] = useState<string | null>(null);
  const versions = page.creation.imageVersions;
  const selectedVersion = versions.find((version) => version.selected) ?? null;
  const approvedVersion = versions.find(
    (version) => version.id === page.creation.approvedImageVersionId,
  );
  const comparisonChild = versions.find((version) => version.id === comparisonVersionId);
  const comparisonParent = comparisonChild?.parentVersionId
    ? versions.find((version) => version.id === comparisonChild.parentVersionId)
    : null;
  const lineage = getImageVersionLineage(versions);
  const locked = Boolean(page.creation.approvedImageVersionId);

  async function createRefinement() {
    if (!selectedVersion || !draft.trim() || isRefining || locked) return;
    setIsRefining(true);
    setErrorMessage(null);
    try {
      const childId = await onRefine(draft);
      setComparisonVersionId(childId);
      setDraft("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The prototype refinement could not be created.",
      );
    } finally {
      setIsRefining(false);
    }
  }

  if (!versions.length) return null;

  return (
    <section className="rounded-2xl border border-[#625b50]/10 bg-[#f7f2ea]/90 p-4 shadow-[0_10px_30px_rgba(75,67,58,.07)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[12px] font-semibold text-[#34342f]">Refinement & approval</h3>
          <p className="mt-1 max-w-xl text-[9px] leading-relaxed text-[#89837a]">
            Refine one selected prototype at a time. Every parent and branch remains available.
          </p>
        </div>
        {locked && (
          <span className="rounded-full bg-[#657053] px-2.5 py-1.5 text-[7px] font-bold uppercase tracking-[0.12em] text-white">
            Illustration approved
          </span>
        )}
      </div>

      {locked && approvedVersion ? (
        <div className="mt-4 rounded-2xl border border-[#657053]/20 bg-[#e5eddc] p-4">
          <div className="grid items-start gap-4 sm:grid-cols-[150px_1fr]">
            <PrototypeImage version={approvedVersion} sizes="150px" />
            <div>
              <h4 className="text-[11px] font-semibold text-[#445039]">Page illustration approved</h4>
              <p className="mt-1.5 text-[9px] leading-relaxed text-[#607251]">
                {approvedVersion.optionLabel} is locked as this page’s approved illustration.
                Selecting, generating, or refining cannot replace it until you explicitly reopen development.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {hasNextPage ? (
                  <button type="button" onClick={onContinue} className="rounded-lg bg-[#657053] px-3 py-2 text-[8px] font-semibold text-white">
                    Continue to next page
                  </button>
                ) : allIllustrationsApproved ? (
                  <span className="rounded-lg bg-[#657053]/12 px-3 py-2 text-[8px] font-semibold text-[#536346]">
                    All illustrations are approved.
                  </span>
                ) : (
                  <span className="rounded-lg bg-white/45 px-3 py-2 text-[8px] text-[#607251]">
                    Final planned page approved. Review remaining pages from the Pages workspace.
                  </span>
                )}
                <button type="button" onClick={onReopen} className="rounded-lg border border-[#657053]/25 bg-white/50 px-3 py-2 text-[8px] font-semibold text-[#536346]">
                  Reopen visual development
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : selectedVersion ? (
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[220px_1fr]">
          <div>
            <PrototypeImage version={selectedVersion} sizes="220px" />
            <p className="mt-2 text-[8px] font-semibold text-[#5e5a53]">
              Selected: {lineageLabel(selectedVersion)}
            </p>
          </div>
          <div>
            <label className="text-[8px] font-bold uppercase tracking-[0.13em] text-[#8c857b]" htmlFor={`refinement-${page.id}`}>
              What would you like to change?
            </label>
            <textarea
              id={`refinement-${page.id}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={4}
              placeholder="Keep this composition, but lower the camera and make the light colder."
              className="mt-2 w-full resize-y rounded-xl border border-[#625b50]/15 bg-white/65 px-3 py-2.5 text-[9px] leading-relaxed text-[#3e3b35] outline-none focus:border-[#777fd7]/45"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_REFINEMENTS.map((instruction) => (
                <button key={instruction} type="button" onClick={() => setDraft(instruction)} className="rounded-full border border-[#625b50]/12 bg-white/45 px-2.5 py-1.5 text-[7px] font-semibold text-[#6c675f] hover:border-[#777fd7]/35">
                  {instruction}
                </button>
              ))}
            </div>
            {errorMessage && <p role="alert" className="mt-2 text-[8px] text-[#985f5f]">{errorMessage}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={createRefinement} disabled={!draft.trim() || isRefining} className="rounded-lg bg-[#777fd7] px-3.5 py-2.5 text-[9px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
                {isRefining ? "Creating demo refinement…" : "Create refinement"}
              </button>
              <button type="button" onClick={onApprove} className="rounded-lg bg-[#292a27] px-3.5 py-2.5 text-[9px] font-semibold text-white">
                Approve illustration
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-[#625b50]/15 bg-white/35 px-4 py-5 text-center text-[9px] text-[#777269]">
          Select a visual option to begin refinement or approve it for this page.
        </div>
      )}

      {comparisonChild && comparisonParent && (
        <div className="mt-5 rounded-2xl border border-[#777fd7]/20 bg-[#efecf7] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-[10px] font-semibold text-[#484b78]">Before / after comparison</h4>
              <p className="mt-1 text-[8px] leading-relaxed text-[#6b6e91]">“{comparisonChild.refinementInstruction}”</p>
            </div>
            <button type="button" onClick={() => setComparisonVersionId(null)} className="rounded-md bg-white/65 px-2 py-1 text-[7px] font-semibold text-[#62658c]">Exit comparison</button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><p className="mb-1.5 text-[7px] font-bold uppercase tracking-wide text-[#777aa1]">Parent · {comparisonParent.optionLabel}</p><PrototypeImage version={comparisonParent} sizes="360px" /></div>
            <div><p className="mb-1.5 text-[7px] font-bold uppercase tracking-wide text-[#777aa1]">Refined · {comparisonChild.optionLabel}</p><PrototypeImage version={comparisonChild} sizes="360px" /></div>
          </div>
        </div>
      )}

      <div className="mt-5 border-t border-[#625b50]/10 pt-4">
        <h4 className="text-[10px] font-semibold text-[#44413a]">Version lineage</h4>
        <p className="mt-1 text-[8px] text-[#8b857c]">Indented versions are refinements. Older parents and branches remain selectable.</p>
        <div className="mt-3 space-y-2">
          {lineage.map((node) => (
            <LineageItem key={node.version.id} node={node} level={0} approvedVersionId={page.creation.approvedImageVersionId} locked={locked} onSelect={onSelect} onCompare={setComparisonVersionId} />
          ))}
        </div>
      </div>
    </section>
  );
}
