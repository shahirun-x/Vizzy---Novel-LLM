import {
  getImageGenerationBatches,
  normalizePageCreationState,
} from "@/lib/page-creation";
import {
  ImageGenerationError,
  type GeneratePageImagesRequest,
  type ImageGenerationResult,
  type ImageGenerationService,
  type ImageGenerationCallOptions,
  type RefinePageImageRequest,
} from "@/services/image-generation";
import type { Project } from "@/types/domain";

export interface PageGenerationOperation {
  request: GeneratePageImagesRequest;
  batchNumber: number;
}

export interface PageRefinementOperation {
  request: RefinePageImageRequest;
}

export function preparePageGeneration(
  project: Project,
  pageBeatId: string,
): PageGenerationOperation {
  const page = project.storyPlan?.pageBeats.find((candidate) => candidate.id === pageBeatId);
  if (!page || page.status !== "approved") {
    throw new ImageGenerationError(
      "INVALID_REQUEST",
      "Only an approved page can prepare visual options.",
    );
  }

  const creation = normalizePageCreationState(page.creation);
  if (creation.approvedImageVersionId) {
    throw new ImageGenerationError(
      "INVALID_REQUEST",
      "Reopen visual development before generating another set.",
    );
  }
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

  return {
    batchNumber,
    request: {
      projectId: project.id,
      pageId: page.id,
      prompt,
      aspectRatio: creation.settings.aspectRatio,
      optionCount: 3,
      batchNumber,
      styleBible: project.styleBible,
      references: creation.references,
    },
  };
}

export function preparePageRefinement(
  project: Project,
  pageBeatId: string,
  refinementInstruction: string,
): PageRefinementOperation {
  const page = project.storyPlan?.pageBeats.find((candidate) => candidate.id === pageBeatId);
  const creation = page ? normalizePageCreationState(page.creation) : null;
  const parentVersion = creation?.imageVersions.find((version) => version.selected);

  if (!page || !creation || !parentVersion) {
    throw new ImageGenerationError(
      "INVALID_REQUEST",
      "Select a visual version before creating a refinement.",
    );
  }
  if (creation.approvedImageVersionId) {
    throw new ImageGenerationError(
      "INVALID_REQUEST",
      "Reopen visual development before refining an approved illustration.",
    );
  }
  if (!refinementInstruction.trim()) {
    throw new ImageGenerationError(
      "INVALID_REQUEST",
      "Describe what you would like to change.",
    );
  }

  const rootVersionId = parentVersion.rootVersionId || parentVersion.id;
  const refinementSequence =
    Math.max(
      0,
      ...creation.imageVersions
        .filter((version) => version.rootVersionId === rootVersionId)
        .map((version) => version.refinementSequence),
    ) + 1;

  return {
    request: {
      projectId: project.id,
      pageId: page.id,
      parentVersion,
      refinementInstructions: refinementInstruction,
      refinementSequence,
      styleBible: project.styleBible,
      references: creation.references,
    },
  };
}

/** Coordinates provider calls without React, persistence, or provider-specific code. */
export class ImageGenerationOrchestrator {
  constructor(private readonly service: ImageGenerationService) {}

  generate(
    operation: PageGenerationOperation,
    options?: ImageGenerationCallOptions,
  ): Promise<ImageGenerationResult> {
    return this.service.generate(operation.request, options);
  }

  async refine(
    operation: PageRefinementOperation,
    options?: ImageGenerationCallOptions,
  ): Promise<ImageGenerationResult> {
    const result = await this.service.refine(operation.request, options);
    if (!result.versions[0]) {
      throw new ImageGenerationError(
        "GENERATION_FAILED",
        "The prototype refinement service returned no child version.",
      );
    }
    return result;
  }
}
