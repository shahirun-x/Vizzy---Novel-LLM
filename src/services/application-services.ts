import type { ImageGenerationService } from "@/services/image-generation";
import { MockImageGenerationService } from "@/services/mock-image-generation";
import {
  createBrowserStudioPersistence,
  type StudioPersistence,
} from "@/services/studio-persistence";

export interface ApplicationServices {
  imageGeneration: ImageGenerationService;
  persistence: StudioPersistence;
}

export function createApplicationServices(
  overrides: Partial<ApplicationServices> = {},
): ApplicationServices {
  return {
    // Long enough for the prototype UI to expose honest loading and cancellation states.
    imageGeneration: overrides.imageGeneration ?? new MockImageGenerationService(1_500),
    persistence: overrides.persistence ?? createBrowserStudioPersistence(),
  };
}

/** Zero-configuration prototype services. Future providers are injected through this contract. */
export const defaultApplicationServices = createApplicationServices();
