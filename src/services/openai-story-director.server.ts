import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ZodError } from "zod";
import { buildStoryDirectorInput, buildStoryDirectorInstructions } from "@/lib/story-director-prompt";
import {
  generatedStorySpecificationSchema,
  storyDirectorRequestSchema,
  validateGeneratedStory,
} from "@/lib/story-director-schema";
import { StoryDirectorError, type StoryDirectorService } from "@/services/story-director";
import type { StoryDirectorCallOptions, StoryDirectorRequest } from "@/types/story-director";

export const DEFAULT_OPENAI_TEXT_MODEL = "gpt-6-astra";

export class OpenAIStoryDirector implements StoryDirectorService {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: { apiKey?: string; model?: string; client?: OpenAI } = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey && !options.client) {
      throw new StoryDirectorError("NOT_CONFIGURED", "AI story creation is not configured on this deployment.");
    }
    this.client = options.client ?? new OpenAI({ apiKey });
    this.model = options.model ?? process.env.OPENAI_TEXT_MODEL ?? DEFAULT_OPENAI_TEXT_MODEL;
  }

  async generate(request: StoryDirectorRequest, options: StoryDirectorCallOptions = {}) {
    const parsedRequest = storyDirectorRequestSchema.parse(request);
    try {
      const response = await this.client.responses.parse(
        {
          model: this.model,
          instructions: buildStoryDirectorInstructions(),
          input: buildStoryDirectorInput(parsedRequest),
          text: { format: zodTextFormat(generatedStorySpecificationSchema, "vizzy_story_specification") },
          max_output_tokens: Math.min(24_000, 4_000 + parsedRequest.pageCount * 1_600),
          store: false,
        },
        { signal: options.signal },
      );
      if (!response.output_parsed) {
        throw new StoryDirectorError("INVALID_RESULT", "The AI response did not contain a complete story specification.", true);
      }
      try {
        return validateGeneratedStory(parsedRequest, response.output_parsed);
      } catch {
        throw new StoryDirectorError("INVALID_RESULT", "The AI response did not satisfy Vizzy's story contract.", true);
      }
    } catch (error) {
      if (error instanceof StoryDirectorError) throw error;
      if (error instanceof ZodError) {
        throw new StoryDirectorError("INVALID_RESULT", "The AI response did not satisfy Vizzy's story contract.", true);
      }
      if (options.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw new StoryDirectorError("CANCELLED", "Story generation was cancelled.");
      }
      if (error instanceof OpenAI.RateLimitError) {
        throw new StoryDirectorError("RATE_LIMITED", "The AI service is busy. Please wait a moment and retry.", true);
      }
      if (error instanceof OpenAI.APIError && error.status && error.status >= 500) {
        throw new StoryDirectorError("PROVIDER_FAILURE", "The AI service is temporarily unavailable. Please retry.", true);
      }
      throw new StoryDirectorError("PROVIDER_FAILURE", "The AI service could not complete this story. Your existing projects are unchanged.", true);
    }
  }
}
