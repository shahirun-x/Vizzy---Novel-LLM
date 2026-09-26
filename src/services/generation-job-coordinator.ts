import {
  applyInitialGenerationJobResult,
  applyRefinementJobResult,
  cancelGenerationJob as cancelJobState,
  createInitialGenerationSnapshot,
  createQueuedGenerationJob,
  createRefinementSnapshot,
  failGenerationJob,
  GenerationJobError,
  getGenerationJob,
  prepareRetryOperation,
  registerGenerationJob,
  startGenerationJob,
} from "@/lib/generation-jobs";
import type { PersistedStudioState } from "@/lib/project-storage";
import { ImageGenerationError } from "@/services/image-generation";
import {
  ImageGenerationOrchestrator,
  preparePageGeneration,
  preparePageRefinement,
  type PageGenerationOperation,
  type PageRefinementOperation,
} from "@/services/image-generation-orchestrator";
import type {
  GenerationJob,
  GenerationJobErrorInfo,
  GenerationRequestSnapshot,
} from "@/types/generation-job";

export interface GenerationJobStateGateway {
  read(): PersistedStudioState;
  update(updater: (state: PersistedStudioState) => PersistedStudioState): void;
}

export interface GenerationJobCoordinatorOptions {
  createJobId?: () => string;
  now?: () => string;
}

let fallbackSequence = 0;

function defaultJobId() {
  const uniquePart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${(fallbackSequence += 1)}`;
  return `generation-job-${uniquePart}`;
}

function providerError(error: unknown): GenerationJobError {
  if (error instanceof GenerationJobError) return error;
  if (error instanceof ImageGenerationError && error.code === "CANCELLED") {
    return new GenerationJobError("cancelled", error.message, error.code);
  }
  return new GenerationJobError(
    "provider_error",
    error instanceof Error
      ? error.message
      : "The visual provider could not complete this operation.",
    error instanceof ImageGenerationError ? error.code : "PROVIDER_FAILURE",
  );
}

function persistedError(error: GenerationJobError): GenerationJobErrorInfo {
  return { category: error.category, message: error.message, code: error.code };
}

/** Owns live controllers while serializable job state remains in the studio snapshot. */
export class GenerationJobCoordinator {
  private readonly controllers = new Map<string, AbortController>();
  private readonly createJobId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly orchestrator: ImageGenerationOrchestrator,
    private readonly state: GenerationJobStateGateway,
    options: GenerationJobCoordinatorOptions = {},
  ) {
    this.createJobId = options.createJobId ?? defaultJobId;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async startInitialGeneration(projectId: string, pageId: string) {
    const project = this.state.read().projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      throw new GenerationJobError(
        "validation_error",
        "Only an approved page can prepare visual options.",
        "MISSING_PROJECT",
      );
    }
    const operation = preparePageGeneration(project, pageId);
    const snapshot = createInitialGenerationSnapshot(operation);
    const job = this.createJob(snapshot);
    await this.execute(job, operation);
    return job.id;
  }

  async startRefinement(
    projectId: string,
    pageId: string,
    refinementInstruction: string,
  ) {
    const project = this.state.read().projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      throw new GenerationJobError(
        "validation_error",
        "Select a visual version before creating a refinement.",
        "MISSING_PROJECT",
      );
    }
    const operation = preparePageRefinement(project, pageId, refinementInstruction);
    const snapshot = createRefinementSnapshot(operation);
    const job = this.createJob(snapshot);
    const versionIds = await this.execute(job, operation);
    return versionIds[0];
  }

  cancel(jobId: string) {
    this.state.update((current) => cancelJobState(current, jobId, this.now()));
    this.controllers.get(jobId)?.abort();
  }

  async retry(jobId: string) {
    const current = this.state.read();
    const original = getGenerationJob(current, jobId);
    if (!original) {
      throw new GenerationJobError(
        "validation_error",
        "The visual job to retry could not be found.",
        "JOB_NOT_FOUND",
      );
    }
    const operation = prepareRetryOperation(current, original);
    const retry = this.createJob(
      original.requestSnapshot,
      original.attempt + 1,
      original.id,
    );
    const versionIds = await this.execute(retry, operation);
    return versionIds[0] ?? null;
  }

  private createJob(
    snapshot: GenerationRequestSnapshot,
    attempt = 1,
    retryOfJobId: string | null = null,
  ) {
    return createQueuedGenerationJob({
      id: this.createJobId(),
      snapshot,
      createdAt: this.now(),
      attempt,
      retryOfJobId,
    });
  }

  private async execute(
    job: GenerationJob,
    operation: PageGenerationOperation | PageRefinementOperation,
  ) {
    this.state.update((current) => registerGenerationJob(current, job));
    this.state.update((current) => startGenerationJob(current, job.id, this.now()));
    const controller = new AbortController();
    this.controllers.set(job.id, controller);

    try {
      const result =
        job.operationType === "initial_generation"
          ? await this.orchestrator.generate(operation as PageGenerationOperation, {
              signal: controller.signal,
            })
          : await this.orchestrator.refine(operation as PageRefinementOperation, {
              signal: controller.signal,
            });

      this.state.update((current) =>
        job.operationType === "initial_generation"
          ? applyInitialGenerationJobResult(current, job.id, result, this.now())
          : applyRefinementJobResult(current, job.id, result, this.now()),
      );
      return result.versions.map((version) => version.id);
    } catch (cause) {
      const latest = getGenerationJob(this.state.read(), job.id);
      if (latest?.status === "cancelled") {
        throw new GenerationJobError(
          "cancelled",
          latest.error?.message ?? "This visual operation was cancelled.",
          "CANCELLED",
        );
      }
      const error = providerError(cause);
      this.state.update((current) =>
        failGenerationJob(current, job.id, persistedError(error), this.now()),
      );
      throw error;
    } finally {
      this.controllers.delete(job.id);
    }
  }
}
