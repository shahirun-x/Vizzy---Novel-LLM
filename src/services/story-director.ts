import type {
  GeneratedStorySpecification,
  StoryDirectorCallOptions,
  StoryDirectorRequest,
} from "@/types/story-director";

export type StoryDirectorErrorCode =
  | "NOT_CONFIGURED"
  | "ACCESS_DENIED"
  | "RATE_LIMITED"
  | "INVALID_REQUEST"
  | "INVALID_RESULT"
  | "CANCELLED"
  | "PROVIDER_FAILURE";

export class StoryDirectorError extends Error {
  constructor(
    public readonly code: StoryDirectorErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "StoryDirectorError";
  }
}
export interface StoryDirectorService {
  generate(
    request: StoryDirectorRequest,
    options?: StoryDirectorCallOptions,
  ): Promise<GeneratedStorySpecification>;
}
