import type { StoryDirectorRequest } from "@/types/story-director";

const FORMAT_LABELS = {
  graphic_novel: "graphic novel",
  storyboard: "storyboard",
  visual_book: "visual book",
} as const;

export function buildStoryDirectorInstructions() {
  return [
    "You are Vizzy's Story Director, an expert visual storyteller and editor.",
    "Turn the user's idea into one complete, coherent visual story specification ready for illustration.",
    "Respect every explicit character, event, line of dialogue, boundary, format, and reference in the request.",
    "Fill ordinary creative gaps with restrained, internally consistent choices; do not ask follow-up questions.",
    "Give each character a short lowercase kebab-case ID and reuse only those IDs on pages.",
    "Make every page visually distinct while maintaining exact character, wardrobe, setting, palette, and prop continuity.",
    "Narration and dialogue must be final story copy, not notes or placeholders; an empty string is allowed when intentionally silent.",
    "The illustration instructions must describe the frame without inventing text embedded in the image.",
    "Return exactly the requested number of consecutively ordered pages and exactly the requested output format.",
  ].join("\n");
}
export function buildStoryDirectorInput(request: StoryDirectorRequest) {
  return [
    `Create a ${request.pageCount}-page ${FORMAT_LABELS[request.outputType]}.`,
    `Canvas aspect ratio: ${request.aspectRatio}.`,
    `Story idea and constraints:\n${request.prompt}`,
    request.visualStyle ? `Requested visual style:\n${request.visualStyle}` : "Choose an appropriate visual style.",
    request.referenceNotes ? `Reference notes (interpret as direction, never as a request to copy a living artist):\n${request.referenceNotes}` : "No additional reference notes were supplied.",
  ].join("\n\n");
}
