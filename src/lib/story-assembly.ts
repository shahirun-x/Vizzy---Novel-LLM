import type { ImageVersion, PageAspectRatio, Project } from "@/types/domain";

export const DEFAULT_PAGE_DURATION_SECONDS = 5;
export const MIN_PAGE_DURATION_SECONDS = 2;
export const MAX_PAGE_DURATION_SECONDS = 30;

export interface ReaderPage {
  pageId: string;
  pageNumber: number;
  title: string;
  imageVersionId: string;
  imageUrl: string;
  aspectRatio: PageAspectRatio;
  narration: string;
  dialogue: string;
  durationSeconds: number;
  approvedVersion: ImageVersion;
}

export interface StoryAssemblyPage {
  pageId: string;
  pageNumber: number;
  title: string;
  narration: string;
  complete: boolean;
  approvedVersion: ImageVersion | null;
  issue: string | null;
}

export interface StoryAssemblyResult {
  ready: boolean;
  totalPages: number;
  approvedIllustrations: number;
  incompletePages: number;
  invalidOrdering: boolean;
  issues: string[];
  pages: StoryAssemblyPage[];
  readerPages: ReaderPage[];
}

export function normalizePageDuration(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_PAGE_DURATION_SECONDS;
  return Math.min(MAX_PAGE_DURATION_SECONDS, Math.max(MIN_PAGE_DURATION_SECONDS, Math.round(value)));
}

export function assembleVisualStory(project: Project): StoryAssemblyResult {
  const plan = project.storyPlan;
  if (!plan || plan.status !== "approved") {
    return {
      ready: false,
      totalPages: plan?.pageBeats.length ?? 0,
      approvedIllustrations: 0,
      incompletePages: plan?.pageBeats.length ?? 0,
      invalidOrdering: false,
      issues: ["Approve the story plan before previewing a visual book."],
      pages: [],
      readerPages: [],
    };
  }

  const ordered = [...plan.pageBeats].sort((a, b) => a.order - b.order);
  const invalidOrdering = ordered.some((page, index) => page.order !== index + 1);
  const issues: string[] = [];
  if (!ordered.length) issues.push("The approved story plan has no pages.");
  if (invalidOrdering) issues.push("Page ordering is invalid or contains gaps.");

  const pages: StoryAssemblyPage[] = ordered.map((page) => {
    const approvedId = page.creation.approvedImageVersionId;
    const approvedVersion = approvedId
      ? page.creation.imageVersions.find((version) => version.id === approvedId) ?? null
      : null;
    let issue: string | null = null;
    if (page.status !== "approved") issue = "Page beat approval required.";
    else if (!approvedId) issue = "Illustration approval required.";
    else if (!approvedVersion) issue = "Approved image version is missing.";
    else if (approvedVersion.pageId !== page.id) issue = "Approved image version belongs to another page.";
    else if (!approvedVersion.imageUrl?.trim()) issue = "Approved image reference is invalid.";
    return {
      pageId: page.id,
      pageNumber: page.order,
      title: page.title,
      narration: page.narration,
      complete: !issue,
      approvedVersion: issue ? null : approvedVersion,
      issue,
    };
  });

  const readerPages: ReaderPage[] = pages.flatMap((assemblyPage) => {
    const page = ordered.find((candidate) => candidate.id === assemblyPage.pageId);
    const version = assemblyPage.approvedVersion;
    if (!page || !version) return [];
    return [{
      pageId: page.id,
      pageNumber: page.order,
      title: page.title,
      imageVersionId: version.id,
      imageUrl: version.imageUrl,
      aspectRatio: version.aspectRatio,
      narration: page.narration,
      dialogue: page.dialogue,
      durationSeconds: DEFAULT_PAGE_DURATION_SECONDS,
      approvedVersion: version,
    }];
  });
  const incompletePages = pages.filter((page) => !page.complete).length;
  if (incompletePages) issues.push(`${incompletePages} page${incompletePages === 1 ? "" : "s"} still require approved illustrations.`);

  return {
    ready: ordered.length > 0 && !invalidOrdering && incompletePages === 0,
    totalPages: ordered.length,
    approvedIllustrations: readerPages.length,
    incompletePages,
    invalidOrdering,
    issues,
    pages,
    readerPages,
  };
}

export function getNextReaderIndex(current: number, total: number, loop: boolean) {
  if (total <= 0) return 0;
  if (current < total - 1) return current + 1;
  return loop ? 0 : total - 1;
}

export function getPreviousReaderIndex(current: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, current - 1));
}
