"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { answerOnboardingQuestion, createProject } from "@/lib/onboarding";
import { buildIllustrationPrompt } from "@/lib/illustration-prompt";
import {
  addVisualReference,
  appendImageGenerationBatch,
  canOpenPageCreation,
  createPageChatMessage,
  getAdjacentPageBeatId,
  getImageGenerationBatches,
  normalizePageCreationState,
  removeVisualReference,
  resetEditedPrompt,
  saveEditedPrompt,
  selectImageVersion,
} from "@/lib/page-creation";
import {
  EMPTY_STUDIO_STATE,
  parseStudioSnapshot,
  type PersistedStudioState,
  type StudioView,
} from "@/lib/project-storage";
import {
  addPageBeat as addBeat,
  approveStoryPlan as approvePlan,
  createPlanningMessage,
  deletePageBeat as deleteBeat,
  generateStoryPlan as generatePlan,
  movePageBeat as moveBeat,
  updatePageBeat as updateBeat,
} from "@/lib/story-planner";
import { ImageGenerationError } from "@/services/image-generation";
import { MockImageGenerationService } from "@/services/mock-image-generation";
import type {
  PageBeat,
  PageCreativeSettings,
  Project,
  VisualReferenceMetadata,
  VisualStyleBible,
} from "@/types/domain";

export type { StudioView } from "@/lib/project-storage";

const STORAGE_KEY = "vizzy:studio-state";
const STORE_EVENT = "vizzy:studio-state-change";
const EMPTY_SNAPSHOT = JSON.stringify(EMPTY_STUDIO_STATE);
const imageGenerationService = new MockImageGenerationService();

function subscribe(listener: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(STORE_EVENT, listener);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(STORE_EVENT, listener);
  };
}

function getClientSnapshot() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? EMPTY_SNAPSHOT;
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

function getServerSnapshot() {
  return EMPTY_SNAPSHOT;
}

function writeState(state: PersistedStudioState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event(STORE_EVENT));
  } catch {
    // localStorage is the prototype persistence layer; unavailable storage leaves the UI unchanged.
  }
}

function replaceProject(state: PersistedStudioState, project: Project): PersistedStudioState {
  return {
    ...state,
    projects: state.projects.map((candidate) =>
      candidate.id === project.id ? project : candidate,
    ),
  };
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

function updateProjectPageCreation(
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
        const creation = updater(normalizePageCreationState(page.creation));
        const preparedPage = { ...page, creation };
        const automaticPrompt = refreshPrompt
          ? buildIllustrationPrompt(project, preparedPage)
          : creation.prompt.automaticPrompt;
        return {
          ...preparedPage,
          creation: {
            ...creation,
            illustrationStatus:
              refreshPrompt && creation.illustrationStatus === "not_started"
                ? ("prompt_ready" as const)
                : creation.illustrationStatus,
            prompt: {
              ...creation.prompt,
              automaticPrompt,
              updatedAt: refreshPrompt
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
  return project.storyPlan?.pageBeats.reduce(
    (current, page) => updateProjectPageCreation(current, page.id, (creation) => creation),
    project,
  ) ?? project;
}

export function useProjectStore() {
  const snapshot = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const state = useMemo(() => parseStudioSnapshot(snapshot), [snapshot]);
  const selectedProject =
    state.projects.find((project) => project.id === state.selectedProjectId) ?? null;

  const updateState = useCallback(
    (updater: (current: PersistedStudioState) => PersistedStudioState) => {
      writeState(updater(parseStudioSnapshot(getClientSnapshot())));
    },
    [],
  );

  const addProject = useCallback(() => {
    const project = createProject();
    updateState((current) => ({
      ...current,
      version: 4,
      projects: [...current.projects, project],
      selectedProjectId: project.id,
      activeView: "story",
    }));
  }, [updateState]);

  const selectProject = useCallback(
    (projectId: string) => {
      updateState((current) => ({
        ...current,
        selectedProjectId: projectId,
        activeView: "story",
      }));
    },
    [updateState],
  );

  const setActiveView = useCallback(
    (activeView: StudioView) => {
      updateState((current) => {
        if (activeView !== "planning" || !current.selectedProjectId) {
          return { ...current, activeView };
        }

        return {
          ...current,
          activeView,
          projects: current.projects.map((project) => {
            if (project.id !== current.selectedProjectId || project.planningChatHistory.length) {
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
      });
    },
    [updateState],
  );

  const submitOnboardingAnswer = useCallback(
    (answer: string) => {
      if (!state.selectedProjectId) return;

      updateState((current) => ({
        ...current,
        projects: current.projects.map((project) =>
          project.id === current.selectedProjectId
            ? answerOnboardingQuestion(project, answer)
            : project,
        ),
      }));
    },
    [state.selectedProjectId, updateState],
  );

  const updateStyleBible = useCallback(
    (updates: Partial<Omit<VisualStyleBible, "projectId">>) => {
      updateState((current) => ({
        ...current,
        projects: current.projects.map((project) => {
          if (project.id !== current.selectedProjectId) return project;

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
                        description: characterDescriptions,
                      },
                    ]
                  : [],
          };
          return refreshProjectPrompts(nextProject);
        }),
      }));
    },
    [updateState],
  );

  const generateStoryPlan = useCallback(
    (pageCount: number) => {
      updateState((current) => {
        const project = current.projects.find(
          (candidate) => candidate.id === current.selectedProjectId,
        );
        if (!project || project.onboarding.status !== "complete") return current;

        const storyPlan = generatePlan(project, pageCount);
        return replaceProject(current, {
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
      });
    },
    [updateState],
  );

  const selectPageBeat = useCallback(
    (pageBeatId: string) => {
      updateState((current) => {
        const project = current.projects.find(
          (candidate) => candidate.id === current.selectedProjectId,
        );
        return project
          ? replaceProject(current, { ...project, selectedPageBeatId: pageBeatId })
          : current;
      });
    },
    [updateState],
  );

  const openPageCreation = useCallback(
    (pageBeatId: string) => {
      updateState((current) => {
        const project = current.projects.find(
          (candidate) => candidate.id === current.selectedProjectId,
        );
        if (!project?.storyPlan || !canOpenPageCreation(project.storyPlan, pageBeatId)) {
          return current;
        }

        const preparedProject = preparePageCreation(project, pageBeatId);
        return {
          ...replaceProject(current, {
            ...preparedProject,
            selectedPageBeatId: pageBeatId,
          }),
          activeView: "page_creation",
        };
      });
    },
    [updateState],
  );

  const navigatePageCreation = useCallback(
    (direction: "previous" | "next") => {
      updateState((current) => {
        const project = current.projects.find(
          (candidate) => candidate.id === current.selectedProjectId,
        );
        if (!project?.storyPlan || !project.selectedPageBeatId) return current;
        const nextPageId = getAdjacentPageBeatId(
          project.storyPlan,
          project.selectedPageBeatId,
          direction,
        );
        if (!nextPageId) return current;
        const nextProject = preparePageCreation(project, nextPageId);
        return {
          ...replaceProject(current, { ...nextProject, selectedPageBeatId: nextPageId }),
          activeView: "page_creation",
        };
      });
    },
    [updateState],
  );

  const updatePageCreativeSettings = useCallback(
    (pageBeatId: string, updates: Partial<PageCreativeSettings>) => {
      updateState((current) => {
        const project = current.projects.find(
          (candidate) => candidate.id === current.selectedProjectId,
        );
        if (!project) return current;
        return replaceProject(
          current,
          updateProjectPageCreation(project, pageBeatId, (creation) => ({
            ...creation,
            settings: { ...creation.settings, ...updates },
          })),
        );
      });
    },
    [updateState],
  );

  const savePagePrompt = useCallback(
    (pageBeatId: string, prompt: string) => {
      updateState((current) => {
        const project = current.projects.find(
          (candidate) => candidate.id === current.selectedProjectId,
        );
        return project
          ? replaceProject(
              current,
              updateProjectPageCreation(project, pageBeatId, (creation) =>
                saveEditedPrompt(creation, prompt),
              ),
            )
          : current;
      });
    },
    [updateState],
  );

  const resetPagePrompt = useCallback(
    (pageBeatId: string) => {
      updateState((current) => {
        const project = current.projects.find(
          (candidate) => candidate.id === current.selectedProjectId,
        );
        return project
          ? replaceProject(
              current,
              updateProjectPageCreation(project, pageBeatId, resetEditedPrompt),
            )
          : current;
      });
    },
    [updateState],
  );

  const addPageReference = useCallback(
    (
      pageBeatId: string,
      reference: Pick<VisualReferenceMetadata, "title" | "url" | "description" | "purpose">,
    ) => {
      updateState((current) => {
        const project = current.projects.find(
          (candidate) => candidate.id === current.selectedProjectId,
        );
        return project
          ? replaceProject(
              current,
              updateProjectPageCreation(project, pageBeatId, (creation) =>
                addVisualReference(creation, pageBeatId, reference),
              ),
            )
          : current;
      });
    },
    [updateState],
  );

  const removePageReference = useCallback(
    (pageBeatId: string, referenceId: string) => {
      updateState((current) => {
        const project = current.projects.find(
          (candidate) => candidate.id === current.selectedProjectId,
        );
        return project
          ? replaceProject(
              current,
              updateProjectPageCreation(project, pageBeatId, (creation) =>
                removeVisualReference(creation, referenceId),
              ),
            )
          : current;
      });
    },
    [updateState],
  );

  const addPageInstruction = useCallback(
    (pageBeatId: string, instruction: string) => {
      const note = instruction.trim();
      if (!note) return;
      updateState((current) => {
        const project = current.projects.find(
          (candidate) => candidate.id === current.selectedProjectId,
        );
        if (!project) return current;
        return replaceProject(
          current,
          updateProjectPageCreation(project, pageBeatId, (creation) => ({
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
          })),
        );
      });
    },
    [updateState],
  );

  const generatePageVisualOptions = useCallback(
    async (pageBeatId: string) => {
      const current = parseStudioSnapshot(getClientSnapshot());
      const project = current.projects.find(
        (candidate) => candidate.id === current.selectedProjectId,
      );
      const page = project?.storyPlan?.pageBeats.find((candidate) => candidate.id === pageBeatId);
      if (!project || !page || page.status !== "approved") {
        throw new ImageGenerationError(
          "INVALID_REQUEST",
          "Only an approved page can prepare visual options.",
        );
      }

      const creation = normalizePageCreationState(page.creation);
      const prompt =
        creation.prompt.mode === "edited"
          ? creation.prompt.editedPrompt?.trim()
          : creation.prompt.automaticPrompt.trim();
      if (!prompt) {
        throw new ImageGenerationError(
          "INVALID_REQUEST",
          "Prepare the page prompt before generating visual options.",
        );
      }

      const batches = getImageGenerationBatches(creation.imageVersions);
      const batchNumber = Math.max(0, ...batches.map((batch) => batch.batchNumber)) + 1;

      updateState((stateBeforeGeneration) => {
        const activeProject = stateBeforeGeneration.projects.find(
          (candidate) => candidate.id === project.id,
        );
        return activeProject
          ? replaceProject(
              stateBeforeGeneration,
              updateProjectPageCreation(
                activeProject,
                pageBeatId,
                (activeCreation) => ({
                  ...activeCreation,
                  illustrationStatus: "generating",
                }),
                false,
              ),
            )
          : stateBeforeGeneration;
      });

      try {
        const result = await imageGenerationService.generate({
          projectId: project.id,
          pageId: page.id,
          prompt,
          aspectRatio: creation.settings.aspectRatio,
          optionCount: 3,
          batchNumber,
          styleBible: project.styleBible,
          references: creation.references,
        });

        updateState((stateAfterGeneration) => {
          const activeProject = stateAfterGeneration.projects.find(
            (candidate) => candidate.id === project.id,
          );
          if (!activeProject) return stateAfterGeneration;
          return replaceProject(
            stateAfterGeneration,
            updateProjectPageCreation(
              activeProject,
              pageBeatId,
              (activeCreation) => {
                const nextCreation = appendImageGenerationBatch(activeCreation, result.versions);
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
          );
        });
      } catch (error) {
        updateState((stateAfterError) => {
          const activeProject = stateAfterError.projects.find(
            (candidate) => candidate.id === project.id,
          );
          if (!activeProject) return stateAfterError;
          return replaceProject(
            stateAfterError,
            updateProjectPageCreation(
              activeProject,
              pageBeatId,
              (activeCreation) => ({
                ...activeCreation,
                illustrationStatus: activeCreation.imageVersions.some(
                  (version) => version.selected,
                )
                  ? "direction_selected"
                  : activeCreation.imageVersions.length
                    ? "options_ready"
                    : "prompt_ready",
                chatHistory: [
                  ...activeCreation.chatHistory,
                  createPageChatMessage(
                    "assistant",
                    "The prototype visual service couldn't prepare this set. Your prompt and earlier versions are unchanged.",
                  ),
                ],
              }),
              false,
            ),
          );
        });
        throw error instanceof ImageGenerationError
          ? error
          : new ImageGenerationError(
              "GENERATION_FAILED",
              "The prototype visual service could not prepare this set.",
            );
      }
    },
    [updateState],
  );

  const selectPageImageVersion = useCallback(
    (pageBeatId: string, versionId: string) => {
      updateState((current) => {
        const project = current.projects.find(
          (candidate) => candidate.id === current.selectedProjectId,
        );
        const page = project?.storyPlan?.pageBeats.find(
          (candidate) => candidate.id === pageBeatId,
        );
        const version = page?.creation.imageVersions.find(
          (candidate) => candidate.id === versionId,
        );
        if (!project || !version) return current;

        return replaceProject(
          current,
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
      });
    },
    [updateState],
  );

  const updatePageBeat = useCallback(
    (
      pageBeatId: string,
      updates: Partial<
        Pick<
          PageBeat,
          "title" | "description" | "visualDirection" | "narration" | "dialogue" | "optionalActLabel"
        >
      >,
    ) => {
      updateState((current) => {
        const project = current.projects.find(
          (candidate) => candidate.id === current.selectedProjectId,
        );
        if (!project?.storyPlan) return current;
        const wasApproved = project.storyPlan.status === "approved";
        return replaceProject(current, {
          ...project,
          storyPlan: updateBeat(project.storyPlan, pageBeatId, updates),
          planningChatHistory: appendReapprovalMessage(project, wasApproved),
        });
      });
    },
    [updateState],
  );

  const addPageBeat = useCallback(() => {
    updateState((current) => {
      const project = current.projects.find(
        (candidate) => candidate.id === current.selectedProjectId,
      );
      if (!project?.storyPlan) return current;
      const wasApproved = project.storyPlan.status === "approved";
      const storyPlan = addBeat(project.storyPlan, project.selectedPageBeatId);
      if (storyPlan === project.storyPlan) return current;
      const addedPage = storyPlan.pageBeats.find(
        (page) => !project.storyPlan?.pageBeats.some((existing) => existing.id === page.id),
      );

      return replaceProject(current, {
        ...project,
        storyPlan,
        selectedPageBeatId: addedPage?.id ?? project.selectedPageBeatId,
        planningChatHistory: [
          ...appendReapprovalMessage(project, wasApproved),
          createPlanningMessage(`Added Page ${addedPage?.order ?? storyPlan.pageBeats.length} to the draft.`),
        ],
      });
    });
  }, [updateState]);

  const deletePageBeat = useCallback(
    (pageBeatId: string) => {
      updateState((current) => {
        const project = current.projects.find(
          (candidate) => candidate.id === current.selectedProjectId,
        );
        if (!project?.storyPlan) return current;
        const wasApproved = project.storyPlan.status === "approved";
        const deletedIndex = project.storyPlan.pageBeats.findIndex((page) => page.id === pageBeatId);
        const storyPlan = deleteBeat(project.storyPlan, pageBeatId);
        const nextSelection =
          storyPlan.pageBeats[Math.min(Math.max(deletedIndex, 0), storyPlan.pageBeats.length - 1)]?.id ??
          null;

        return replaceProject(current, {
          ...project,
          storyPlan,
          selectedPageBeatId:
            project.selectedPageBeatId === pageBeatId
              ? nextSelection
              : project.selectedPageBeatId,
          planningChatHistory: appendReapprovalMessage(project, wasApproved),
        });
      });
    },
    [updateState],
  );

  const movePageBeat = useCallback(
    (pageBeatId: string, direction: "up" | "down") => {
      updateState((current) => {
        const project = current.projects.find(
          (candidate) => candidate.id === current.selectedProjectId,
        );
        if (!project?.storyPlan) return current;
        const wasApproved = project.storyPlan.status === "approved";
        const storyPlan = moveBeat(project.storyPlan, pageBeatId, direction);
        if (storyPlan === project.storyPlan) return current;

        return replaceProject(current, {
          ...project,
          storyPlan,
          planningChatHistory: appendReapprovalMessage(project, wasApproved),
        });
      });
    },
    [updateState],
  );

  const approveStoryPlan = useCallback(() => {
    updateState((current) => {
      const project = current.projects.find(
        (candidate) => candidate.id === current.selectedProjectId,
      );
      if (!project?.storyPlan?.pageBeats.length) return current;
      const storyPlan = approvePlan(project.storyPlan);
      return replaceProject(current, {
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
    });
  }, [updateState]);

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
    updatePageBeat,
    addPageBeat,
    deletePageBeat,
    movePageBeat,
    approveStoryPlan,
  };
}
