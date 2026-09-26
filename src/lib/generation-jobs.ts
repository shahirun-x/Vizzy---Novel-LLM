import {
  getImageGenerationBatches,
  normalizePageCreationState,
} from "@/lib/page-creation";
import {
  appendPageGenerationResult,
  appendPageRefinementResult,
  markPageGenerationStarted,
  markPageRefinementStarted,
  restorePageAfterGenerationFailure,
  restorePageAfterVisualJob,
} from "@/lib/project-commands";
import type { PersistedStudioState } from "@/lib/project-storage";
import type {
  ImageGenerationResult,
  GeneratePageImagesRequest,
  RefinePageImageRequest,
} from "@/services/image-generation";
import type {
  PageGenerationOperation,
  PageRefinementOperation,
} from "@/services/image-generation-orchestrator";
import type { ImageVersion, Project } from "@/types/domain";
import type {
  GenerationJob,
  GenerationJobErrorCategory,
  GenerationJobErrorInfo,
  GenerationRequestSnapshot,
  InitialGenerationRequestSnapshot,
  RefinementRequestSnapshot,
} from "@/types/generation-job";

const ACTIVE_STATUSES = new Set<GenerationJob["status"]>(["queued", "running"]);
const RETRYABLE_STATUSES = new Set<GenerationJob["status"]>([
  "failed",
  "cancelled",
  "interrupted",
]);

export class GenerationJobError extends Error {
  constructor(
    public readonly category: GenerationJobErrorCategory,
    message: string,
    public readonly code: string | null = null,
  ) {
    super(message);
    this.name = "GenerationJobError";
  }
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function contextFingerprint(snapshot: GenerationRequestSnapshot) {
  return hashText(JSON.stringify(snapshot));
}

export function createInitialGenerationSnapshot(
  operation: PageGenerationOperation,
): InitialGenerationRequestSnapshot {
  const request = operation.request;
  return {
    operationType: "initial_generation",
    projectId: request.projectId,
    pageId: request.pageId,
    prompt: request.prompt,
    aspectRatio: request.aspectRatio,
    batchNumber: request.batchNumber,
    optionCount: 3,
    styleBible: { ...request.styleBible },
    references: request.references.map((reference) => ({ ...reference })),
  };
}

export function createRefinementSnapshot(
  operation: PageRefinementOperation,
): RefinementRequestSnapshot {
  const request = operation.request;
  return {
    operationType: "refinement",
    projectId: request.projectId,
    pageId: request.pageId,
    parentVersionId: request.parentVersion.id,
    parentRootVersionId: request.parentVersion.rootVersionId || request.parentVersion.id,
    parentPrompt: request.parentVersion.prompt,
    parentGenerationBatchId: request.parentVersion.generationBatchId,
    parentBatchNumber: request.parentVersion.batchNumber,
    parentAspectRatio: request.parentVersion.aspectRatio,
    parentRefinementDepth: request.parentVersion.refinementDepth,
    refinementInstruction: request.refinementInstructions,
    refinementSequence: request.refinementSequence,
    styleBible: { ...request.styleBible },
    references: request.references.map((reference) => ({ ...reference })),
  };
}

export function createQueuedGenerationJob({
  id,
  snapshot,
  createdAt,
  attempt = 1,
  retryOfJobId = null,
}: {
  id: string;
  snapshot: GenerationRequestSnapshot;
  createdAt: string;
  attempt?: number;
  retryOfJobId?: string | null;
}): GenerationJob {
  return {
    id,
    projectId: snapshot.projectId,
    pageId: snapshot.pageId,
    operationType: snapshot.operationType,
    status: "queued",
    createdAt,
    startedAt: null,
    completedAt: null,
    attempt,
    retryOfJobId,
    idempotencyKey: `${snapshot.operationType}:${snapshot.projectId}:${snapshot.pageId}:${contextFingerprint(snapshot)}`,
    requestSnapshot: snapshot,
    error: null,
    resultBatchId: null,
    resultVersionIds: [],
    resultProjectId: null,
  };
}

function updateJob(
  state: PersistedStudioState,
  jobId: string,
  updater: (job: GenerationJob) => GenerationJob,
) {
  return {
    ...state,
    generationJobs: state.generationJobs.map((job) =>
      job.id === jobId ? updater(job) : job,
    ),
  };
}

export function getGenerationJob(state: PersistedStudioState, jobId: string) {
  return state.generationJobs.find((job) => job.id === jobId) ?? null;
}

export function getLatestPageGenerationJob(
  jobs: GenerationJob[],
  projectId: string,
  pageId: string,
  operationType: GenerationJob["operationType"],
) {
  return (
    [...jobs]
      .reverse()
      .find(
        (job) =>
          job.projectId === projectId &&
          job.pageId === pageId &&
          job.operationType === operationType,
      ) ?? null
  );
}

export function registerGenerationJob(
  state: PersistedStudioState,
  job: GenerationJob,
) {
  if (state.generationJobs.some((candidate) => candidate.id === job.id)) {
    throw new GenerationJobError(
      "validation_error",
      "A visual job with this identity already exists.",
      "DUPLICATE_JOB_ID",
    );
  }
  const activeJob = state.generationJobs.find(
    (candidate) =>
      candidate.projectId === job.projectId &&
      candidate.pageId === job.pageId &&
      ACTIVE_STATUSES.has(candidate.status),
  );
  if (activeJob) {
    throw new GenerationJobError(
      "validation_error",
      activeJob.idempotencyKey === job.idempotencyKey
        ? "This visual request is already running."
        : "Another visual operation is already running for this page.",
      "DUPLICATE_ACTIVE_REQUEST",
    );
  }
  return { ...state, generationJobs: [...state.generationJobs, job] };
}

export function startGenerationJob(
  state: PersistedStudioState,
  jobId: string,
  startedAt: string,
) {
  const job = getGenerationJob(state, jobId);
  if (!job || job.status !== "queued") {
    throw new GenerationJobError(
      "validation_error",
      "Only a queued visual job can start.",
      "INVALID_JOB_TRANSITION",
    );
  }
  const withStatus = updateJob(state, jobId, (candidate) => ({
    ...candidate,
    status: "running",
    startedAt,
    error: null,
  }));
  if (job.operationType === "story_generation") return withStatus;
  return job.operationType === "initial_generation"
    ? markPageGenerationStarted(withStatus, job.projectId, job.pageId!)
    : markPageRefinementStarted(withStatus, job.projectId, job.pageId!);
}

function errorInfo(
  category: GenerationJobErrorCategory,
  message: string,
  code: string | null,
): GenerationJobErrorInfo {
  return { category, message, code };
}

export function cancelGenerationJob(
  state: PersistedStudioState,
  jobId: string,
  completedAt: string,
) {
  const job = getGenerationJob(state, jobId);
  if (!job || !ACTIVE_STATUSES.has(job.status)) return state;
  const restored = job.pageId
    ? restorePageAfterVisualJob(state, job.projectId, job.pageId)
    : state;
  return updateJob(restored, jobId, (candidate) => ({
    ...candidate,
    status: "cancelled",
    completedAt,
    error: errorInfo(
      "cancelled",
      "This visual operation was cancelled. No result was applied.",
      "CANCELLED",
    ),
  }));
}

export function failGenerationJob(
  state: PersistedStudioState,
  jobId: string,
  error: GenerationJobErrorInfo,
  completedAt: string,
) {
  const job = getGenerationJob(state, jobId);
  if (!job || !ACTIVE_STATUSES.has(job.status)) return state;
  const restored = !job.pageId
    ? state
    : error.category === "provider_error"
      ? restorePageAfterGenerationFailure(state, job.projectId, job.pageId)
      : restorePageAfterVisualJob(state, job.projectId, job.pageId);
  return updateJob(restored, jobId, (candidate) => ({
    ...candidate,
    status: "failed",
    completedAt,
    error,
  }));
}

export function recoverInterruptedGenerationJobs(
  state: PersistedStudioState,
  interruptedAt = new Date().toISOString(),
) {
  const activeJobs = state.generationJobs.filter((job) => ACTIVE_STATUSES.has(job.status));
  if (!activeJobs.length) return state;
  let restored = state;
  for (const job of activeJobs) {
    if (job.pageId) restored = restorePageAfterVisualJob(restored, job.projectId, job.pageId);
  }
  const activeIds = new Set(activeJobs.map((job) => job.id));
  return {
    ...restored,
    generationJobs: restored.generationJobs.map((job) =>
      activeIds.has(job.id)
        ? {
            ...job,
            status: "interrupted" as const,
            completedAt: interruptedAt,
            error: errorInfo(
              "persistence_error",
              "This browser-local operation was interrupted by a refresh or closed session. Retry it explicitly if the page context is still current.",
              "INTERRUPTED",
            ),
          }
        : job,
    ),
  };
}

function selectedProjectAndPage(state: PersistedStudioState, job: GenerationJob) {
  const project = state.projects.find((candidate) => candidate.id === job.projectId);
  const page = project?.storyPlan?.pageBeats.find((candidate) => candidate.id === job.pageId);
  if (!project || !page) {
    throw new GenerationJobError(
      "stale_result",
      "The project or page no longer exists, so this result was not applied.",
      "MISSING_CONTEXT",
    );
  }
  return { project, page };
}

function sameCreativeContext(
  project: Project,
  snapshot: InitialGenerationRequestSnapshot | RefinementRequestSnapshot,
  currentReferences: unknown,
) {
  return (
    JSON.stringify(project.styleBible) === JSON.stringify(snapshot.styleBible) &&
    JSON.stringify(currentReferences) === JSON.stringify(snapshot.references)
  );
}

function assertInitialContextApplicable(
  state: PersistedStudioState,
  job: GenerationJob & { requestSnapshot: InitialGenerationRequestSnapshot },
) {
  const { project, page } = selectedProjectAndPage(state, job);
  const creation = normalizePageCreationState(page.creation);
  const activePrompt =
    creation.prompt.mode === "edited"
      ? creation.prompt.editedPrompt?.trim()
      : creation.prompt.automaticPrompt.trim();
  const nextBatchNumber =
    Math.max(
      0,
      ...getImageGenerationBatches(creation.imageVersions).map((batch) => batch.batchNumber),
    ) + 1;
  if (
    page.status !== "approved" ||
    creation.approvedImageVersionId ||
    activePrompt !== job.requestSnapshot.prompt ||
    creation.settings.aspectRatio !== job.requestSnapshot.aspectRatio ||
    nextBatchNumber !== job.requestSnapshot.batchNumber ||
    !sameCreativeContext(project, job.requestSnapshot, creation.references)
  ) {
    throw new GenerationJobError(
      "stale_result",
      "The page prompt, creative context, batch history, or approval state changed. Prepare a new generation request.",
      "STALE_GENERATION_CONTEXT",
    );
  }
  return { project, page, creation };
}

function assertRefinementContextApplicable(
  state: PersistedStudioState,
  job: GenerationJob & { requestSnapshot: RefinementRequestSnapshot },
) {
  const { project, page } = selectedProjectAndPage(state, job);
  const creation = normalizePageCreationState(page.creation);
  const snapshot = job.requestSnapshot;
  const parent = creation.imageVersions.find(
    (version) => version.id === snapshot.parentVersionId,
  );
  const selected = creation.imageVersions.find((version) => version.selected);
  const nextSequence =
    Math.max(
      0,
      ...creation.imageVersions
        .filter((version) => version.rootVersionId === snapshot.parentRootVersionId)
        .map((version) => version.refinementSequence),
    ) + 1;
  if (
    page.status !== "approved" ||
    creation.approvedImageVersionId ||
    !parent ||
    selected?.id !== parent.id ||
    parent.rootVersionId !== snapshot.parentRootVersionId ||
    parent.prompt !== snapshot.parentPrompt ||
    parent.generationBatchId !== snapshot.parentGenerationBatchId ||
    parent.batchNumber !== snapshot.parentBatchNumber ||
    parent.aspectRatio !== snapshot.parentAspectRatio ||
    parent.refinementDepth !== snapshot.parentRefinementDepth ||
    nextSequence !== snapshot.refinementSequence ||
    !sameCreativeContext(project, snapshot, creation.references)
  ) {
    throw new GenerationJobError(
      "stale_result",
      "The selected parent, refinement lineage, creative context, or approval state changed. Prepare a new refinement request.",
      "STALE_REFINEMENT_CONTEXT",
    );
  }
  return { project, page, creation, parent };
}

export function assertJobRequestApplicable(
  state: PersistedStudioState,
  job: GenerationJob,
) {
  if (job.requestSnapshot.operationType === "story_generation") {
    throw new GenerationJobError("validation_error", "Story jobs use their own atomic result validation.", "INVALID_JOB_TYPE");
  }
  if (job.requestSnapshot.operationType === "initial_generation") {
    return assertInitialContextApplicable(
      state,
      job as GenerationJob & { requestSnapshot: InitialGenerationRequestSnapshot },
    );
  }
  return assertRefinementContextApplicable(
    state,
    job as GenerationJob & { requestSnapshot: RefinementRequestSnapshot },
  );
}

function assertRunning(job: GenerationJob) {
  if (job.status === "succeeded") return false;
  if (job.status === "cancelled") {
    throw new GenerationJobError(
      "cancelled",
      "This visual operation was cancelled. Its late result was ignored.",
      "CANCELLED",
    );
  }
  if (job.status !== "running") {
    throw new GenerationJobError(
      "stale_result",
      "This visual operation is no longer active, so its result was ignored.",
      "INACTIVE_JOB",
    );
  }
  return true;
}

function assertUniqueResultIds(existing: ImageVersion[], versions: ImageVersion[]) {
  const ids = versions.map((version) => version.id);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => existing.some((version) => version.id === id))
  ) {
    throw new GenerationJobError(
      "invalid_result",
      "The image provider returned duplicate version identities.",
      "DUPLICATE_RESULT_ID",
    );
  }
}

function validateInitialResult(
  snapshot: InitialGenerationRequestSnapshot,
  existing: ImageVersion[],
  result: ImageGenerationResult,
) {
  if (!result.generationBatchId || result.versions.length !== 3) {
    throw new GenerationJobError(
      "invalid_result",
      "A generation batch must contain exactly three visual options.",
      "INVALID_BATCH_SIZE",
    );
  }
  assertUniqueResultIds(existing, result.versions);
  const optionIndices = new Set(result.versions.map((version) => version.optionIndex));
  if (
    optionIndices.size !== 3 ||
    ![1, 2, 3].every((index) => optionIndices.has(index)) ||
    result.versions.some(
      (version) =>
        version.pageId !== snapshot.pageId ||
        version.generationSource !== "generated" ||
        version.generationBatchId !== result.generationBatchId ||
        version.batchNumber !== snapshot.batchNumber ||
        version.prompt !== snapshot.prompt ||
        version.aspectRatio !== snapshot.aspectRatio ||
        version.parentVersionId !== null ||
        version.rootVersionId !== version.id ||
        version.refinementInstruction !== null ||
        version.refinementDepth !== 0 ||
        version.refinementSequence !== 0 ||
        version.status !== "generated" ||
        version.selected,
    )
  ) {
    throw new GenerationJobError(
      "invalid_result",
      "The image provider returned an inconsistent generation batch.",
      "INVALID_BATCH_METADATA",
    );
  }
}

function validateRefinementResult(
  snapshot: RefinementRequestSnapshot,
  existing: ImageVersion[],
  parent: ImageVersion,
  result: ImageGenerationResult,
) {
  const child = result.versions[0];
  if (!child || result.versions.length !== 1) {
    throw new GenerationJobError(
      "invalid_result",
      "A refinement must return exactly one child version.",
      "INVALID_REFINEMENT_SIZE",
    );
  }
  assertUniqueResultIds(existing, result.versions);
  if (
    result.generationBatchId !== snapshot.parentGenerationBatchId ||
    child.pageId !== snapshot.pageId ||
    child.generationSource !== "refinement" ||
    child.parentVersionId !== snapshot.parentVersionId ||
    child.rootVersionId !== snapshot.parentRootVersionId ||
    child.generationBatchId !== snapshot.parentGenerationBatchId ||
    child.batchNumber !== snapshot.parentBatchNumber ||
    child.optionIndex !== parent.optionIndex ||
    child.prompt !== snapshot.parentPrompt ||
    child.aspectRatio !== snapshot.parentAspectRatio ||
    child.refinementInstruction !== snapshot.refinementInstruction ||
    child.refinementSequence !== snapshot.refinementSequence ||
    child.refinementDepth !== snapshot.parentRefinementDepth + 1 ||
    !child.selected ||
    child.status !== "selected"
  ) {
    throw new GenerationJobError(
      "invalid_result",
      "The image provider returned an inconsistent refinement child.",
      "INVALID_REFINEMENT_METADATA",
    );
  }
}

export function applyInitialGenerationJobResult(
  state: PersistedStudioState,
  jobId: string,
  result: ImageGenerationResult,
  completedAt: string,
) {
  const job = getGenerationJob(state, jobId);
  if (!job || job.requestSnapshot.operationType !== "initial_generation") {
    throw new GenerationJobError("validation_error", "Generation job not found.", "JOB_NOT_FOUND");
  }
  if (!assertRunning(job)) return state;
  const { creation } = assertInitialContextApplicable(
    state,
    job as GenerationJob & { requestSnapshot: InitialGenerationRequestSnapshot },
  );
  validateInitialResult(job.requestSnapshot, creation.imageVersions, result);
  const applied = appendPageGenerationResult(
    state,
    job.projectId,
    job.pageId!,
    result.versions,
    job.requestSnapshot.batchNumber,
  );
  return updateJob(applied, job.id, (candidate) => ({
    ...candidate,
    status: "succeeded",
    completedAt,
    error: null,
    resultBatchId: result.generationBatchId,
    resultVersionIds: result.versions.map((version) => version.id),
  }));
}

export function applyRefinementJobResult(
  state: PersistedStudioState,
  jobId: string,
  result: ImageGenerationResult,
  completedAt: string,
) {
  const job = getGenerationJob(state, jobId);
  if (!job || job.requestSnapshot.operationType !== "refinement") {
    throw new GenerationJobError("validation_error", "Refinement job not found.", "JOB_NOT_FOUND");
  }
  if (!assertRunning(job)) return state;
  const { creation, parent } = assertRefinementContextApplicable(
    state,
    job as GenerationJob & { requestSnapshot: RefinementRequestSnapshot },
  );
  validateRefinementResult(job.requestSnapshot, creation.imageVersions, parent, result);
  const child = result.versions[0];
  const applied = appendPageRefinementResult(
    state,
    job.projectId,
    job.pageId!,
    child,
    job.requestSnapshot.refinementInstruction,
  );
  return updateJob(applied, job.id, (candidate) => ({
    ...candidate,
    status: "succeeded",
    completedAt,
    error: null,
    resultBatchId: result.generationBatchId,
    resultVersionIds: [child.id],
  }));
}

export function prepareRetryOperation(
  state: PersistedStudioState,
  job: GenerationJob,
): PageGenerationOperation | PageRefinementOperation {
  if (!RETRYABLE_STATUSES.has(job.status)) {
    throw new GenerationJobError(
      "validation_error",
      "Only failed, cancelled, or interrupted visual jobs can be retried.",
      "JOB_NOT_RETRYABLE",
    );
  }
  const snapshot = job.requestSnapshot;
  if (snapshot.operationType === "story_generation") {
    throw new GenerationJobError("validation_error", "Story jobs use the Story Director retry path.", "INVALID_JOB_TYPE");
  }
  if (snapshot.operationType === "initial_generation") {
    assertInitialContextApplicable(
      state,
      job as GenerationJob & { requestSnapshot: InitialGenerationRequestSnapshot },
    );
    const request: GeneratePageImagesRequest = {
      projectId: snapshot.projectId,
      pageId: snapshot.pageId,
      prompt: snapshot.prompt,
      aspectRatio: snapshot.aspectRatio,
      optionCount: 3,
      batchNumber: snapshot.batchNumber,
      styleBible: { ...snapshot.styleBible },
      references: snapshot.references.map((reference) => ({ ...reference })),
    };
    return { request, batchNumber: snapshot.batchNumber };
  }
  const { parent } = assertRefinementContextApplicable(
    state,
    job as GenerationJob & { requestSnapshot: RefinementRequestSnapshot },
  );
  const request: RefinePageImageRequest = {
    projectId: snapshot.projectId,
    pageId: snapshot.pageId,
    parentVersion: parent,
    refinementInstructions: snapshot.refinementInstruction,
    refinementSequence: snapshot.refinementSequence,
    styleBible: { ...snapshot.styleBible },
    references: snapshot.references.map((reference) => ({ ...reference })),
  };
  return { request };
}
