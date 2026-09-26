"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { createProject } from "@/lib/onboarding";
import {
  addProjectPageInstruction,
  addProjectPageReference,
  addProjectToStudio,
  addSelectedProjectPageBeat,
  answerSelectedProjectOnboarding,
  appendPageGenerationResult,
  appendPageRefinementResult,
  approveProjectPageIllustration,
  approveSelectedProjectStoryPlan,
  changeStudioView,
  deleteSelectedProjectPageBeat,
  generateSelectedProjectStoryPlan,
  markPageGenerationStarted,
  moveSelectedProjectPageBeat,
  navigateProjectPageCreation,
  openProjectPageCreation,
  removeProjectPageReference,
  reopenProjectPageIllustration,
  resetProjectPagePrompt,
  restorePageAfterGenerationFailure,
  saveProjectPagePrompt,
  selectProjectPage,
  selectProjectPageImageVersion,
  selectStudioProject,
  updateProjectPageCreativeSettings,
  updateSelectedProjectPageBeat,
  updateSelectedProjectStyleBible,
} from "@/lib/project-commands";
import {
  parseStudioSnapshot,
  type PersistedStudioState,
  type StudioView,
} from "@/lib/project-storage";
import {
  defaultApplicationServices,
  type ApplicationServices,
} from "@/services/application-services";
import { ImageGenerationError } from "@/services/image-generation";
import {
  ImageGenerationOrchestrator,
  preparePageGeneration,
  preparePageRefinement,
} from "@/services/image-generation-orchestrator";
import type {
  PageBeat,
  PageCreativeSettings,
  VisualReferenceMetadata,
  VisualStyleBible,
} from "@/types/domain";

export type { StudioView } from "@/lib/project-storage";

/** React-facing facade. Business transitions, persistence, and provider calls live outside it. */
export function useProjectStore(services: ApplicationServices = defaultApplicationServices) {
  const { persistence, imageGeneration } = services;
  const snapshot = useSyncExternalStore(
    persistence.subscribe,
    persistence.getSnapshot,
    persistence.getServerSnapshot,
  );
  const state = useMemo(() => parseStudioSnapshot(snapshot), [snapshot]);
  const orchestrator = useMemo(
    () => new ImageGenerationOrchestrator(imageGeneration),
    [imageGeneration],
  );
  const selectedProject =
    state.projects.find((project) => project.id === state.selectedProjectId) ?? null;

  const updateState = useCallback(
    (updater: (current: PersistedStudioState) => PersistedStudioState) => {
      persistence.write(updater(parseStudioSnapshot(persistence.getSnapshot())));
    },
    [persistence],
  );

  const addProject = useCallback(() => {
    updateState((current) => addProjectToStudio(current, createProject()));
  }, [updateState]);

  const selectProject = useCallback(
    (projectId: string) => updateState((current) => selectStudioProject(current, projectId)),
    [updateState],
  );

  const setActiveView = useCallback(
    (activeView: StudioView) => updateState((current) => changeStudioView(current, activeView)),
    [updateState],
  );

  const submitOnboardingAnswer = useCallback(
    (answer: string) => {
      if (!state.selectedProjectId) return;
      updateState((current) => answerSelectedProjectOnboarding(current, answer));
    },
    [state.selectedProjectId, updateState],
  );

  const updateStyleBible = useCallback(
    (updates: Partial<Omit<VisualStyleBible, "projectId">>) =>
      updateState((current) => updateSelectedProjectStyleBible(current, updates)),
    [updateState],
  );

  const generateStoryPlan = useCallback(
    (pageCount: number) =>
      updateState((current) => generateSelectedProjectStoryPlan(current, pageCount)),
    [updateState],
  );

  const selectPageBeat = useCallback(
    (pageBeatId: string) => updateState((current) => selectProjectPage(current, pageBeatId)),
    [updateState],
  );

  const openPageCreation = useCallback(
    (pageBeatId: string) =>
      updateState((current) => openProjectPageCreation(current, pageBeatId)),
    [updateState],
  );

  const navigatePageCreation = useCallback(
    (direction: "previous" | "next") =>
      updateState((current) => navigateProjectPageCreation(current, direction)),
    [updateState],
  );

  const updatePageCreativeSettings = useCallback(
    (pageBeatId: string, updates: Partial<PageCreativeSettings>) =>
      updateState((current) =>
        updateProjectPageCreativeSettings(current, pageBeatId, updates),
      ),
    [updateState],
  );

  const savePagePrompt = useCallback(
    (pageBeatId: string, prompt: string) =>
      updateState((current) => saveProjectPagePrompt(current, pageBeatId, prompt)),
    [updateState],
  );

  const resetPagePrompt = useCallback(
    (pageBeatId: string) =>
      updateState((current) => resetProjectPagePrompt(current, pageBeatId)),
    [updateState],
  );

  const addPageReference = useCallback(
    (
      pageBeatId: string,
      reference: Pick<
        VisualReferenceMetadata,
        "title" | "url" | "description" | "purpose"
      >,
    ) =>
      updateState((current) => addProjectPageReference(current, pageBeatId, reference)),
    [updateState],
  );

  const removePageReference = useCallback(
    (pageBeatId: string, referenceId: string) =>
      updateState((current) =>
        removeProjectPageReference(current, pageBeatId, referenceId),
      ),
    [updateState],
  );

  const addPageInstruction = useCallback(
    (pageBeatId: string, instruction: string) =>
      updateState((current) =>
        addProjectPageInstruction(current, pageBeatId, instruction),
      ),
    [updateState],
  );

  const generatePageVisualOptions = useCallback(
    async (pageBeatId: string) => {
      const current = parseStudioSnapshot(persistence.getSnapshot());
      const project = current.projects.find(
        (candidate) => candidate.id === current.selectedProjectId,
      );
      if (!project) {
        throw new ImageGenerationError(
          "INVALID_REQUEST",
          "Only an approved page can prepare visual options.",
        );
      }
      const operation = preparePageGeneration(project, pageBeatId);

      updateState((before) => markPageGenerationStarted(before, project.id, pageBeatId));
      try {
        const result = await orchestrator.generate(operation);
        updateState((after) =>
          appendPageGenerationResult(
            after,
            project.id,
            pageBeatId,
            result.versions,
            operation.batchNumber,
          ),
        );
      } catch (error) {
        updateState((after) =>
          restorePageAfterGenerationFailure(after, project.id, pageBeatId),
        );
        throw error instanceof ImageGenerationError
          ? error
          : new ImageGenerationError(
              "GENERATION_FAILED",
              "The prototype visual service could not prepare this set.",
            );
      }
    },
    [orchestrator, persistence, updateState],
  );

  const selectPageImageVersion = useCallback(
    (pageBeatId: string, versionId: string) =>
      updateState((current) =>
        selectProjectPageImageVersion(current, pageBeatId, versionId),
      ),
    [updateState],
  );

  const refinePageImageVersion = useCallback(
    async (pageBeatId: string, refinementInstruction: string) => {
      const current = parseStudioSnapshot(persistence.getSnapshot());
      const project = current.projects.find(
        (candidate) => candidate.id === current.selectedProjectId,
      );
      if (!project) {
        throw new ImageGenerationError(
          "INVALID_REQUEST",
          "Select a visual version before creating a refinement.",
        );
      }
      const operation = preparePageRefinement(project, pageBeatId, refinementInstruction);

      try {
        const result = await orchestrator.refine(operation);
        const child = result.versions[0];
        updateState((after) =>
          appendPageRefinementResult(
            after,
            project.id,
            pageBeatId,
            child,
            refinementInstruction,
          ),
        );
        return child.id;
      } catch (error) {
        throw error instanceof ImageGenerationError
          ? error
          : new ImageGenerationError(
              "GENERATION_FAILED",
              "The prototype refinement service could not create this version.",
            );
      }
    },
    [orchestrator, persistence, updateState],
  );

  const approvePageIllustration = useCallback(
    (pageBeatId: string) =>
      updateState((current) => approveProjectPageIllustration(current, pageBeatId)),
    [updateState],
  );

  const reopenPageIllustration = useCallback(
    (pageBeatId: string) =>
      updateState((current) => reopenProjectPageIllustration(current, pageBeatId)),
    [updateState],
  );

  const updatePageBeat = useCallback(
    (
      pageBeatId: string,
      updates: Partial<
        Pick<
          PageBeat,
          | "title"
          | "description"
          | "visualDirection"
          | "narration"
          | "dialogue"
          | "optionalActLabel"
        >
      >,
    ) =>
      updateState((current) =>
        updateSelectedProjectPageBeat(current, pageBeatId, updates),
      ),
    [updateState],
  );

  const addPageBeat = useCallback(
    () => updateState(addSelectedProjectPageBeat),
    [updateState],
  );

  const deletePageBeat = useCallback(
    (pageBeatId: string) =>
      updateState((current) => deleteSelectedProjectPageBeat(current, pageBeatId)),
    [updateState],
  );

  const movePageBeat = useCallback(
    (pageBeatId: string, direction: "up" | "down") =>
      updateState((current) =>
        moveSelectedProjectPageBeat(current, pageBeatId, direction),
      ),
    [updateState],
  );

  const approveStoryPlan = useCallback(
    () => updateState(approveSelectedProjectStoryPlan),
    [updateState],
  );

  return {
    projects: state.projects,
    selectedProject,
    activeView: state.activeView,
    addProject,
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
    approvePageIllustration,
    reopenPageIllustration,
    updatePageBeat,
    addPageBeat,
    deletePageBeat,
    movePageBeat,
    approveStoryPlan,
  };
}
