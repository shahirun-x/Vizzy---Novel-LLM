import { z } from "zod";

export const STORY_DIRECTOR_DEFAULT_PAGE_COUNT = 3;
export const STORY_DIRECTOR_MAX_PAGE_COUNT = 12;
export const STORY_DIRECTOR_MAX_PROMPT_LENGTH = 8_000;

const boundedText = (label: string, maximum = 2_000) =>
  z.string().trim().min(1, `${label} is required.`).max(maximum, `${label} is too long.`);

export const storyDirectorRequestSchema = z
  .object({
    prompt: boundedText("Story prompt", STORY_DIRECTOR_MAX_PROMPT_LENGTH).min(
      12,
      "Give Vizzy at least a short story idea.",
    ),
    outputType: z.enum(["graphic_novel", "storyboard", "visual_book"]),
    pageCount: z.number().int().min(1).max(STORY_DIRECTOR_MAX_PAGE_COUNT),
    visualStyle: z.string().trim().max(500).nullable(),
    aspectRatio: z.enum(["3:4", "16:9", "1:1"]),
    referenceNotes: z.string().trim().max(2_000).nullable(),
  })
  .strict();

const generatedCharacterSchema = z
  .object({
    id: boundedText("Character ID", 80).regex(/^[a-z0-9][a-z0-9-]*$/),
    name: boundedText("Character name", 120),
    role: boundedText("Character role", 240),
    physicalDescription: boundedText("Physical description", 1_000),
    clothing: boundedText("Clothing", 700),
    distinguishingFeatures: boundedText("Distinguishing features", 700),
    continuityNotes: boundedText("Character continuity notes", 1_000),
  })
  .strict();

const generatedPageSchema = z
  .object({
    id: boundedText("Page ID", 80).regex(/^[a-z0-9][a-z0-9-]*$/),
    order: z.number().int().min(1).max(STORY_DIRECTOR_MAX_PAGE_COUNT),
    title: boundedText("Page title", 160),
    sceneDescription: boundedText("Scene description", 2_000),
    narration: z.string().trim().max(1_500),
    dialogue: z.string().trim().max(1_500),
    characterIds: z.array(z.string().trim().min(1).max(80)).max(12),
    location: boundedText("Location", 500),
    timeAndLighting: boundedText("Time and lighting", 500),
    cameraDirection: boundedText("Camera direction", 500),
    shotType: boundedText("Shot type", 160),
    composition: boundedText("Composition", 700),
    emotionalTone: boundedText("Emotional tone", 400),
    illustrationInstructions: boundedText("Illustration instructions", 1_500),
    actLabel: z.string().trim().max(120),
  })
  .strict();

export const generatedStorySpecificationSchema = z
  .object({
    project: z
      .object({
        title: boundedText("Title", 160),
        synopsis: boundedText("Synopsis", 2_000),
        genre: boundedText("Genre", 160),
        narrativePremise: boundedText("Narrative premise", 1_000),
        outputFormat: z.enum(["graphic_novel", "storyboard", "visual_book"]),
      })
      .strict(),
    storyBible: z
      .object({
        artisticStyle: boundedText("Artistic style", 700),
        colourPalette: boundedText("Colour palette", 500),
        mood: boundedText("Mood", 400),
        atmosphere: boundedText("Atmosphere", 600),
        visualDirection: boundedText("Visual direction", 1_000),
        continuityInstructions: boundedText("Continuity instructions", 1_500),
      })
      .strict(),
    characters: z.array(generatedCharacterSchema).min(1).max(12),
    storyPlan: z
      .object({
        beginning: boundedText("Beginning", 1_500),
        middle: boundedText("Middle", 1_500),
        ending: boundedText("Ending", 1_500),
        pages: z.array(generatedPageSchema).min(1).max(STORY_DIRECTOR_MAX_PAGE_COUNT),
      })
      .strict(),
  })
  .strict()
  .superRefine((story, context) => {
    const characterIds = story.characters.map((character) => character.id);
    if (new Set(characterIds).size !== characterIds.length) {
      context.addIssue({ code: "custom", path: ["characters"], message: "Character IDs must be unique." });
    }
    const pageIds = story.storyPlan.pages.map((page) => page.id);
    if (new Set(pageIds).size !== pageIds.length) {
      context.addIssue({ code: "custom", path: ["storyPlan", "pages"], message: "Page IDs must be unique." });
    }
    const knownCharacters = new Set(characterIds);
    story.storyPlan.pages.forEach((page, index) => {
      if (page.order !== index + 1) {
        context.addIssue({ code: "custom", path: ["storyPlan", "pages", index, "order"], message: "Pages must be consecutively ordered." });
      }
      page.characterIds.forEach((id) => {
        if (!knownCharacters.has(id)) {
          context.addIssue({ code: "custom", path: ["storyPlan", "pages", index, "characterIds"], message: `Unknown character ID: ${id}` });
        }
      });
    });
  });

export function validateGeneratedStory(request: z.infer<typeof storyDirectorRequestSchema>, value: unknown) {
  const story = generatedStorySpecificationSchema.parse(value);
  if (story.project.outputFormat !== request.outputType) {
    throw new Error("The generated output format did not match the request.");
  }
  if (story.storyPlan.pages.length !== request.pageCount) {
    throw new Error(`The generated story must contain exactly ${request.pageCount} pages.`);
  }
  return story;
}
