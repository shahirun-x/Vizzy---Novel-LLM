import type {
  PageAspectRatio,
  VisualReferenceMetadata,
  VisualStyleBible,
} from "@/types/domain";
import type { StoryDirectorRequest } from "@/types/story-director";

export type GenerationOperationType = "initial_generation" | "refinement" | "story_generation";

export type GenerationJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";

export type GenerationJobErrorCategory =
  | "validation_error"
  | "provider_error"
  | "cancelled"
  | "stale_result"
  | "invalid_result"
  | "persistence_error";

export interface GenerationJobErrorInfo {
  category: GenerationJobErrorCategory;
  message: string;
  code: string | null;
}

interface GenerationRequestContext {
  projectId: string;
  pageId: string;
  styleBible: VisualStyleBible;
  references: VisualReferenceMetadata[];
}

export interface InitialGenerationRequestSnapshot extends GenerationRequestContext {
  operationType: "initial_generation";
  prompt: string;
  aspectRatio: PageAspectRatio;
  batchNumber: number;
  optionCount: 3;
}

export interface RefinementRequestSnapshot extends GenerationRequestContext {
  operationType: "refinement";
  parentVersionId: string;
  parentRootVersionId: string;
  parentPrompt: string;
  parentGenerationBatchId: string;
  parentBatchNumber: number;
  parentAspectRatio: PageAspectRatio;
  parentRefinementDepth: number;
  refinementInstruction: string;
  refinementSequence: number;
}

export type GenerationRequestSnapshot =
  | InitialGenerationRequestSnapshot
  | RefinementRequestSnapshot
  | StoryGenerationRequestSnapshot;

export interface StoryGenerationRequestSnapshot {
  operationType: "story_generation";
  projectId: string;
  pageId: null;
  request: StoryDirectorRequest;
}

/** Serializable operation metadata. Live controllers and promises are never stored here. */
export interface GenerationJob {
  id: string;
  projectId: string;
  pageId: string | null;
  operationType: GenerationOperationType;
  status: GenerationJobStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  attempt: number;
  retryOfJobId: string | null;
  idempotencyKey: string;
  requestSnapshot: GenerationRequestSnapshot;
  error: GenerationJobErrorInfo | null;
  resultBatchId: string | null;
  resultVersionIds: string[];
  resultProjectId: string | null;
}
