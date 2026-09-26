import type { ImageGenerationService } from "@/services/image-generation";
import { MockImageGenerationService } from "@/services/mock-image-generation";
import { RemoteAIStoryDirectorService } from "@/services/remote-ai-story-director";
import type { StoryDirectorService } from "@/services/story-director";
import {
  createBrowserStudioPersistence,
  type StudioPersistence,
} from "@/services/studio-persistence";

export interface ApplicationServices {
  imageGeneration: ImageGenerationService;
  storyDirector: StoryDirectorService;
  persistence: StudioPersistence;
}

export function createApplicationServices(
  overrides: Partial<ApplicationServices> = {},
): ApplicationServices {
  return {
    // Long enough for the prototype UI to expose honest loading and cancellation states.
    imageGeneration: overrides.imageGeneration ?? new MockImageGenerationService(1_500),
    storyDirector: overrides.storyDirector ?? new RemoteAIStoryDirectorService(),
    persistence: overrides.persistence ?? createBrowserStudioPersistence(),
  };
}

/** Zero-configuration prototype services. Future providers are injected through this contract. */
export const defaultApplicationServices = createApplicationServices();
