import type {
  ImageVersion,
  PageAspectRatio,
  VisualReferenceMetadata,
  VisualStyleBible,
} from "@/types/domain";

export interface GeneratePageImagesRequest {
  projectId: string;
  pageId: string;
  prompt: string;
  aspectRatio: PageAspectRatio;
  optionCount: number;
  batchNumber: number;
  styleBible: VisualStyleBible;
  references: VisualReferenceMetadata[];
}

export type ImageGenerationErrorCode =
  | "INVALID_REQUEST"
  | "GENERATION_FAILED"
  | "CANCELLED"
  | "NOT_IMPLEMENTED";

export class ImageGenerationError extends Error {
  constructor(
    public readonly code: ImageGenerationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImageGenerationError";
  }
}

export interface RefinePageImageRequest {
  projectId: string;
  pageId: string;
  parentVersion: ImageVersion;
  refinementInstructions: string;
  refinementSequence: number;
  styleBible: VisualStyleBible;
  references: VisualReferenceMetadata[];
}

export interface ImageGenerationResult {
  generationBatchId: string;
  versions: ImageVersion[];
}

export interface ImageGenerationCallOptions {
  signal?: AbortSignal;
}

/** Provider boundary for future initial, multi-option, reference-aware, and refinement workflows. */
export interface ImageGenerationService {
  generate(
    request: GeneratePageImagesRequest,
    options?: ImageGenerationCallOptions,
  ): Promise<ImageGenerationResult>;
  refine(
    request: RefinePageImageRequest,
    options?: ImageGenerationCallOptions,
  ): Promise<ImageGenerationResult>;
}
