import { PagesWorkspace } from "@/components/storyboard/pages-workspace";
import { PageCreationWorkspace } from "@/components/storyboard/page-creation-workspace";
import { StoryPlanningPanel } from "@/components/storyboard/story-planning-panel";
import { StyleBiblePanel } from "@/components/storyboard/style-bible-panel";
import { VisualBookReader } from "@/components/storyboard/visual-book-reader";
import { AIStoryCreator } from "@/components/storyboard/ai-story-creator";
import { Icon } from "@/components/ui/icon";
import type { StudioView } from "@/hooks/use-project-store";
import { getOutputTypeLabel, ONBOARDING_STEP_ORDER } from "@/lib/onboarding";
import type {
  PageBeat,
  PageCreativeSettings,
  Project,
  VisualReferenceMetadata,
  VisualStyleBible,
} from "@/types/domain";
import type { GenerationJob } from "@/types/generation-job";
import type { StoryDirectorRequest } from "@/types/story-director";

interface WorkspaceCanvasProps {
  project: Project | null;
  activeView: StudioView;
  onCreateProject: () => void;
  onCreateWithAI: () => void;
  onGenerateStoryWithAI: (request: StoryDirectorRequest, accessCode?: string) => Promise<string>;
  onCancelStoryGeneration: (jobId: string) => void;
  onRetryStoryGeneration: (jobId: string, accessCode?: string) => Promise<string>;
  onSelectView: (view: StudioView) => void;
  onUpdateStyleBible: (updates: Partial<Omit<VisualStyleBible, "projectId">>) => void;
  onGenerateStoryPlan: (pageCount: number) => void;
  onSelectPage: (pageBeatId: string) => void;
  onOpenPageCreation: (pageBeatId: string) => void;
  onNavigatePageCreation: (direction: "previous" | "next") => void;
  onUpdatePageCreativeSettings: (
    pageBeatId: string,
    updates: Partial<PageCreativeSettings>,
  ) => void;
  onSavePagePrompt: (pageBeatId: string, prompt: string) => void;
  onResetPagePrompt: (pageBeatId: string) => void;
  onAddPageReference: (
    pageBeatId: string,
    reference: Pick<VisualReferenceMetadata, "title" | "url" | "description" | "purpose">,
  ) => void;
  onRemovePageReference: (pageBeatId: string, referenceId: string) => void;
  onGeneratePageVisuals: (pageBeatId: string) => Promise<void>;
  onSelectPageImageVersion: (pageBeatId: string, versionId: string) => void;
  onRefinePageImageVersion: (pageBeatId: string, instruction: string) => Promise<string>;
  generationJobs: GenerationJob[];
  onCancelGenerationJob: (jobId: string) => void;
  onRetryGenerationJob: (jobId: string) => Promise<string | null>;
  onApprovePageIllustration: (pageBeatId: string) => void;
  onReopenPageIllustration: (pageBeatId: string) => void;
  onUpdatePage: (
    pageBeatId: string,
    updates: Partial<
      Pick<
        PageBeat,
        "title" | "description" | "visualDirection" | "narration" | "dialogue" | "optionalActLabel"
      >
    >,
  ) => void;
  onAddPage: () => void;
  onDeletePage: (pageBeatId: string) => void;
  onMovePage: (pageBeatId: string, direction: "up" | "down") => void;
  onApproveStoryPlan: () => void;
}

function EmptyWorkspace({ onCreateProject, onCreateWithAI }: { onCreateProject: () => void; onCreateWithAI: () => void }) {
  return (
    <div className="relative z-10 w-full min-w-0 max-w-[390px] rounded-2xl border border-white/65 bg-[#fbf8f2]/90 px-7 py-8 text-center shadow-[0_18px_50px_rgba(75,67,58,.13)] backdrop-blur-md sm:px-9">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[#282927] text-[#f6f1e8] shadow-lg">
        <Icon name="sparkles" size={20} />
      </div>
      <h2 className="mt-5 font-serif text-[26px] tracking-[-0.035em] text-[#292a27]">
        Your story starts here.
      </h2>
      <p className="mt-3 text-[11px] leading-[1.65] text-[#777269]">
        Create a project and Vizzy will help shape its story, format, characters, and visual direction.
      </p>
      <button
        type="button"
        onClick={onCreateWithAI}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#282927] px-4 py-2.5 text-[10px] font-semibold text-white transition-colors hover:bg-[#3b3c39]"
      >
        <Icon name="sparkles" size={15} />
        Create with AI
      </button>
      <button type="button" onClick={onCreateProject} className="ml-2 mt-6 rounded-xl border border-[#5e594f]/15 px-4 py-2.5 text-[10px] font-semibold text-[#504d47] hover:bg-white">Manual setup</button>
    </div>
  );
}

function ProjectSummary({ project, onSelectView }: { project: Project; onSelectView: (view: StudioView) => void }) {
  const styleItems = [
    project.styleBible.artStyle,
    project.styleBible.mood,
    project.styleBible.palette,
  ].filter(Boolean);
  const directionNotes = [
    { label: "Art style", value: project.styleBible.artStyle },
    { label: "Mood", value: project.styleBible.mood },
    { label: "Palette", value: project.styleBible.palette },
    { label: "Characters", value: project.styleBible.characterDescriptions },
    { label: "References", value: project.styleBible.visualReferences },
    { label: "Instructions", value: project.styleBible.additionalInstructions },
    { label: "Atmosphere", value: project.styleBible.atmosphere },
    { label: "Continuity", value: project.styleBible.continuityInstructions },
  ].filter((item) => item.value);
  const aiPlanReady = project.creationSource === "ai" && project.storyPlan?.status === "approved";

  return (
    <div className={`relative z-10 w-full rounded-2xl border border-white/70 bg-[#fbf8f2]/95 px-7 py-7 shadow-[0_22px_60px_rgba(75,67,58,.15)] backdrop-blur-md ${project.creationSource === "ai" ? "max-w-[760px]" : "max-w-[470px]"}`}>
      <div className="flex items-center gap-2 text-[#657053]">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#dce6d4] text-[13px]">✓</span>
        <span className="text-[9px] font-bold uppercase tracking-[0.16em]">Creative direction ready</span>
      </div>
      <h2 className="mt-4 font-serif text-[26px] tracking-[-0.035em] text-[#292a27]">{project.title}</h2>
      <p className="mt-3 line-clamp-4 text-[11px] leading-[1.7] text-[#6f6b63]">{project.description}</p>
      {project.genre && <p className="mt-2 text-[9px] font-semibold uppercase tracking-wide text-[#777fd7]">{project.genre} · {project.characters.length} character{project.characters.length === 1 ? "" : "s"} · {project.storyPlan?.pageBeats.length ?? 0} pages</p>}

      <div className="mt-5 grid grid-cols-2 gap-3 border-y border-[#696157]/10 py-4">
        <div>
          <div className="text-[8px] font-bold uppercase tracking-[0.13em] text-[#969087]">Format</div>
          <div className="mt-1.5 text-[11px] font-semibold text-[#3d3d38]">
            {getOutputTypeLabel(project.outputType)}
          </div>
        </div>
        <div>
          <div className="text-[8px] font-bold uppercase tracking-[0.13em] text-[#969087]">Style Bible</div>
          <div className="mt-1.5 text-[11px] font-semibold text-[#3d3d38]">
            {styleItems.length ? `${styleItems.length} details captured` : "Ready to refine"}
          </div>
        </div>
      </div>

      {styleItems.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {styleItems.slice(0, 4).map((item) => (
            <span key={item} className="max-w-full truncate rounded-full bg-[#e8e3da] px-2.5 py-1.5 text-[9px] text-[#67635c]">
              {item}
            </span>
          ))}
        </div>
      )}

      <div className="mt-5 rounded-xl bg-[#eae5dc]/75 p-4">
        <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-[#8b857c]">
          Style Bible
        </div>
        {directionNotes.length ? (
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {directionNotes.map((item) => (
              <div key={item.label} className="min-w-0">
                <span className="text-[8px] font-semibold uppercase tracking-wide text-[#969087]">
                  {item.label}
                </span>
                <p className="mt-0.5 line-clamp-2 text-[9px] leading-relaxed text-[#5f5b54]">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[9px] leading-relaxed text-[#777269]">
            No optional visual details were added yet. Open the Style Bible to shape them now.
          </p>
        )}
      </div>

      {aiPlanReady && (
        <div className="mt-4 space-y-4">
          <div>
            <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-[#8b857c]">Characters</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {project.characters.map((character) => (
                <span key={character.id} className="rounded-lg border border-[#696157]/10 bg-white/45 px-2.5 py-2 text-[9px] text-[#5f5b54]"><strong>{character.name}</strong> · {character.role}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-[#8b857c]">Approved page plan</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {project.storyPlan?.pageBeats.map((page) => (
                <div key={page.id} className="rounded-lg border border-[#696157]/10 bg-white/45 p-2.5">
                  <span className="text-[8px] font-bold uppercase text-[#969087]">Page {page.order}</span>
                  <p className="mt-1 line-clamp-1 text-[9px] font-semibold text-[#45443f]">{page.title}</p>
                  <p className="mt-1 line-clamp-2 text-[8px] leading-relaxed text-[#777269]">{page.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSelectView("style_bible")}
          className="rounded-xl border border-[#5e594f]/15 bg-white/45 px-3.5 py-2.5 text-[10px] font-semibold text-[#504d47] transition-colors hover:bg-white/75"
        >
          Edit creative direction
        </button>
        <button
          type="button"
          onClick={() => onSelectView(aiPlanReady ? "pages" : "planning")}
          className="rounded-xl bg-[#282927] px-3.5 py-2.5 text-[10px] font-semibold text-white transition-colors hover:bg-[#3b3c39]"
        >
          {aiPlanReady ? "Continue to Illustration" : "Continue to story planning"}
        </button>
      </div>
    </div>
  );
}

function OnboardingCanvas({ project }: { project: Project }) {
  const stepIndex = ONBOARDING_STEP_ORDER.indexOf(project.onboarding.currentStep);
  const progress = Math.round((stepIndex / (ONBOARDING_STEP_ORDER.length - 1)) * 100);

  return (
    <div className="relative z-10 w-full max-w-[430px] rounded-2xl border border-white/65 bg-[#fbf8f2]/92 px-8 py-8 text-center shadow-[0_18px_50px_rgba(75,67,58,.13)] backdrop-blur-md">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[#282927] text-[#f6f1e8] shadow-lg">
        <Icon name="sparkles" size={19} />
      </div>
      <p className="mt-5 text-[8px] font-bold uppercase tracking-[0.17em] text-[#858077]">
        Creative onboarding · {progress}%
      </p>
      <h2 className="mt-2 font-serif text-[25px] tracking-[-0.035em] text-[#292a27]">
        Let’s shape {project.title === "Untitled Story" ? "your new world" : project.title}.
      </h2>
      <p className="mt-3 text-[11px] leading-[1.65] text-[#777269]">
        Continue the conversation with Vizzy. Your answers are building a reusable creative direction as you go.
      </p>
      <div className="mt-6 h-1 overflow-hidden rounded-full bg-[#ddd7ce]">
        <div className="h-full rounded-full bg-[#777fd7] transition-all" style={{ width: `${Math.max(progress, 4)}%` }} />
      </div>
    </div>
  );
}

function PlaceholderView({ title, description }: { title: string; description: string }) {
  return (
    <div className="relative z-10 w-full min-w-0 max-w-[430px] rounded-2xl border border-white/65 bg-[#fbf8f2]/90 px-7 py-8 text-center shadow-[0_18px_50px_rgba(75,67,58,.13)] sm:px-9">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[#e5dfd5] text-[#777269]">
        <Icon name="pages" size={18} />
      </div>
      <h2 className="mt-5 font-serif text-[25px] tracking-[-0.035em] text-[#292a27]">{title}</h2>
      <p className="mt-3 text-[11px] leading-[1.65] text-[#777269]">{description}</p>
    </div>
  );
}

export function WorkspaceCanvas({
  project,
  activeView,
  onCreateProject,
  onCreateWithAI,
  onGenerateStoryWithAI,
  onCancelStoryGeneration,
  onRetryStoryGeneration,
  onSelectView,
  onUpdateStyleBible,
  onGenerateStoryPlan,
  onSelectPage,
  onOpenPageCreation,
  onNavigatePageCreation,
  onUpdatePageCreativeSettings,
  onSavePagePrompt,
  onResetPagePrompt,
  onAddPageReference,
  onRemovePageReference,
  onGeneratePageVisuals,
  onSelectPageImageVersion,
  onRefinePageImageVersion,
  generationJobs,
  onCancelGenerationJob,
  onRetryGenerationJob,
  onApprovePageIllustration,
  onReopenPageIllustration,
  onUpdatePage,
  onAddPage,
  onDeletePage,
  onMovePage,
  onApproveStoryPlan,
}: WorkspaceCanvasProps) {
  const title = activeView === "ai_create" ? "Create with AI" : project?.title ?? "Vizzy Studio";
  const selectedPage = project?.storyPlan?.pageBeats.find(
    (page) => page.id === project.selectedPageBeatId,
  );

  return (
    <section className="relative flex h-dvh min-h-[650px] min-w-0 flex-col overflow-hidden bg-[#e8e3da] text-[#20211f] max-[760px]:h-auto max-[760px]:min-h-[48rem]">
      <header className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-[#5b554d]/10 px-7">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[13px] font-semibold tracking-[-0.01em]">{title}</h1>
            {project && (
              <span className="shrink-0 rounded-full bg-[#cac4ba]/55 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-[#716d65]">
                {project.onboarding.status === "complete" ? "Ready" : "Draft"}
              </span>
            )}
          </div>
          <p className="mt-1 text-[10px] text-[#8a857d]">
            {activeView === "ai_create"
              ? "AI-native story creation"
              : activeView === "style_bible"
              ? "Visual Style Bible"
              : activeView === "planning"
                ? "Editorial planning board"
                : activeView === "pages"
                  ? "Approved page sequence"
                  : activeView === "page_creation"
                    ? selectedPage
                      ? `Page ${selectedPage.order} visual development`
                      : "Page visual development"
                    : activeView === "reader"
                      ? "Visual book reader"
                      : project
                        ? getOutputTypeLabel(project.outputType)
                        : "Local creative workspace"}
          </p>
        </div>
        {project && (
          <div className="flex items-center gap-2">
            {project.onboarding.status === "complete" && !["planning", "page_creation", "reader"].includes(activeView) && (
              <button
                type="button"
                onClick={() => onSelectView("planning")}
                className="rounded-lg border border-[#5e594f]/15 bg-white/35 px-3 py-2 text-[9px] font-semibold text-[#5f5b54] hover:bg-white/60"
              >
                Story plan
              </button>
            )}
            {!['style_bible', 'reader'].includes(activeView) && (
              <button
                type="button"
                onClick={() => onSelectView("style_bible")}
                className="rounded-lg bg-[#282927] px-3.5 py-2 text-[10px] font-semibold text-white shadow-sm transition-colors hover:bg-[#383936]"
              >
                Style Bible
              </button>
            )}
          </div>
        )}
      </header>

      <div className={`studio-scrollbar relative flex min-h-0 flex-1 overflow-y-auto overflow-x-hidden ${activeView === "reader" ? "p-3" : "p-7 max-[1180px]:p-6"} ${["style_bible", "planning", "pages", "page_creation", "reader"].includes(activeView) ? "items-start" : "items-center justify-center"}`}>
        <div className="pointer-events-none absolute inset-0 opacity-[0.17] [background-image:linear-gradient(rgba(55,50,44,.13)_1px,transparent_1px),linear-gradient(90deg,rgba(55,50,44,.13)_1px,transparent_1px)] [background-size:24px_24px]" />

        {activeView === "ai_create" ? (
          <AIStoryCreator
            jobs={generationJobs}
            onGenerate={onGenerateStoryWithAI}
            onCancel={onCancelStoryGeneration}
            onRetry={onRetryStoryGeneration}
            onManualCreate={onCreateProject}
          />
        ) : !project ? (
          <EmptyWorkspace onCreateProject={onCreateProject} onCreateWithAI={onCreateWithAI} />
        ) : activeView === "style_bible" ? (
          <StyleBiblePanel project={project} onChange={onUpdateStyleBible} />
        ) : activeView === "planning" ? (
          <StoryPlanningPanel
            project={project}
            onGenerate={onGenerateStoryPlan}
            onSelectPage={onSelectPage}
            onUpdatePage={onUpdatePage}
            onAddPage={onAddPage}
            onDeletePage={onDeletePage}
            onMovePage={onMovePage}
            onApprove={onApproveStoryPlan}
            onViewPages={() => onSelectView("pages")}
            onEditDirection={() => onSelectView("style_bible")}
          />
        ) : activeView === "pages" ? (
          <PagesWorkspace
            project={project}
            onOpenPlanning={() => onSelectView("planning")}
            onSelectPage={(pageBeatId) => {
              onOpenPageCreation(pageBeatId);
            }}
            onPreview={() => onSelectView("reader")}
          />
        ) : activeView === "reader" ? (
          <VisualBookReader
            project={project}
            onClose={() => onSelectView("pages")}
            onOpenPage={onOpenPageCreation}
          />
        ) : activeView === "page_creation" && selectedPage ? (
          <PageCreationWorkspace
            key={selectedPage.id}
            project={project}
            page={selectedPage}
            onBack={() => onSelectView("pages")}
            onNavigate={onNavigatePageCreation}
            onUpdateSettings={(updates) =>
              onUpdatePageCreativeSettings(selectedPage.id, updates)
            }
            onSavePrompt={(prompt) => onSavePagePrompt(selectedPage.id, prompt)}
            onResetPrompt={() => onResetPagePrompt(selectedPage.id)}
            onAddReference={(reference) => onAddPageReference(selectedPage.id, reference)}
            onRemoveReference={(referenceId) =>
              onRemovePageReference(selectedPage.id, referenceId)
            }
            onGenerateVisuals={() => onGeneratePageVisuals(selectedPage.id)}
            onSelectImageVersion={(versionId) =>
              onSelectPageImageVersion(selectedPage.id, versionId)
            }
            onRefineImageVersion={(instruction) =>
              onRefinePageImageVersion(selectedPage.id, instruction)
            }
            onApproveIllustration={() => onApprovePageIllustration(selectedPage.id)}
            onReopenIllustration={() => onReopenPageIllustration(selectedPage.id)}
            generationJobs={generationJobs}
            onCancelGenerationJob={onCancelGenerationJob}
            onRetryGenerationJob={onRetryGenerationJob}
          />
        ) : activeView === "story" && project.onboarding.status === "complete" ? (
          <ProjectSummary project={project} onSelectView={onSelectView} />
        ) : activeView === "story" ? (
          <OnboardingCanvas project={project} />
        ) : activeView === "characters" ? (
          <PlaceholderView
            title={project.characters.length ? "Character direction captured" : "Characters are waiting"}
            description={project.styleBible.characterDescriptions || "Describe your main characters during onboarding, or add their visual notes in the Style Bible."}
          />
        ) : null}
      </div>
    </section>
  );
}
