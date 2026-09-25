import { Icon } from "@/components/ui/icon";
import Image from "next/image";
import { getIllustrationProgress } from "@/lib/page-creation";
import type { Project } from "@/types/domain";

interface PagesWorkspaceProps {
  project: Project;
  onOpenPlanning: () => void;
  onSelectPage: (pageBeatId: string) => void;
}

export function PagesWorkspace({ project, onOpenPlanning, onSelectPage }: PagesWorkspaceProps) {
  const plan = project.storyPlan;
  const statusLabels = {
    not_started: "Ready for visuals",
    prompt_ready: "Prepared",
    generating: "Preparing options",
    options_ready: "Options generated",
    direction_selected: "Direction selected",
    refining: "Refining",
    illustration_approved: "Approved",
    approved: "Approved",
  } as const;

  if (!plan || plan.status !== "approved") {
    return (
      <div className="relative z-10 w-full min-w-0 max-w-[430px] rounded-2xl border border-white/65 bg-[#fbf8f2]/90 px-7 py-8 text-center shadow-[0_18px_50px_rgba(75,67,58,.13)] sm:px-9">
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[#e5dfd5] text-[#777269]">
          <Icon name="pages" size={18} />
        </div>
        <h2 className="mt-5 font-serif text-[25px] tracking-[-0.035em] text-[#292a27]">Approve a story plan first</h2>
        <p className="mt-3 text-[11px] leading-[1.65] text-[#777269]">
          Approved page beats will appear here in sequence and become the foundation for future visual creation.
        </p>
        <button type="button" onClick={onOpenPlanning} className="mt-5 rounded-xl bg-[#282927] px-4 py-2.5 text-[10px] font-semibold text-white">
          Open story planning
        </button>
      </div>
    );
  }

  const progress = getIllustrationProgress(plan);

  return (
    <div className="relative z-10 mx-auto w-full max-w-[780px] py-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[#657053]">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-[#dce6d4] text-[11px]">✓</span>
            <span className="text-[8px] font-bold uppercase tracking-[0.15em]">Approved sequence</span>
          </div>
          <h2 className="mt-2 font-serif text-[27px] tracking-[-0.035em] text-[#292a27]">Planned pages</h2>
          <p className="mt-1.5 text-[10px] text-[#777269]">
            {progress.approved} of {progress.total} illustrations approved
          </p>
        </div>
        <button type="button" onClick={onOpenPlanning} className="rounded-lg border border-[#5e594f]/15 bg-white/40 px-3 py-2 text-[9px] font-semibold text-[#5f5b54] hover:bg-white/70">
          Revise story plan
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {plan.pageBeats.map((page) => {
          const approvedVersion = page.creation.imageVersions.find(
            (version) => version.id === page.creation.approvedImageVersionId,
          );
          return (
          <button
            key={page.id}
            type="button"
            onClick={() => onSelectPage(page.id)}
            className={`min-w-0 rounded-2xl border p-4 text-left shadow-[0_8px_24px_rgba(75,67,58,.07)] transition-colors ${project.selectedPageBeatId === page.id ? "border-[#777fd7]/45 bg-[#f7f2ea] ring-2 ring-[#777fd7]/10" : "border-white/65 bg-[#f6f1e9]/90 hover:border-[#777fd7]/25"}`}
          >
            <div className="flex items-start justify-between gap-3">
              {approvedVersion ? (
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#292a27]">
                  <Image src={approvedVersion.imageUrl} alt={`Approved prototype for page ${page.order}`} fill sizes="48px" unoptimized className="object-cover" />
                </span>
              ) : (
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#292a27] text-[10px] font-semibold text-white">
                  {String(page.order).padStart(2, "0")}
                </span>
              )}
              <span className="rounded-full bg-[#dce6d4] px-2 py-1 text-[7px] font-bold uppercase tracking-wide text-[#607251]">
                {statusLabels[page.creation.illustrationStatus]}
              </span>
            </div>
            <h3 className="mt-3 truncate text-[11px] font-semibold text-[#34342f]">{page.title}</h3>
            <p className="mt-1.5 line-clamp-3 text-[9px] leading-relaxed text-[#777269]">{page.description}</p>
            <span className="mt-4 inline-flex rounded-lg bg-[#e6e1d8] px-3 py-2 text-[8px] font-semibold text-[#777269]">
              Open visual workspace
            </span>
          </button>
          );
        })}
      </div>
    </div>
  );
}
