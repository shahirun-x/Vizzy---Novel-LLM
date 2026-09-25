import type {
  ChatMessage,
  ImageVersion,
  PageCreationState,
  PageCreativeSettings,
  StoryPlan,
  VisualReferenceMetadata,
} from "@/types/domain";

function createId(prefix: string) {
  const uniquePart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}-${uniquePart}`;
}

export function createDefaultCreativeSettings(): PageCreativeSettings {
  return {
    cameraAngle: "Eye level",
    shotType: "Medium shot",
    lighting: "Natural soft light",
    composition: "Clear focal subject with readable foreground and background separation",
    emotionalTone: "Grounded and story-driven",
    additionalInstructions: "",
    aspectRatio: "3:4",
  };
}

export function createPageChatMessage(
  role: ChatMessage["role"],
  content: string,
): ChatMessage {
  return {
    id: createId("page-message"),
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

export function createDefaultPageCreationState(): PageCreationState {
  const now = new Date().toISOString();
  return {
    illustrationStatus: "not_started",
    settings: createDefaultCreativeSettings(),
    prompt: {
      automaticPrompt: "",
      editedPrompt: null,
      mode: "automatic",
      updatedAt: now,
    },
    references: [],
    chatHistory: [],
    imageVersions: [],
  };
}

export function normalizePageCreationState(
  value: Partial<PageCreationState> | null | undefined,
): PageCreationState {
  const fallback = createDefaultPageCreationState();
  const settings = { ...fallback.settings, ...value?.settings };
  const imageVersions = Array.isArray(value?.imageVersions)
    ? value.imageVersions.map((version, index) => ({
        ...version,
        parentVersionId: version.parentVersionId ?? null,
        generationBatchId: version.generationBatchId || "legacy-batch-1",
        batchNumber: version.batchNumber ?? 1,
        optionIndex: version.optionIndex ?? (index % 3) + 1,
        optionLabel: version.optionLabel ?? `Option ${String.fromCharCode(65 + (index % 3))}`,
        aspectRatio: version.aspectRatio ?? settings.aspectRatio,
        compositionDirection:
          version.compositionDirection ?? "Saved prototype visual direction.",
        visualSeed: version.visualSeed ?? `legacy-${version.id}`,
      }))
    : [];

  return {
    ...fallback,
    ...value,
    settings,
    prompt: { ...fallback.prompt, ...value?.prompt },
    references: Array.isArray(value?.references) ? value.references : [],
    chatHistory: Array.isArray(value?.chatHistory) ? value.chatHistory : [],
    imageVersions,
  };
}

export interface ImageGenerationBatch {
  id: string;
  batchNumber: number;
  createdAt: string;
  versions: ImageVersion[];
}

export function getImageGenerationBatches(imageVersions: ImageVersion[]) {
  const batches = new Map<string, ImageGenerationBatch>();
  for (const version of imageVersions) {
    const existing = batches.get(version.generationBatchId);
    if (existing) {
      existing.versions.push(version);
      continue;
    }
    batches.set(version.generationBatchId, {
      id: version.generationBatchId,
      batchNumber: version.batchNumber,
      createdAt: version.createdAt,
      versions: [version],
    });
  }

  return [...batches.values()]
    .map((batch) => ({
      ...batch,
      versions: [...batch.versions].sort((a, b) => a.optionIndex - b.optionIndex),
    }))
    .sort((a, b) => b.batchNumber - a.batchNumber);
}

export function appendImageGenerationBatch(
  creation: PageCreationState,
  versions: ImageVersion[],
): PageCreationState {
  const hasSelection = creation.imageVersions.some((version) => version.selected);
  return {
    ...creation,
    illustrationStatus: hasSelection ? "direction_selected" : "options_ready",
    imageVersions: [...creation.imageVersions, ...versions],
  };
}

export function selectImageVersion(
  creation: PageCreationState,
  versionId: string,
): PageCreationState {
  if (!creation.imageVersions.some((version) => version.id === versionId)) return creation;

  return {
    ...creation,
    illustrationStatus: "direction_selected",
    imageVersions: creation.imageVersions.map((version) => {
      const selected = version.id === versionId;
      return {
        ...version,
        selected,
        status: selected ? "selected" : "generated",
      };
    }),
  };
}

export function saveEditedPrompt(
  creation: PageCreationState,
  prompt: string,
): PageCreationState {
  return {
    ...creation,
    illustrationStatus: creation.imageVersions.some((version) => version.selected)
      ? "direction_selected"
      : "prompt_ready",
    prompt: {
      ...creation.prompt,
      editedPrompt: prompt.trim(),
      mode: "edited",
      updatedAt: new Date().toISOString(),
    },
  };
}

export function resetEditedPrompt(creation: PageCreationState): PageCreationState {
  return {
    ...creation,
    prompt: {
      ...creation.prompt,
      editedPrompt: null,
      mode: "automatic",
      updatedAt: new Date().toISOString(),
    },
  };
}

export function addVisualReference(
  creation: PageCreationState,
  pageId: string,
  reference: Pick<VisualReferenceMetadata, "title" | "url" | "description" | "purpose">,
): PageCreationState {
  return {
    ...creation,
    references: [
      ...creation.references,
      {
        ...reference,
        id: createId("reference"),
        pageId,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

export function removeVisualReference(
  creation: PageCreationState,
  referenceId: string,
): PageCreationState {
  return {
    ...creation,
    references: creation.references.filter((reference) => reference.id !== referenceId),
  };
}

export function getAdjacentPageBeatId(
  plan: StoryPlan,
  currentPageBeatId: string,
  direction: "previous" | "next",
) {
  const orderedPages = [...plan.pageBeats].sort((a, b) => a.order - b.order);
  const currentIndex = orderedPages.findIndex((page) => page.id === currentPageBeatId);
  const nextIndex = direction === "previous" ? currentIndex - 1 : currentIndex + 1;
  return orderedPages[nextIndex]?.id ?? null;
}

export function canOpenPageCreation(plan: StoryPlan | null, pageBeatId: string) {
  return Boolean(
    plan?.status === "approved" &&
      plan.pageBeats.some((page) => page.id === pageBeatId && page.status === "approved"),
  );
}
