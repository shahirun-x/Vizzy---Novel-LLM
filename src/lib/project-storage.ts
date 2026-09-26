import type { Project } from "@/types/domain";
import { normalizePageCreationState } from "@/lib/page-creation";
import type { GenerationJob } from "@/types/generation-job";

export type StudioView =
  | "story"
  | "style_bible"
  | "characters"
  | "pages"
  | "planning"
  | "page_creation"
  | "reader";

export interface PersistedStudioState {
  version: 6;
  projects: Project[];
  selectedProjectId: string | null;
  activeView: StudioView;
  generationJobs: GenerationJob[];
}

export const EMPTY_STUDIO_STATE: PersistedStudioState = {
  version: 6,
  projects: [],
  selectedProjectId: null,
  activeView: "story",
  generationJobs: [],
};

const VALID_VIEWS = new Set<StudioView>([
  "story",
  "style_bible",
  "characters",
  "pages",
  "planning",
  "page_creation",
  "reader",
]);

function migrateProject(project: Project): Project {
  const storyPlan = project.storyPlan
    ? {
        ...project.storyPlan,
        pageBeats: project.storyPlan.pageBeats.map((page) => ({
          ...page,
          creation: normalizePageCreationState(page.creation),
        })),
      }
    : null;

  return {
    ...project,
    storyPlan,
    selectedPageBeatId: project.selectedPageBeatId ?? null,
    planningChatHistory: Array.isArray(project.planningChatHistory)
      ? project.planningChatHistory
      : [],
  };
}

export function migrateStudioState(value: unknown): PersistedStudioState {
  if (!value || typeof value !== "object") return EMPTY_STUDIO_STATE;

  const candidate = value as {
    version?: number;
    projects?: Project[];
    selectedProjectId?: unknown;
    activeView?: unknown;
    generationJobs?: unknown;
  };
  if (![1, 2, 3, 4, 5, 6].includes(candidate.version ?? -1) || !Array.isArray(candidate.projects)) {
    return EMPTY_STUDIO_STATE;
  }

  const generationJobs = Array.isArray(candidate.generationJobs)
    ? candidate.generationJobs.filter(isGenerationJob)
    : [];

  return {
    version: 6,
    projects: candidate.projects.map(migrateProject),
    selectedProjectId:
      typeof candidate.selectedProjectId === "string" ? candidate.selectedProjectId : null,
    activeView:
      typeof candidate.activeView === "string" && VALID_VIEWS.has(candidate.activeView as StudioView)
        ? (candidate.activeView as StudioView)
        : "story",
    generationJobs,
  };
}

const JOB_STATUSES = new Set([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
]);
const JOB_ERROR_CATEGORIES = new Set([
  "validation_error",
  "provider_error",
  "cancelled",
  "stale_result",
  "invalid_result",
  "persistence_error",
]);
const PAGE_ASPECT_RATIOS = new Set(["3:4", "16:9", "1:1"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function isStringOrNull(value: unknown) {
  return value === null || typeof value === "string";
}

function isGenerationJobError(value: unknown) {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  return (
    typeof value.category === "string" &&
    JOB_ERROR_CATEGORIES.has(value.category) &&
    typeof value.message === "string" &&
    isStringOrNull(value.code)
  );
}

function isRequestSnapshot(value: unknown): value is GenerationJob["requestSnapshot"] {
  if (!isRecord(value)) return false;
  const common =
    typeof value.projectId === "string" &&
    typeof value.pageId === "string" &&
    isRecord(value.styleBible) &&
    Array.isArray(value.references);
  if (!common) return false;
  if (value.operationType === "initial_generation") {
    return (
      typeof value.prompt === "string" &&
      typeof value.aspectRatio === "string" &&
      PAGE_ASPECT_RATIOS.has(value.aspectRatio) &&
      Number.isInteger(value.batchNumber) &&
      Number(value.batchNumber) >= 1 &&
      value.optionCount === 3
    );
  }
  return (
    value.operationType === "refinement" &&
    typeof value.parentVersionId === "string" &&
    typeof value.parentRootVersionId === "string" &&
    typeof value.parentPrompt === "string" &&
    typeof value.parentGenerationBatchId === "string" &&
    Number.isInteger(value.parentBatchNumber) &&
    Number(value.parentBatchNumber) >= 1 &&
    typeof value.parentAspectRatio === "string" &&
    PAGE_ASPECT_RATIOS.has(value.parentAspectRatio) &&
    Number.isInteger(value.parentRefinementDepth) &&
    Number(value.parentRefinementDepth) >= 0 &&
    typeof value.refinementInstruction === "string" &&
    Number.isInteger(value.refinementSequence) &&
    Number(value.refinementSequence) >= 1
  );
}

function isGenerationJob(value: unknown): value is GenerationJob {
  if (!isRecord(value)) return false;
  const job = value as Partial<GenerationJob>;
  const snapshot = job.requestSnapshot;
  return Boolean(
    typeof job.id === "string" &&
      typeof job.projectId === "string" &&
      typeof job.pageId === "string" &&
      (job.operationType === "initial_generation" || job.operationType === "refinement") &&
      typeof job.status === "string" &&
      JOB_STATUSES.has(job.status) &&
      typeof job.createdAt === "string" &&
      isStringOrNull(job.startedAt) &&
      isStringOrNull(job.completedAt) &&
      Number.isInteger(job.attempt) &&
      Number(job.attempt) >= 1 &&
      isStringOrNull(job.retryOfJobId) &&
      typeof job.idempotencyKey === "string" &&
      isRequestSnapshot(snapshot) &&
      snapshot.projectId === job.projectId &&
      snapshot.pageId === job.pageId &&
      snapshot.operationType === job.operationType &&
      isGenerationJobError(job.error) &&
      isStringOrNull(job.resultBatchId) &&
      Array.isArray(job.resultVersionIds) &&
      job.resultVersionIds.every((id) => typeof id === "string"),
  );
}

export function parseStudioSnapshot(snapshot: string): PersistedStudioState {
  try {
    return migrateStudioState(JSON.parse(snapshot));
  } catch {
    return EMPTY_STUDIO_STATE;
  }
}
