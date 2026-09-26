import { buildIllustrationPrompt } from "@/lib/illustration-prompt";
import { answerOnboardingQuestion } from "@/lib/onboarding";
import {
  addVisualReference,
  appendImageGenerationBatch,
  appendRefinedImageVersion,
  approveSelectedImageVersion,
  canOpenPageCreation,
  createPageChatMessage,
  getAdjacentPageBeatId,
  getRestingIllustrationStatus,
  normalizePageCreationState,
  removeVisualReference,
  reopenIllustrationDevelopment,
  resetEditedPrompt,
  saveEditedPrompt,
  selectImageVersion,
} from "@/lib/page-creation";
import type { PersistedStudioState, StudioView } from "@/lib/project-storage";
import {
  addPageBeat as addBeat,
  approveStoryPlan as approvePlan,
  createPlanningMessage,
  deletePageBeat as deleteBeat,
  generateStoryPlan as generatePlan,
  movePageBeat as moveBeat,
  updatePageBeat as updateBeat,
} from "@/lib/story-planner";
import type {
  ImageVersion,
  PageBeat,
  PageCreativeSettings,
  Project,
  VisualReferenceMetadata,
  VisualStyleBible,
} from "@/types/domain";

export function replaceProject(
  state: PersistedStudioState,
  project: Project,
): PersistedStudioState {
  return {
    ...state,
    projects: state.projects.map((candidate) =>
      candidate.id === project.id ? project : candidate,
    ),
  };
}

function selectedProject(state: PersistedStudioState) {
  return state.projects.find((project) => project.id === state.selectedProjectId);
}

function appendReapprovalMessage(project: Project, wasApproved: boolean) {
  if (!wasApproved) return project.planningChatHistory;
  return [
    ...project.planningChatHistory,
    createPlanningMessage(
      "The approved sequence changed, so I’ve returned the plan to draft. Review the update and approve it again when ready.",
    ),
  ];
}

export function updateProjectPageCreation(
  project: Project,
  pageBeatId: string,
  updater: (creation: PageBeat["creation"]) => PageBeat["creation"],
  refreshPrompt = true,
) {
  if (!project.storyPlan) return project;

  return {
    ...project,
    updatedAt: new Date().toISOString(),
    storyPlan: {
      ...project.storyPlan,
      pageBeats: project.storyPlan.pageBeats.map((page) => {
        if (page.id !== pageBeatId) return page;
        const normalizedCreation = normalizePageCreationState(page.creation);
        const creation = updater(normalizedCreation);
        const preparedPage = { ...page, creation };
        const shouldRefreshPrompt = refreshPrompt && !normalizedCreation.approvedImageVersionId;
        const automaticPrompt = shouldRefreshPrompt
          ? buildIllustrationPrompt(project, preparedPage)
          : creation.prompt.automaticPrompt;
        return {
          ...preparedPage,
          creation: {
            ...creation,
            illustrationStatus:
              shouldRefreshPrompt && creation.illustrationStatus === "not_started"
                ? ("prompt_ready" as const)
                : creation.illustrationStatus,
            prompt: {
              ...creation.prompt,
              automaticPrompt,
              updatedAt: shouldRefreshPrompt
                ? new Date().toISOString()
                : creation.prompt.updatedAt,
            },
          },
        };
      }),
    },
  };
}

function preparePageCreation(project: Project, pageBeatId: string) {
  return updateProjectPageCreation(project, pageBeatId, (creation) => ({
    ...creation,
    chatHistory: creation.chatHistory.length
      ? creation.chatHistory
      : [
          createPageChatMessage(
            "assistant",
            "This approved page is ready for visual development. Adjust its settings, refine the prepared prompt, add reference metadata, or leave page-specific notes here.",
          ),
        ],
  }));
}

function refreshProjectPrompts(project: Project) {
  return (
    project.storyPlan?.pageBeats.reduce(
      (current, page) => updateProjectPageCreation(current, page.id, (creation) => creation),
      project,
    ) ?? project
  );
}

export function addProjectToStudio(state: PersistedStudioState, project: Project) {
  return {
    ...state,
    version: 7 as const,
    projects: [...state.projects, project],
    selectedProjectId: project.id,
    activeView: "story" as const,
  };
}

export function selectStudioProject(state: PersistedStudioState, projectId: string) {
  return { ...state, selectedProjectId: projectId, activeView: "story" as const };
}

export function changeStudioView(state: PersistedStudioState, activeView: StudioView) {
  if (activeView !== "planning" || !state.selectedProjectId) {
    return { ...state, activeView };
  }
  return {
    ...state,
    activeView,
    projects: state.projects.map((project) => {
      if (project.id !== state.selectedProjectId || project.planningChatHistory.length) {
        return project;
      }
      return {
        ...project,
        planningChatHistory: [
          createPlanningMessage(
            "Let’s turn your saved story concept into an editable page sequence. Choose a page count in the planning workspace, then I’ll prepare a clearly labelled suggested draft.",
          ),
        ],
      };
    }),
  };
}

export function answerSelectedProjectOnboarding(
  state: PersistedStudioState,
  answer: string,
) {
  return {
    ...state,
    projects: state.projects.map((project) =>
      project.id === state.selectedProjectId ? answerOnboardingQuestion(project, answer) : project,
    ),
  };
}

export function updateSelectedProjectStyleBible(
  state: PersistedStudioState,
  updates: Partial<Omit<VisualStyleBible, "projectId">>,
) {
  return {
    ...state,
    projects: state.projects.map((project) => {
      if (project.id !== state.selectedProjectId) return project;
      const characterDescriptions = updates.characterDescriptions;
      const nextProject: Project = {
        ...project,
        updatedAt: new Date().toISOString(),
        styleBible: { ...project.styleBible, ...updates },
        characters:
          characterDescriptions === undefined
            ? project.characters
            : characterDescriptions
              ? [
                  {
                    id: project.characters[0]?.id ?? `character-${project.id}`,
                    projectId: project.id,
                    name: project.characters[0]?.name ?? "Main character notes",
                    role: project.characters[0]?.role ?? "Main character",
                    description: characterDescriptions,
                    physicalDescription: characterDescriptions,
                    clothing: project.characters[0]?.clothing ?? "",
                    distinguishingFeatures:
                      project.characters[0]?.distinguishingFeatures ?? "",
                    continuityNotes: project.characters[0]?.continuityNotes ?? "",
                  },
                ]
              : [],
      };
      return refreshProjectPrompts(nextProject);
    }),
  };
}

export function generateSelectedProjectStoryPlan(
  state: PersistedStudioState,
  pageCount: number,
) {
  const project = selectedProject(state);
  if (!project || project.onboarding.status !== "complete") return state;
  const storyPlan = generatePlan(project, pageCount);
  return replaceProject(state, {
    ...project,
    storyPlan,
    selectedPageBeatId: storyPlan.pageBeats[0]?.id ?? null,
    planningChatHistory: [
      ...project.planningChatHistory,
      createPlanningMessage(
        `I created a suggested ${pageCount}-page draft from your saved concept and creative direction. Every beat is editable, and no image generation has occurred.`,
      ),
    ],
  });
}

export function selectProjectPage(state: PersistedStudioState, pageBeatId: string) {
  const project = selectedProject(state);
  return project
    ? replaceProject(state, { ...project, selectedPageBeatId: pageBeatId })
    : state;
}

export function openProjectPageCreation(
  state: PersistedStudioState,
  pageBeatId: string,
) {
  const project = selectedProject(state);
  if (!project?.storyPlan || !canOpenPageCreation(project.storyPlan, pageBeatId)) return state;
  const preparedProject = preparePageCreation(project, pageBeatId);
  return {
    ...replaceProject(state, { ...preparedProject, selectedPageBeatId: pageBeatId }),
    activeView: "page_creation" as const,
  };
}

export function navigateProjectPageCreation(
  state: PersistedStudioState,
  direction: "previous" | "next",
) {
  const project = selectedProject(state);
  if (!project?.storyPlan || !project.selectedPageBeatId) return state;
  const nextPageId = getAdjacentPageBeatId(
    project.storyPlan,
    project.selectedPageBeatId,
    direction,
  );
  if (!nextPageId) return state;
  const nextProject = preparePageCreation(project, nextPageId);
  return {
    ...replaceProject(state, { ...nextProject, selectedPageBeatId: nextPageId }),
    activeView: "page_creation" as const,
  };
}

function updateSelectedPageCreation(
  state: PersistedStudioState,
  pageBeatId: string,
  updater: (creation: PageBeat["creation"]) => PageBeat["creation"],
  refreshPrompt = true,
) {
  const project = selectedProject(state);
  return project
    ? replaceProject(
        state,
        updateProjectPageCreation(project, pageBeatId, updater, refreshPrompt),
      )
    : state;
}

export function updateProjectPageCreativeSettings(
  state: PersistedStudioState,
  pageBeatId: string,
  updates: Partial<PageCreativeSettings>,
) {
  return updateSelectedPageCreation(state, pageBeatId, (creation) =>
    creation.approvedImageVersionId
      ? creation
      : { ...creation, settings: { ...creation.settings, ...updates } },
  );
}

export function saveProjectPagePrompt(
  state: PersistedStudioState,
  pageBeatId: string,
  prompt: string,
) {
  return updateSelectedPageCreation(state, pageBeatId, (creation) =>
    creation.approvedImageVersionId ? creation : saveEditedPrompt(creation, prompt),
  );
}

export function resetProjectPagePrompt(state: PersistedStudioState, pageBeatId: string) {
  return updateSelectedPageCreation(state, pageBeatId, (creation) =>
    creation.approvedImageVersionId ? creation : resetEditedPrompt(creation),
  );
}

export function addProjectPageReference(
  state: PersistedStudioState,
  pageBeatId: string,
  reference: Pick<VisualReferenceMetadata, "title" | "url" | "description" | "purpose">,
) {
  return updateSelectedPageCreation(state, pageBeatId, (creation) =>
    creation.approvedImageVersionId
      ? creation
      : addVisualReference(creation, pageBeatId, reference),
  );
}

export function removeProjectPageReference(
  state: PersistedStudioState,
  pageBeatId: string,
  referenceId: string,
) {
  return updateSelectedPageCreation(state, pageBeatId, (creation) =>
    creation.approvedImageVersionId
      ? creation
      : removeVisualReference(creation, referenceId),
  );
}

export function addProjectPageInstruction(
  state: PersistedStudioState,
  pageBeatId: string,
  instruction: string,
) {
  const note = instruction.trim();
  if (!note) return state;
  return updateSelectedPageCreation(state, pageBeatId, (creation) =>
    creation.approvedImageVersionId
      ? creation
      : {
          ...creation,
          settings: {
            ...creation.settings,
            additionalInstructions: [creation.settings.additionalInstructions, note]
              .filter(Boolean)
              .join("\n"),
          },
          chatHistory: [
            ...creation.chatHistory,
            createPageChatMessage("user", note),
            createPageChatMessage(
              "assistant",
              "Saved verbatim as an additional instruction for this page. The prepared automatic prompt now includes it.",
            ),
          ],
        },
  );
}

export function markPageGenerationStarted(
  state: PersistedStudioState,
  projectId: string,
  pageBeatId: string,
) {
  const project = state.projects.find((candidate) => candidate.id === projectId);
  return project
    ? replaceProject(
        state,
        updateProjectPageCreation(
          project,
          pageBeatId,
          (creation) => ({ ...creation, illustrationStatus: "generating" }),
          false,
        ),
      )
    : state;
}

export function appendPageGenerationResult(
  state: PersistedStudioState,
  projectId: string,
  pageBeatId: string,
  versions: ImageVersion[],
  batchNumber: number,
) {
  const project = state.projects.find((candidate) => candidate.id === projectId);
  return project
    ? replaceProject(
        state,
        updateProjectPageCreation(
          project,
          pageBeatId,
          (creation) => {
            const nextCreation = appendImageGenerationBatch(creation, versions);
            return {
              ...nextCreation,
              chatHistory: [
                ...nextCreation.chatHistory,
                createPageChatMessage(
                  "assistant",
                  batchNumber === 1
                    ? "Three prototype visual directions are ready. Choose the composition you'd like to develop further."
                    : "I created another set of prototype visual directions while keeping your earlier versions available.",
                ),
              ],
            };
          },
          false,
        ),
      )
    : state;
}

export function restorePageAfterGenerationFailure(
  state: PersistedStudioState,
  projectId: string,
  pageBeatId: string,
) {
  const project = state.projects.find((candidate) => candidate.id === projectId);
  return project
    ? replaceProject(
        state,
        updateProjectPageCreation(
          project,
          pageBeatId,
          (creation) => {
            return {
              ...creation,
              illustrationStatus: getRestingIllustrationStatus(creation),
              chatHistory: [
                ...creation.chatHistory,
                createPageChatMessage(
                  "assistant",
                  "The prototype visual service couldn't prepare this set. Your prompt and earlier versions are unchanged.",
                ),
              ],
            };
          },
          false,
        ),
      )
    : state;
}

export function restorePageAfterVisualJob(
  state: PersistedStudioState,
  projectId: string,
  pageBeatId: string,
) {
  const project = state.projects.find((candidate) => candidate.id === projectId);
  return project
    ? replaceProject(
        state,
        updateProjectPageCreation(
          project,
          pageBeatId,
          (creation) => ({
            ...creation,
            illustrationStatus: getRestingIllustrationStatus(creation),
          }),
          false,
        ),
      )
    : state;
}

export function markPageRefinementStarted(
  state: PersistedStudioState,
  projectId: string,
  pageBeatId: string,
) {
  const project = state.projects.find((candidate) => candidate.id === projectId);
  return project
    ? replaceProject(
        state,
        updateProjectPageCreation(
          project,
          pageBeatId,
          (creation) => ({ ...creation, illustrationStatus: "refining" }),
          false,
        ),
      )
    : state;
}

export function selectProjectPageImageVersion(
  state: PersistedStudioState,
  pageBeatId: string,
  versionId: string,
) {
  const project = selectedProject(state);
  const page = project?.storyPlan?.pageBeats.find((candidate) => candidate.id === pageBeatId);
  const version = page?.creation.imageVersions.find((candidate) => candidate.id === versionId);
  if (!project || !version || page?.creation.approvedImageVersionId) return state;
  return replaceProject(
    state,
    updateProjectPageCreation(
      project,
      pageBeatId,
      (creation) => {
        const selectedCreation = selectImageVersion(creation, versionId);
        return {
          ...selectedCreation,
          chatHistory: [
            ...selectedCreation.chatHistory,
            createPageChatMessage(
              "assistant",
              `${version.optionLabel} is now your selected direction. We can refine this prototype visual next.`,
            ),
          ],
        };
      },
      false,
    ),
  );
}

export function appendPageRefinementResult(
  state: PersistedStudioState,
  projectId: string,
  pageBeatId: string,
  child: ImageVersion,
  refinementInstruction: string,
) {
  const project = state.projects.find((candidate) => candidate.id === projectId);
  return project
    ? replaceProject(
        state,
        updateProjectPageCreation(
          project,
          pageBeatId,
          (creation) => {
            if (creation.approvedImageVersionId) return creation;
            const nextCreation = appendRefinedImageVersion(creation, child);
            return {
              ...nextCreation,
              chatHistory: [
                ...nextCreation.chatHistory,
                createPageChatMessage("user", refinementInstruction),
                createPageChatMessage(
                  "assistant",
                  "I created a new prototype version from your selected direction. The original remains available in version history.",
                ),
              ],
            };
          },
          false,
        ),
      )
    : state;
}

export function approveProjectPageIllustration(
  state: PersistedStudioState,
  pageBeatId: string,
) {
  const project = selectedProject(state);
  const page = project?.storyPlan?.pageBeats.find((candidate) => candidate.id === pageBeatId);
  if (!project || !page) return state;
  const creation = normalizePageCreationState(page.creation);
  if (!creation.imageVersions.some((version) => version.selected)) return state;
  const approvedCreation = approveSelectedImageVersion(creation);
  return replaceProject(
    state,
    updateProjectPageCreation(
      project,
      pageBeatId,
      () => ({
        ...approvedCreation,
        chatHistory: [
          ...approvedCreation.chatHistory,
          createPageChatMessage(
            "assistant",
            `Page ${page.order} is approved. You can move to the next page whenever you're ready.`,
          ),
        ],
      }),
      false,
    ),
  );
}

export function reopenProjectPageIllustration(
  state: PersistedStudioState,
  pageBeatId: string,
) {
  const project = selectedProject(state);
  const page = project?.storyPlan?.pageBeats.find((candidate) => candidate.id === pageBeatId);
  if (!project || !page?.creation.approvedImageVersionId) return state;
  return replaceProject(
    state,
    updateProjectPageCreation(
      project,
      pageBeatId,
      (creation) => {
        const reopened = reopenIllustrationDevelopment(creation);
        return {
          ...reopened,
          chatHistory: [
            ...reopened.chatHistory,
            createPageChatMessage(
              "assistant",
              "This page is back in visual development. The previously approved version remains in history and approval will be required again.",
            ),
          ],
        };
      },
      false,
    ),
  );
}

export function updateSelectedProjectPageBeat(
  state: PersistedStudioState,
  pageBeatId: string,
  updates: Partial<
    Pick<
      PageBeat,
      "title" | "description" | "visualDirection" | "narration" | "dialogue" | "optionalActLabel"
    >
  >,
) {
  const project = selectedProject(state);
  if (!project?.storyPlan) return state;
  const wasApproved = project.storyPlan.status === "approved";
  return replaceProject(state, {
    ...project,
    storyPlan: updateBeat(project.storyPlan, pageBeatId, updates),
    planningChatHistory: appendReapprovalMessage(project, wasApproved),
  });
}

export function addSelectedProjectPageBeat(state: PersistedStudioState) {
  const project = selectedProject(state);
  if (!project?.storyPlan) return state;
  const wasApproved = project.storyPlan.status === "approved";
  const storyPlan = addBeat(project.storyPlan, project.selectedPageBeatId);
  if (storyPlan === project.storyPlan) return state;
  const addedPage = storyPlan.pageBeats.find(
    (page) => !project.storyPlan?.pageBeats.some((existing) => existing.id === page.id),
  );
  return replaceProject(state, {
    ...project,
    storyPlan,
    selectedPageBeatId: addedPage?.id ?? project.selectedPageBeatId,
    planningChatHistory: [
      ...appendReapprovalMessage(project, wasApproved),
      createPlanningMessage(`Added Page ${addedPage?.order ?? storyPlan.pageBeats.length} to the draft.`),
    ],
  });
}

export function deleteSelectedProjectPageBeat(
  state: PersistedStudioState,
  pageBeatId: string,
) {
  const project = selectedProject(state);
  if (!project?.storyPlan) return state;
  const wasApproved = project.storyPlan.status === "approved";
  const deletedIndex = project.storyPlan.pageBeats.findIndex((page) => page.id === pageBeatId);
  const storyPlan = deleteBeat(project.storyPlan, pageBeatId);
  const nextSelection =
    storyPlan.pageBeats[Math.min(Math.max(deletedIndex, 0), storyPlan.pageBeats.length - 1)]?.id ??
    null;
  return replaceProject(state, {
    ...project,
    storyPlan,
    selectedPageBeatId:
      project.selectedPageBeatId === pageBeatId ? nextSelection : project.selectedPageBeatId,
    planningChatHistory: appendReapprovalMessage(project, wasApproved),
  });
}

export function moveSelectedProjectPageBeat(
  state: PersistedStudioState,
  pageBeatId: string,
  direction: "up" | "down",
) {
  const project = selectedProject(state);
  if (!project?.storyPlan) return state;
  const wasApproved = project.storyPlan.status === "approved";
  const storyPlan = moveBeat(project.storyPlan, pageBeatId, direction);
  if (storyPlan === project.storyPlan) return state;
  return replaceProject(state, {
    ...project,
    storyPlan,
    planningChatHistory: appendReapprovalMessage(project, wasApproved),
  });
}

export function approveSelectedProjectStoryPlan(state: PersistedStudioState) {
  const project = selectedProject(state);
  if (!project?.storyPlan?.pageBeats.length) return state;
  const storyPlan = approvePlan(project.storyPlan);
  return replaceProject(state, {
    ...project,
    storyPlan,
    selectedPageBeatId: project.selectedPageBeatId ?? storyPlan.pageBeats[0]?.id ?? null,
    planningChatHistory: [
      ...project.planningChatHistory,
      createPlanningMessage(
        `Story plan approved. All ${storyPlan.pageBeats.length} pages are now available in the Pages workspace for prompt preparation and visual development.`,
      ),
    ],
  });
}
