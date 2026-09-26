import { createProjectFromGeneratedStory } from "@/lib/ai-story-director";
import {
  cancelGenerationJob,
  createQueuedGenerationJob,
  failGenerationJob,
  GenerationJobError,
  getGenerationJob,
  registerGenerationJob,
  startGenerationJob,
} from "@/lib/generation-jobs";
import type { PersistedStudioState } from "@/lib/project-storage";
import { StoryDirectorError, type StoryDirectorService } from "@/services/story-director";
import type { GenerationJobErrorInfo, StoryGenerationRequestSnapshot } from "@/types/generation-job";
import type { StoryDirectorCallOptions, StoryDirectorRequest } from "@/types/story-director";

export interface StoryGenerationStateGateway {
  read(): PersistedStudioState;
  update(updater: (state: PersistedStudioState) => PersistedStudioState): void;
}

let fallbackSequence = 0;
function defaultJobId() {
  const unique = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${(fallbackSequence += 1)}`;
  return `story-job-${unique}`;
}

function errorInfo(error: unknown): GenerationJobErrorInfo {
  if (error instanceof GenerationJobError) {
    return { category: error.category, message: error.message, code: error.code };
  }
  if (error instanceof StoryDirectorError) {
    return {
      category: error.code === "CANCELLED" ? "cancelled" : error.code === "INVALID_RESULT" ? "invalid_result" : error.code === "INVALID_REQUEST" ? "validation_error" : "provider_error",
      message: error.message,
      code: error.code,
    };
  }
  return {
    category: "provider_error",
    message: error instanceof Error ? error.message : "The Story Director could not complete this request.",
    code: "PROVIDER_FAILURE",
  };
}

export class StoryGenerationCoordinator {
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    private readonly director: StoryDirectorService,
    private readonly state: StoryGenerationStateGateway,
    private readonly options: { createJobId?: () => string; now?: () => string } = {},
  ) {}

  private now() {
    return this.options.now?.() ?? new Date().toISOString();
  }

  async start(request: StoryDirectorRequest, options: Pick<StoryDirectorCallOptions, "accessCode"> = {}) {
    const snapshot: StoryGenerationRequestSnapshot = {
      operationType: "story_generation",
      projectId: "story-director",
      pageId: null,
      request: { ...request },
    };
    const job = createQueuedGenerationJob({
      id: this.options.createJobId?.() ?? defaultJobId(),
      snapshot,
      createdAt: this.now(),
    });
    return this.execute(job.id, job, options);
  }

  cancel(jobId: string) {
    this.state.update((state) => cancelGenerationJob(state, jobId, this.now()));
    this.controllers.get(jobId)?.abort();
  }

  async retry(jobId: string, options: Pick<StoryDirectorCallOptions, "accessCode"> = {}) {
    const original = getGenerationJob(this.state.read(), jobId);
    if (!original || original.operationType !== "story_generation") {
      throw new GenerationJobError("validation_error", "The story job to retry could not be found.", "JOB_NOT_FOUND");
    }
    if (!["failed", "cancelled", "interrupted"].includes(original.status)) {
      throw new GenerationJobError("validation_error", "Only failed, cancelled, or interrupted story jobs can be retried.", "JOB_NOT_RETRYABLE");
    }
    const retry = createQueuedGenerationJob({
      id: this.options.createJobId?.() ?? defaultJobId(),
      snapshot: original.requestSnapshot,
      createdAt: this.now(),
      attempt: original.attempt + 1,
      retryOfJobId: original.id,
    });
    return this.execute(retry.id, retry, options);
  }

  private async execute(
    jobId: string,
    job: ReturnType<typeof createQueuedGenerationJob>,
    options: Pick<StoryDirectorCallOptions, "accessCode">,
  ) {
    this.state.update((state) => registerGenerationJob(state, job));
    this.state.update((state) => startGenerationJob(state, jobId, this.now()));
    const controller = new AbortController();
    this.controllers.set(jobId, controller);
    try {
      const snapshot = job.requestSnapshot;
      if (snapshot.operationType !== "story_generation") throw new Error("Invalid story job snapshot.");
      const generated = await this.director.generate(snapshot.request, {
        signal: controller.signal,
        accessCode: options.accessCode,
      });
      const latest = getGenerationJob(this.state.read(), jobId);
      if (latest?.status === "cancelled") {
        throw new StoryDirectorError("CANCELLED", "Story generation was cancelled. No result was applied.");
      }
      if (latest?.status !== "running") {
        throw new GenerationJobError("stale_result", "This story job is no longer active, so its late result was ignored.", "INACTIVE_JOB");
      }
      const project = createProjectFromGeneratedStory(generated, snapshot.request, this.now());
      this.state.update((state) => {
        const current = getGenerationJob(state, jobId);
        if (!current || current.status !== "running") return state;
        return {
          ...state,
          projects: [...state.projects, project],
          selectedProjectId: project.id,
          activeView: "story",
          generationJobs: state.generationJobs.map((candidate) =>
            candidate.id === jobId
              ? { ...candidate, status: "succeeded" as const, completedAt: this.now(), error: null, resultProjectId: project.id }
              : candidate,
          ),
        };
      });
      return project.id;
    } catch (error) {
      const latest = getGenerationJob(this.state.read(), jobId);
      if (latest?.status !== "cancelled") {
        this.state.update((state) => failGenerationJob(state, jobId, errorInfo(error), this.now()));
      }
      throw error;
    } finally {
      this.controllers.delete(jobId);
    }
  }
}
