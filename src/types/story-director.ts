import type { PageAspectRatio, VisualOutputType } from "@/types/domain";

export interface StoryDirectorRequest {
  prompt: string;
  outputType: VisualOutputType;
  pageCount: number;
  visualStyle: string | null;
  aspectRatio: PageAspectRatio;
  referenceNotes: string | null;
}

export interface GeneratedCharacterSpecification {
  id: string;
  name: string;
  role: string;
  physicalDescription: string;
  clothing: string;
  distinguishingFeatures: string;
  continuityNotes: string;
}

export interface GeneratedPageSpecification {
  id: string;
  order: number;
  title: string;
  sceneDescription: string;
  narration: string;
  dialogue: string;
  characterIds: string[];
  location: string;
  timeAndLighting: string;
  cameraDirection: string;
  shotType: string;
  composition: string;
  emotionalTone: string;
  illustrationInstructions: string;
  actLabel: string;
}

export interface GeneratedStorySpecification {
  project: {
    title: string;
    synopsis: string;
    genre: string;
    narrativePremise: string;
    outputFormat: VisualOutputType;
  };
  storyBible: {
    artisticStyle: string;
    colourPalette: string;
    mood: string;
    atmosphere: string;
    visualDirection: string;
    continuityInstructions: string;
  };
  characters: GeneratedCharacterSpecification[];
  storyPlan: {
    beginning: string;
    middle: string;
    ending: string;
    pages: GeneratedPageSpecification[];
  };
}

export interface StoryDirectorCallOptions {
  signal?: AbortSignal;
  accessCode?: string;
}

export interface StoryDirectorConfiguration {
  apiConfigured: boolean;
  accessCodeRequired: boolean;
  available: boolean;
  message: string | null;
}
