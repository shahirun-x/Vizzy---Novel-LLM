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
    approvedImageVersionId: null,
    illustrationApprovedAt: null,
  };
}

export function normalizePageCreationState(
  value: Partial<PageCreationState> | null | undefined,
): PageCreationState {
  const fallback = createDefaultPageCreationState();
  const settings = { ...fallback.settings, ...value?.settings };
  const baseVersions = Array.isArray(value?.imageVersions)
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
        generationSource:
          version.generationSource ?? (version.parentVersionId ? "refinement" : "generated"),
        refinementInstruction: version.refinementInstruction ?? null,
        refinementDepth: version.refinementDepth ?? (version.parentVersionId ? 1 : 0),
        refinementSequence: version.refinementSequence ?? (version.parentVersionId ? index + 1 : 0),
      }))
    : [];
  const versionLookup = new Map(baseVersions.map((version) => [version.id, version]));
  function findRootVersionId(version: (typeof baseVersions)[number]) {
    if (version.rootVersionId) return version.rootVersionId;
    let current = version;
    const visited = new Set<string>();
    while (current.parentVersionId && !visited.has(current.id)) {
      visited.add(current.id);
      const parent = versionLookup.get(current.parentVersionId);
      if (!parent) break;
      current = parent;
    }
    return current.id;
  }
  const imageVersions = baseVersions.map((version) => ({
    ...version,
    rootVersionId: findRootVersionId(version),
  }));
  const approvedImageVersionId = imageVersions.some(
    (version) => version.id === value?.approvedImageVersionId,
  )
    ? (value?.approvedImageVersionId ?? null)
    : null;

  return {
    ...fallback,
    ...value,
    settings,
    prompt: { ...fallback.prompt, ...value?.prompt },
    references: Array.isArray(value?.references) ? value.references : [],
    chatHistory: Array.isArray(value?.chatHistory) ? value.chatHistory : [],
    imageVersions,
    approvedImageVersionId,
    illustrationApprovedAt: approvedImageVersionId
      ? (value?.illustrationApprovedAt ?? null)
      : null,
    illustrationStatus: approvedImageVersionId
      ? "illustration_approved"
      : value?.illustrationStatus === "approved"
        ? "direction_selected"
        : (value?.illustrationStatus ?? fallback.illustrationStatus),
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
  for (const version of imageVersions.filter(
    (candidate) => candidate.generationSource === "generated",
  )) {
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
  const selectedVersion = creation.imageVersions.find((version) => version.selected);
  return {
    ...creation,
    illustrationStatus: creation.approvedImageVersionId
      ? "illustration_approved"
      : selectedVersion?.generationSource === "refinement"
        ? "refining"
        : selectedVersion
          ? "direction_selected"
          : "options_ready",
    imageVersions: [...creation.imageVersions, ...versions],
  };
}

export function appendRefinedImageVersion(
  creation: PageCreationState,
  child: ImageVersion,
): PageCreationState {
  if (
    child.generationSource !== "refinement" ||
    !child.parentVersionId ||
    !creation.imageVersions.some(
      (version) => version.id === child.parentVersionId && version.pageId === child.pageId,
    ) ||
    creation.imageVersions.some((version) => version.id === child.id)
  ) {
    return creation;
  }

  return {
    ...creation,
    illustrationStatus: creation.approvedImageVersionId
      ? "illustration_approved"
      : "refining",
    imageVersions: [
      ...creation.imageVersions.map((version) => ({
        ...version,
        selected: false,
        status:
          version.id === creation.approvedImageVersionId
            ? ("approved" as const)
            : ("generated" as const),
      })),
      { ...child, selected: true, status: "selected" },
    ],
  };
}

export function selectImageVersion(
  creation: PageCreationState,
  versionId: string,
): PageCreationState {
  if (!creation.imageVersions.some((version) => version.id === versionId)) return creation;

  return {
    ...creation,
    illustrationStatus: creation.approvedImageVersionId
      ? "illustration_approved"
      : creation.imageVersions.find((version) => version.id === versionId)
            ?.generationSource === "refinement"
        ? "refining"
        : "direction_selected",
    imageVersions: creation.imageVersions.map((version) => {
      const selected = version.id === versionId;
      return {
        ...version,
        selected,
        status:
          version.id === creation.approvedImageVersionId
            ? "approved"
            : selected
              ? "selected"
              : "generated",
      };
    }),
  };
}

export function approveSelectedImageVersion(
  creation: PageCreationState,
  approvedAt = new Date().toISOString(),
): PageCreationState {
  const selectedVersion = creation.imageVersions.find((version) => version.selected);
  if (!selectedVersion) return creation;

  return {
    ...creation,
    illustrationStatus: "illustration_approved",
    approvedImageVersionId: selectedVersion.id,
    illustrationApprovedAt: approvedAt,
    imageVersions: creation.imageVersions.map((version) => ({
      ...version,
      status: version.id === selectedVersion.id ? "approved" : "generated",
    })),
  };
}

export function reopenIllustrationDevelopment(
  creation: PageCreationState,
): PageCreationState {
  if (!creation.approvedImageVersionId) return creation;
  const selectedVersion = creation.imageVersions.find((version) => version.selected);
  return {
    ...creation,
    approvedImageVersionId: null,
    illustrationApprovedAt: null,
    illustrationStatus:
      selectedVersion?.generationSource === "refinement" ? "refining" : "direction_selected",
    imageVersions: creation.imageVersions.map((version) => ({
      ...version,
      status: version.selected ? "selected" : "generated",
    })),
  };
}

export interface ImageVersionLineageNode {
  version: ImageVersion;
  children: ImageVersionLineageNode[];
}

export function getImageVersionLineage(imageVersions: ImageVersion[]) {
  const nodes = new Map<string, ImageVersionLineageNode>(
    imageVersions.map((version) => [version.id, { version, children: [] }]),
  );
  const roots: ImageVersionLineageNode[] = [];
  for (const version of imageVersions) {
    const node = nodes.get(version.id);
    if (!node) continue;
    const parent = version.parentVersionId ? nodes.get(version.parentVersionId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortNodes = (items: ImageVersionLineageNode[]) => {
    items.sort((a, b) =>
      a.version.batchNumber - b.version.batchNumber ||
      a.version.optionIndex - b.version.optionIndex ||
      a.version.refinementSequence - b.version.refinementSequence,
    );
    items.forEach((item) => sortNodes(item.children));
  };
  sortNodes(roots);
  return roots;
}

export function getIllustrationProgress(plan: StoryPlan | null) {
  const pages = plan?.pageBeats ?? [];
  const approved = pages.filter(
    (page) => normalizePageCreationState(page.creation).approvedImageVersionId,
  ).length;
  return { approved, total: pages.length, complete: pages.length > 0 && approved === pages.length };
}

export function getRestingIllustrationStatus(creation: PageCreationState) {
  if (creation.approvedImageVersionId) return "illustration_approved" as const;
  const selectedVersion = creation.imageVersions.find((version) => version.selected);
  if (selectedVersion?.generationSource === "refinement") return "refining" as const;
  if (selectedVersion) return "direction_selected" as const;
  if (creation.imageVersions.length) return "options_ready" as const;
  return creation.prompt.automaticPrompt.trim() || creation.prompt.editedPrompt?.trim()
    ? ("prompt_ready" as const)
    : ("not_started" as const);
}

export function saveEditedPrompt(
  creation: PageCreationState,
  prompt: string,
): PageCreationState {
  const selectedVersion = creation.imageVersions.find((version) => version.selected);
  return {
    ...creation,
    illustrationStatus:
      selectedVersion?.generationSource === "refinement"
        ? "refining"
        : selectedVersion
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
