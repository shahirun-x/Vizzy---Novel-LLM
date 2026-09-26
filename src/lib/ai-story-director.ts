import { buildIllustrationPrompt } from "@/lib/illustration-prompt";
import { createDefaultPageCreationState, createPageChatMessage } from "@/lib/page-creation";
import { createPlanningMessage } from "@/lib/story-planner";
import type { Project } from "@/types/domain";
import type { GeneratedStorySpecification, StoryDirectorRequest } from "@/types/story-director";

let sequence = 0;
function createId(prefix: string) {
  const unique = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${(sequence += 1)}`;
  return `${prefix}-${unique}`;
}
export function createProjectFromGeneratedStory(
  story: GeneratedStorySpecification,
  request: StoryDirectorRequest,
  now = new Date().toISOString(),
): Project {
  const projectId = createId("project");
  const planId = createId("plan");
  const characterIds = new Map<string, string>();
  const characters = story.characters.map((character) => {
    const id = createId("character");
    characterIds.set(character.id, id);
    return {
      id,
      projectId,
      name: character.name,
      role: character.role,
      description: [character.physicalDescription, character.clothing, character.distinguishingFeatures].filter(Boolean).join(" "),
      physicalDescription: character.physicalDescription,
      clothing: character.clothing,
      distinguishingFeatures: character.distinguishingFeatures,
      continuityNotes: character.continuityNotes,
    };
  });
  const characterDescriptions = characters
    .map((character) => `${character.name} (${character.role}): ${character.description} Continuity: ${character.continuityNotes}`)
    .join("\n");
  const pages = story.storyPlan.pages.map((page) => {
    const creation = createDefaultPageCreationState();
    return {
      id: createId("page-beat"),
      storyPlanId: planId,
      order: page.order,
      title: page.title,
      description: page.sceneDescription,
      visualDirection: [page.cameraDirection, page.illustrationInstructions].join(". "),
      narration: page.narration,
      dialogue: page.dialogue,
      characterIds: page.characterIds.map((id) => characterIds.get(id)).filter((id): id is string => Boolean(id)),
      location: page.location,
      timeAndLighting: page.timeAndLighting,
      optionalActLabel: page.actLabel,
      status: "approved" as const,
      creation: {
        ...creation,
        illustrationStatus: "prompt_ready" as const,
        settings: {
          ...creation.settings,
          cameraAngle: page.cameraDirection,
          shotType: page.shotType,
          lighting: page.timeAndLighting,
          composition: page.composition,
          emotionalTone: page.emotionalTone,
          additionalInstructions: page.illustrationInstructions,
          aspectRatio: request.aspectRatio,
        },
        chatHistory: [
          createPageChatMessage("assistant", "This AI-directed page is approved and its illustration prompt is ready for visual development."),
        ],
      },
    };
  });

  let project: Project = {
    id: projectId,
    title: story.project.title,
    description: story.project.synopsis,
    genre: story.project.genre,
    narrativePremise: story.project.narrativePremise,
    creationSource: "ai",
    createdAt: now,
    updatedAt: now,
    outputType: story.project.outputFormat,
    styleBible: {
      projectId,
      artStyle: story.storyBible.artisticStyle,
      mood: story.storyBible.mood,
      atmosphere: story.storyBible.atmosphere,
      palette: story.storyBible.colourPalette,
      visualDirection: story.storyBible.visualDirection,
      continuityInstructions: story.storyBible.continuityInstructions,
      characterDescriptions,
      visualReferences: request.referenceNotes ?? "",
      additionalInstructions: request.visualStyle ?? "",
    },
    characters,
    onboarding: {
      currentStep: "complete",
      completedSteps: ["title", "story", "format", "art_style", "palette", "mood", "characters", "references", "instructions"],
      status: "complete",
    },
    chatHistory: [],
    storyPlan: {
      id: planId,
      projectId,
      synopsis: story.project.synopsis,
      beginning: story.storyPlan.beginning,
      middle: story.storyPlan.middle,
      ending: story.storyPlan.ending,
      creationSource: "ai",
      targetPageCount: pages.length,
      status: "approved",
      pageBeats: pages,
      createdAt: now,
      updatedAt: now,
    },
    selectedPageBeatId: pages[0]?.id ?? null,
    planningChatHistory: [createPlanningMessage(`AI Story Director created and approved this ${pages.length}-page plan. Review any detail before illustration.`)],
  };

  project = {
    ...project,
    storyPlan: project.storyPlan
      ? {
          ...project.storyPlan,
          pageBeats: project.storyPlan.pageBeats.map((page) => ({
            ...page,
            creation: {
              ...page.creation,
              prompt: {
                ...page.creation.prompt,
                automaticPrompt: buildIllustrationPrompt(project, page),
                updatedAt: now,
              },
            },
          })),
        }
      : null,
  };
  return project;
}
