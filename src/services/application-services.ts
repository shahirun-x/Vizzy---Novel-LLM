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
    imageGeneration: overrides.imageGeneration ?? new MockImageGenerationService(),
    persistence: overrides.persistence ?? createBrowserStudioPersistence(),
  };
}

/** Zero-configuration prototype services. Future providers are injected through this contract. */
export const defaultApplicationServices = createApplicationServices();
