"use client";

import { useEffect, useRef, useState } from "react";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatMessage } from "@/components/chat/chat-message";
import { Icon } from "@/components/ui/icon";
import { LogoMark } from "@/components/ui/logo-mark";
import type { StudioView } from "@/hooks/use-project-store";
import { ONBOARDING_STEP_ORDER, OPTIONAL_ONBOARDING_STEPS } from "@/lib/onboarding";
import type { OnboardingStep, Project } from "@/types/domain";

interface ChatPanelProps {
  project: Project | null;
  activeView: StudioView;
  onCreateProject: () => void;
  onSubmitAnswer: (answer: string) => void;
  onSelectView: (view: StudioView) => void;
  onGenerateStoryPlan: (pageCount: number) => void;
  onAddPage: () => void;
  onApproveStoryPlan: () => void;
  onAddPageInstruction: (pageBeatId: string, instruction: string) => void;
}

const QUICK_REPLIES: Partial<Record<OnboardingStep, string[]>> = {
  format: ["Graphic novel", "Storyboard", "Visual book"],
  art_style: ["Cinematic realism", "Expressive ink", "Painterly fantasy"],
  palette: ["Muted earth tones", "Noir monochrome", "Warm sunset colours"],
  mood: ["Intimate and hopeful", "Dreamlike and mysterious", "Tense and cinematic"],
};

export function ChatPanel({
  project,
  activeView,
  onCreateProject,
  onSubmitAnswer,
  onSelectView,
  onGenerateStoryPlan,
  onAddPage,
  onApproveStoryPlan,
  onAddPageInstruction,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const isPlanningContext = activeView === "planning" || activeView === "pages";
  const selectedPage = project?.storyPlan?.pageBeats.find(
    (page) => page.id === project.selectedPageBeatId,
  );
  const isPageContext = activeView === "page_creation" && Boolean(selectedPage);
  const messages = isPageContext
    ? selectedPage?.creation.chatHistory ?? []
    : isPlanningContext
      ? project?.planningChatHistory ?? []
      : project?.chatHistory ?? [];
  const messageCount = messages.length;
  const currentStep = project?.onboarding.currentStep;
  const isComplete = project?.onboarding.status === "complete";
  const quickReplies = currentStep ? QUICK_REPLIES[currentStep] ?? [] : [];

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;
  }, [messageCount, project?.id]);

  function submitMessage(answer = input) {
    const message = answer.trim();
    if (!message || !project || isPlanningContext) return;

    if (isPageContext && selectedPage) {
      onAddPageInstruction(selectedPage.id, message);
      setInput("");
      return;
    }

    if (isComplete) return;

    onSubmitAnswer(message);
    setInput("");
  }

  const currentStepIndex = currentStep ? ONBOARDING_STEP_ORDER.indexOf(currentStep) : 0;
  const progress = Math.round(
    (currentStepIndex / (ONBOARDING_STEP_ORDER.length - 1)) * 100,
  );

  return (
    <aside className="flex h-dvh min-h-[650px] min-w-0 flex-col border-l border-white/[0.055] bg-[#171816] max-[760px]:h-[46rem]">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.055] px-5">
        <div>
          <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#eceae5]">Vizzy</h2>
          <p className="mt-1 text-[10px] text-[#686964]">
            {isPageContext && selectedPage
              ? `Page ${selectedPage.order} · visual development`
              : isPlanningContext && project
                ? `Story planner · ${project.storyPlan?.status ?? "setup"}`
              : project && !isComplete
                ? `Creative onboarding · ${progress}%`
                : "Your AI creative director"}
          </p>
        </div>
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-lg text-[#666762] transition-colors hover:bg-white/[0.05] hover:text-[#a6a7a1]"
          aria-label="More chat options"
        >
          <Icon name="more" size={18} />
        </button>
      </header>

      <div ref={scrollAreaRef} className="studio-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-6">
        {!project ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <LogoMark size={36} />
            <h3 className="mt-4 text-[13px] font-semibold text-[#deddd8]">Start a creative conversation</h3>
            <p className="mt-2 max-w-[240px] text-[10px] leading-[1.65] text-[#74756f]">
              Create a project and I’ll guide you through its story and visual direction.
            </p>
            <button
              type="button"
              onClick={onCreateProject}
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.05] px-3.5 py-2.5 text-[10px] font-semibold text-[#dad9d4] hover:bg-white/[0.08]"
            >
              <Icon name="plus" size={15} />
              New project
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.length === 0 && isPlanningContext && (
              <ChatMessage
                role="assistant"
                content="Open story planning to choose a page count and create a suggested draft from your saved concept."
              />
            )}
            {messages.map((message) => (
              <ChatMessage key={message.id} role={message.role} content={message.content} />
            ))}

            {!isPlanningContext &&
              !isPageContext &&
              !isComplete &&
              (quickReplies.length > 0 ||
                (currentStep && OPTIONAL_ONBOARDING_STEPS.has(currentStep))) && (
                <div className="ml-10 border-l border-white/[0.07] pl-4">
                  <p className="mb-2.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#555650]">
                    Quick replies
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {quickReplies.map((reply) => (
                      <button
                        key={reply}
                        type="button"
                        onClick={() => submitMessage(reply)}
                        className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-[9px] text-[#92938d] transition-colors hover:border-white/[0.12] hover:bg-white/[0.05] hover:text-[#c7c7c0]"
                      >
                        {reply}
                      </button>
                    ))}
                    {currentStep && OPTIONAL_ONBOARDING_STEPS.has(currentStep) && (
                      <button
                        type="button"
                        onClick={() => submitMessage("Skip for now")}
                        className="rounded-full border border-dashed border-white/[0.09] px-2.5 py-1.5 text-[9px] text-[#6c6d67] transition-colors hover:text-[#a8a9a2]"
                      >
                        Skip for now
                      </button>
                    )}
                  </div>
                </div>
              )}

            {!isPlanningContext && !isPageContext && isComplete && (
              <div className="ml-10 rounded-xl border border-[#777fd7]/15 bg-[#777fd7]/[0.06] p-3.5">
                <p className="text-[10px] leading-relaxed text-[#aeb1d4]">
                  Your creative direction is ready. Review it or continue into editorial story planning.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectView("style_bible")}
                    className="rounded-lg bg-white/[0.07] px-2.5 py-2 text-[9px] font-semibold text-[#d4d4ce] hover:bg-white/[0.1]"
                  >
                    Edit direction
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectView("planning")}
                    className="rounded-lg bg-[#777fd7] px-2.5 py-2 text-[9px] font-semibold text-white hover:bg-[#868dde]"
                  >
                    Continue to planning
                  </button>
                </div>
              </div>
            )}

            {isPlanningContext && (
              <div className="ml-10 rounded-xl border border-[#777fd7]/15 bg-[#777fd7]/[0.06] p-3.5">
                {!project.storyPlan ? (
                  <>
                    <p className="text-[10px] leading-relaxed text-[#aeb1d4]">
                      Choose a common page count here, or use the custom count in the planning workspace.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[6, 8, 12].map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => {
                            onGenerateStoryPlan(count);
                            onSelectView("planning");
                          }}
                          className="rounded-lg bg-white/[0.07] px-2.5 py-2 text-[9px] font-semibold text-[#d4d4ce] hover:bg-white/[0.1]"
                        >
                          Generate {count} pages
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] leading-relaxed text-[#aeb1d4]">
                      {project.storyPlan.status === "approved"
                        ? "The sequence is approved. View its pages or return to the board to revise it."
                        : "Use the board for precise edits. These explicit actions keep the prototype deterministic."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onAddPage();
                          onSelectView("planning");
                        }}
                        className="rounded-lg bg-white/[0.07] px-2.5 py-2 text-[9px] font-semibold text-[#d4d4ce] hover:bg-white/[0.1]"
                      >
                        Add a page
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectView("planning")}
                        className="rounded-lg bg-white/[0.07] px-2.5 py-2 text-[9px] font-semibold text-[#d4d4ce] hover:bg-white/[0.1]"
                      >
                        Edit selected page
                      </button>
                      {project.storyPlan.status === "approved" ? (
                        <button
                          type="button"
                          onClick={() => onSelectView("pages")}
                          className="rounded-lg bg-[#657053] px-2.5 py-2 text-[9px] font-semibold text-white hover:bg-[#737e61]"
                        >
                          View approved pages
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={onApproveStoryPlan}
                          disabled={!project.storyPlan.pageBeats.length}
                          className="rounded-lg bg-[#777fd7] px-2.5 py-2 text-[9px] font-semibold text-white hover:bg-[#868dde] disabled:opacity-40"
                        >
                          Approve story plan
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {isPageContext && selectedPage && (
              <div className="ml-10 rounded-xl border border-[#777fd7]/15 bg-[#777fd7]/[0.06] p-3.5">
                <p className="text-[10px] leading-relaxed text-[#aeb1d4]">
                  Page-specific messages are saved verbatim as additional visual instructions. Vizzy won&apos;t infer unstated edits or story changes.
                </p>
                <button
                  type="button"
                  onClick={() => onSelectView("pages")}
                  className="mt-3 rounded-lg bg-white/[0.07] px-2.5 py-2 text-[9px] font-semibold text-[#d4d4ce] hover:bg-white/[0.1]"
                >
                  Back to approved pages
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-white/[0.04] bg-[#171816] p-4 pt-3">
        <ChatComposer
          value={input}
          onChange={setInput}
          onSubmit={() => submitMessage()}
          disabled={!project || isPlanningContext || (isComplete && !isPageContext)}
          placeholder={
            !project
              ? "Create a project to begin…"
              : isPageContext
                ? "Add a page-specific visual note…"
                : isPlanningContext
                  ? "Use the supported planning actions above"
                : isComplete
                  ? "Onboarding complete — your direction is saved"
                  : "Type your answer…"
          }
        />
        <p className="mt-2.5 text-center text-[8px] leading-relaxed text-[#4f504c]">
          Deterministic prototype · no AI service connected
        </p>
      </div>
    </aside>
  );
}
