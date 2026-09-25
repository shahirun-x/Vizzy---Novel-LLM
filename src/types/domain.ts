/** A creative project containing a story and its illustrated pages. */
export interface Project {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  outputType: VisualOutputType | null;
  styleBible: VisualStyleBible;
  characters: Character[];
  onboarding: OnboardingState;
  chatHistory: ChatMessage[];
  storyPlan: StoryPlan | null;
  selectedPageBeatId: string | null;
  planningChatHistory: ChatMessage[];
}

export type VisualOutputType = "graphic_novel" | "storyboard" | "visual_book";

export type OnboardingStep =
  | "title"
  | "story"
  | "format"
  | "art_style"
  | "palette"
  | "mood"
  | "characters"
  | "references"
  | "instructions"
  | "complete";

export interface OnboardingState {
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  status: "in_progress" | "complete";
}

export interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  createdAt: string;
}

export type StoryPlanStatus = "draft" | "approved";
export type PageBeatStatus = "draft" | "approved";

/** An editable sequence of proposed illustrated pages for a project. */
export interface StoryPlan {
  id: string;
  projectId: string;
  synopsis: string;
  targetPageCount: number;
  status: StoryPlanStatus;
  pageBeats: PageBeat[];
  createdAt: string;
  updatedAt: string;
}

/** One planned illustrated page. Complex comic panels are intentionally out of scope. */
export interface PageBeat {
  id: string;
  storyPlanId: string;
  order: number;
  title: string;
  description: string;
  visualDirection: string;
  narration: string;
  dialogue: string;
  optionalActLabel?: string;
  status: PageBeatStatus;
  creation: PageCreationState;
}

export type PageAspectRatio = "3:4" | "16:9" | "1:1";

export interface PageCreativeSettings {
  cameraAngle: string;
  shotType: string;
  lighting: string;
  composition: string;
  emotionalTone: string;
  additionalInstructions: string;
  aspectRatio: PageAspectRatio;
}

export type VisualReferencePurpose =
  | "character"
  | "costume"
  | "environment"
  | "lighting"
  | "composition";

export interface VisualReferenceMetadata {
  id: string;
  pageId: string;
  title: string;
  url: string;
  description: string;
  purpose: VisualReferencePurpose;
  createdAt: string;
}

export interface IllustrationPromptState {
  automaticPrompt: string;
  editedPrompt: string | null;
  mode: "automatic" | "edited";
  updatedAt: string;
}

export type IllustrationStatus =
  | "not_started"
  | "prompt_ready"
  | "generating"
  | "options_ready"
  | "direction_selected"
  | "refining"
  | "illustration_approved"
  | "approved";

export interface PageCreationState {
  illustrationStatus: IllustrationStatus;
  settings: PageCreativeSettings;
  prompt: IllustrationPromptState;
  references: VisualReferenceMetadata[];
  chatHistory: ChatMessage[];
  imageVersions: ImageVersion[];
  approvedImageVersionId: string | null;
  illustrationApprovedAt: string | null;
}

export type PageStatus = "draft" | "in_review" | "approved";

/** A single ordered story or storyboard page. */
export interface Page {
  id: string;
  projectId: string;
  order: number;
  title: string;
  description: string;
  status: PageStatus;
}

/** One generated artwork candidate for a page. */
export interface ImageVersion {
  id: string;
  pageId: string;
  imageUrl: string;
  prompt: string;
  createdAt: string;
  selected: boolean;
  parentVersionId: string | null;
  rootVersionId: string;
  generationBatchId: string;
  batchNumber: number;
  optionIndex: number;
  optionLabel: string;
  aspectRatio: PageAspectRatio;
  compositionDirection: string;
  visualSeed: string;
  generationSource: "generated" | "refinement";
  refinementInstruction: string | null;
  refinementDepth: number;
  refinementSequence: number;
  status: "generated" | "selected" | "approved" | "superseded";
}

/** The reusable visual direction established for a project. */
export interface VisualStyleBible {
  projectId: string;
  artStyle: string;
  mood: string;
  palette: string;
  characterDescriptions: string;
  visualReferences: string;
  additionalInstructions: string;
}

/** A recurring person or creature in a project. */
export interface Character {
  id: string;
  projectId: string;
  name: string;
  description: string;
}
