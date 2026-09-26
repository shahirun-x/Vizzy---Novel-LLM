"use client";

import { ChatPanel } from "@/components/chat/chat-panel";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { WorkspaceCanvas } from "@/components/storyboard/workspace-canvas";
import { Icon } from "@/components/ui/icon";
import { LogoMark } from "@/components/ui/logo-mark";
import { useProjectStore } from "@/hooks/use-project-store";

export function StudioShell() {
  const {
    projects,
    selectedProject,
    activeView,
    generationJobs,
    addProject,
    openAICreator,
    generateStoryWithAI,
    cancelStoryGeneration,
    retryStoryGeneration,
    selectProject,
    setActiveView,
    submitOnboardingAnswer,
    updateStyleBible,
    generateStoryPlan,
    selectPageBeat,
    openPageCreation,
    navigatePageCreation,
    updatePageCreativeSettings,
    savePagePrompt,
    resetPagePrompt,
    addPageReference,
    removePageReference,
    addPageInstruction,
    generatePageVisualOptions,
    selectPageImageVersion,
    refinePageImageVersion,
    cancelGenerationJob,
    retryGenerationJob,
    approvePageIllustration,
    reopenPageIllustration,
    updatePageBeat,
    addPageBeat,
    deletePageBeat,
    movePageBeat,
    approveStoryPlan,
  } = useProjectStore();

  return (
    <main className="grid min-h-dvh grid-cols-[232px_minmax(480px,1fr)_390px] overflow-hidden bg-[#111210] text-[#f5f3ef] max-[1180px]:grid-cols-[208px_minmax(430px,1fr)_350px] max-[960px]:grid-cols-[76px_minmax(410px,1fr)_340px] max-[760px]:block max-[760px]:overflow-auto">
      <div className="sticky top-0 z-50 hidden h-14 items-center gap-2 border-b border-white/[0.06] bg-[#151614]/95 px-3 backdrop-blur-md max-[760px]:flex">
        <LogoMark size={28} />
        <select
          aria-label="Current project"
          value={selectedProject?.id ?? ""}
          onChange={(event) => selectProject(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-white/[0.07] bg-white/[0.04] px-2.5 py-2 text-[10px] text-[#deddd8] outline-none"
        >
          {projects.length === 0 && <option value="">No projects</option>}
          {projects.map((project) => (
            <option key={project.id} value={project.id} className="bg-[#1b1c1a]">
              {project.title}
            </option>
          ))}
        </select>
        {selectedProject && (
          <>
            <button
              type="button"
              onClick={() => setActiveView("story")}
              className={`grid h-9 w-9 place-items-center rounded-lg ${activeView === "story" ? "bg-white/[0.1] text-white" : "text-[#7f807a]"}`}
              aria-label="Story view"
            >
              <Icon name="story" size={17} />
            </button>
            <button
              type="button"
              onClick={() => setActiveView("style_bible")}
              className={`grid h-9 w-9 place-items-center rounded-lg ${activeView === "style_bible" ? "bg-white/[0.1] text-white" : "text-[#7f807a]"}`}
              aria-label="Style Bible view"
            >
              <Icon name="palette" size={17} />
            </button>
            {selectedProject.onboarding.status === "complete" && (
              <button
                type="button"
                onClick={() =>
                  setActiveView(
                    selectedProject.storyPlan?.status === "approved" ? "pages" : "planning",
                  )
                }
                className={`grid h-9 w-9 place-items-center rounded-lg ${["planning", "pages", "page_creation", "reader"].includes(activeView) ? "bg-white/[0.1] text-white" : "text-[#7f807a]"}`}
                aria-label={
                  selectedProject.storyPlan?.status === "approved"
                    ? "Approved pages"
                    : "Story planning"
                }
              >
                <Icon name="pages" size={17} />
              </button>
            )}
          </>
        )}
        <button
          type="button"
          onClick={openAICreator}
          className="grid h-9 w-9 place-items-center rounded-lg bg-[#777fd7] text-white"
          aria-label="Create with AI"
        >
          <Icon name="plus" size={17} />
        </button>
      </div>

      <AppSidebar
        projects={projects}
        selectedProject={selectedProject}
        activeView={activeView}
        onCreateProject={addProject}
        onCreateWithAI={openAICreator}
        onSelectProject={selectProject}
        onSelectView={setActiveView}
      />
      <WorkspaceCanvas
        project={selectedProject}
        activeView={activeView}
        onCreateProject={addProject}
        onCreateWithAI={openAICreator}
        onGenerateStoryWithAI={generateStoryWithAI}
        onCancelStoryGeneration={cancelStoryGeneration}
        onRetryStoryGeneration={retryStoryGeneration}
        onSelectView={setActiveView}
        onUpdateStyleBible={updateStyleBible}
        onGenerateStoryPlan={generateStoryPlan}
        onSelectPage={selectPageBeat}
        onOpenPageCreation={openPageCreation}
        onNavigatePageCreation={navigatePageCreation}
        onUpdatePageCreativeSettings={updatePageCreativeSettings}
        onSavePagePrompt={savePagePrompt}
        onResetPagePrompt={resetPagePrompt}
        onAddPageReference={addPageReference}
        onRemovePageReference={removePageReference}
        onGeneratePageVisuals={generatePageVisualOptions}
        onSelectPageImageVersion={selectPageImageVersion}
        onRefinePageImageVersion={refinePageImageVersion}
        generationJobs={generationJobs}
        onCancelGenerationJob={cancelGenerationJob}
        onRetryGenerationJob={retryGenerationJob}
        onApprovePageIllustration={approvePageIllustration}
        onReopenPageIllustration={reopenPageIllustration}
        onUpdatePage={updatePageBeat}
        onAddPage={addPageBeat}
        onDeletePage={deletePageBeat}
        onMovePage={movePageBeat}
        onApproveStoryPlan={approveStoryPlan}
      />
      <ChatPanel
        project={selectedProject}
        activeView={activeView}
        onCreateProject={addProject}
        onSubmitAnswer={submitOnboardingAnswer}
        onSelectView={setActiveView}
        onGenerateStoryPlan={generateStoryPlan}
        onAddPage={addPageBeat}
        onApproveStoryPlan={approveStoryPlan}
        onAddPageInstruction={addPageInstruction}
      />
    </main>
  );
}
