import { storyDirectorRequestSchema, validateGeneratedStory } from "@/lib/story-director-schema";
import { StoryDirectorError, type StoryDirectorService } from "@/services/story-director";
import type { StoryDirectorConfiguration } from "@/types/story-director";

export class RemoteAIStoryDirectorService implements StoryDirectorService {
  async configuration(): Promise<StoryDirectorConfiguration> {
    const response = await fetch("/api/story-director", { cache: "no-store" });
    if (!response.ok) throw new StoryDirectorError("PROVIDER_FAILURE", "Could not inspect AI configuration.", true);
    return response.json() as Promise<StoryDirectorConfiguration>;
  }

  async generate(request: unknown, options: { signal?: AbortSignal; accessCode?: string } = {}) {
    const parsed = storyDirectorRequestSchema.parse(request);
    const response = await fetch("/api/story-director", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(options.accessCode ? { "x-vizzy-access-code": options.accessCode } : {}),
      },
      body: JSON.stringify(parsed),
      signal: options.signal,
    });
    const payload = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string }; story?: unknown } | null;
    if (!response.ok) {
      throw new StoryDirectorError(
        (payload?.error?.code as ConstructorParameters<typeof StoryDirectorError>[0]) ?? "PROVIDER_FAILURE",
        payload?.error?.message ?? "The AI story request failed.",
        response.status === 429 || response.status >= 500,
      );
    }
    try {
      return validateGeneratedStory(parsed, payload?.story);
    } catch {
      throw new StoryDirectorError("INVALID_RESULT", "The story service returned an invalid result. No project was created.", true);
    }
  }
}
