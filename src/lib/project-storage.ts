import type { Project } from "@/types/domain";
import { normalizePageCreationState } from "@/lib/page-creation";

export type StudioView =
  | "story"
  | "style_bible"
  | "characters"
  | "pages"
  | "planning"
  | "page_creation";

export interface PersistedStudioState {
  version: 5;
  projects: Project[];
  selectedProjectId: string | null;
  activeView: StudioView;
}

export const EMPTY_STUDIO_STATE: PersistedStudioState = {
  version: 5,
  projects: [],
  selectedProjectId: null,
  activeView: "story",
};

const VALID_VIEWS = new Set<StudioView>([
  "story",
  "style_bible",
  "characters",
  "pages",
  "planning",
  "page_creation",
]);

function migrateProject(project: Project): Project {
  const storyPlan = project.storyPlan
    ? {
        ...project.storyPlan,
        pageBeats: project.storyPlan.pageBeats.map((page) => ({
          ...page,
          creation: normalizePageCreationState(page.creation),
        })),
      }
    : null;

  return {
    ...project,
    storyPlan,
    selectedPageBeatId: project.selectedPageBeatId ?? null,
    planningChatHistory: Array.isArray(project.planningChatHistory)
      ? project.planningChatHistory
      : [],
  };
}

export function migrateStudioState(value: unknown): PersistedStudioState {
  if (!value || typeof value !== "object") return EMPTY_STUDIO_STATE;

  const candidate = value as {
    version?: number;
    projects?: Project[];
    selectedProjectId?: unknown;
    activeView?: unknown;
  };
  if (![1, 2, 3, 4, 5].includes(candidate.version ?? -1) || !Array.isArray(candidate.projects)) {
    return EMPTY_STUDIO_STATE;
  }

  return {
    version: 5,
    projects: candidate.projects.map(migrateProject),
    selectedProjectId:
      typeof candidate.selectedProjectId === "string" ? candidate.selectedProjectId : null,
    activeView:
      typeof candidate.activeView === "string" && VALID_VIEWS.has(candidate.activeView as StudioView)
        ? (candidate.activeView as StudioView)
        : "story",
  };
}

export function parseStudioSnapshot(snapshot: string): PersistedStudioState {
  try {
    return migrateStudioState(JSON.parse(snapshot));
  } catch {
    return EMPTY_STUDIO_STATE;
  }
}
