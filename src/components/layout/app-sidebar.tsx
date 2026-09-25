import { Icon } from "@/components/ui/icon";
import { LogoMark } from "@/components/ui/logo-mark";
import { SidebarItem } from "@/components/ui/sidebar-item";
import type { StudioView } from "@/hooks/use-project-store";
import type { Project } from "@/types/domain";

const navigation: Array<{
  icon: "story" | "palette" | "characters" | "pages";
  label: string;
  view: StudioView;
}> = [
  { icon: "story", label: "Story", view: "story" },
  { icon: "palette", label: "Style Bible", view: "style_bible" },
  { icon: "characters", label: "Characters", view: "characters" },
  { icon: "pages", label: "Pages", view: "pages" },
];

interface AppSidebarProps {
  projects: Project[];
  selectedProject: Project | null;
  activeView: StudioView;
  onCreateProject: () => void;
  onSelectProject: (projectId: string) => void;
  onSelectView: (view: StudioView) => void;
}

function getInitials(title: string) {
  return (
    title
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "US"
  );
}

export function AppSidebar({
  projects,
  selectedProject,
  activeView,
  onCreateProject,
  onSelectProject,
  onSelectView,
}: AppSidebarProps) {
  return (
    <aside className="flex h-dvh min-h-[650px] flex-col border-r border-white/[0.055] bg-[#151614] p-4 max-[960px]:px-3 max-[760px]:hidden">
      <div className="flex h-10 items-center gap-2.5 px-1">
        <LogoMark />
        <span className="text-[17px] font-semibold tracking-[-0.025em] text-[#f5f3ef] max-[960px]:hidden">
          vizzy
        </span>
      </div>

      <button
        type="button"
        onClick={onCreateProject}
        className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#777fd7] px-3 text-[11px] font-semibold text-white shadow-[0_7px_20px_rgba(105,113,205,.18)] transition-colors hover:bg-[#858dde] max-[960px]:px-0"
        title="New project"
      >
        <Icon name="plus" size={16} />
        <span className="max-[960px]:hidden">New project</span>
      </button>

      <div className="mt-6 flex items-center justify-between px-3 max-[960px]:hidden">
        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#555651]">Projects</span>
        <span className="text-[9px] text-[#50514d]">{projects.length}</span>
      </div>
      <div className="studio-scrollbar mt-2 max-h-[190px] space-y-1 overflow-y-auto max-[960px]:mt-5">
        {projects.length === 0 ? (
          <p className="px-3 py-2 text-[10px] leading-relaxed text-[#5f605b] max-[960px]:hidden">
            Create a project to begin.
          </p>
        ) : (
          projects.map((project) => {
            const isSelected = project.id === selectedProject?.id;

            return (
              <button
                key={project.id}
                type="button"
                onClick={() => onSelectProject(project.id)}
                className={`flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors max-[960px]:justify-center max-[960px]:px-0 ${
                  isSelected ? "bg-white/[0.075]" : "hover:bg-white/[0.04]"
                }`}
                title={project.title}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-[7px] text-[9px] font-semibold ${
                    isSelected
                      ? "bg-[#777fd7]/20 text-[#b9bdf0]"
                      : "bg-[#292a27] text-[#777873]"
                  }`}
                >
                  {getInitials(project.title)}
                </span>
                <span className="min-w-0 flex-1 max-[960px]:hidden">
                  <span className="block truncate text-[11px] font-medium text-[#d4d3ce]">
                    {project.title}
                  </span>
                  <span className="mt-0.5 block text-[9px] text-[#61625d]">
                    {project.onboarding.status === "complete"
                      ? "Creative direction ready"
                      : "Onboarding in progress"}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="mt-6 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#555651] max-[960px]:hidden">
        Workspace
      </div>
      <nav className="mt-2 space-y-1" aria-label="Project navigation">
        {navigation.map((item) => (
          <SidebarItem
            key={item.label}
            icon={item.icon}
            label={item.label}
            badge={
              item.view === "pages"
                ? String(
                    selectedProject?.storyPlan?.status === "approved"
                      ? selectedProject.storyPlan.pageBeats.length
                      : 0,
                  )
                : undefined
            }
            active={
              activeView === item.view ||
              (item.view === "pages" && activeView === "page_creation")
            }
            onClick={() => onSelectView(item.view)}
          />
        ))}
      </nav>

      <div className="mt-auto space-y-3">
        <SidebarItem icon="settings" label="Settings" />
        <div className="h-px bg-white/[0.05]" />
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl p-2 transition-colors hover:bg-white/[0.04] max-[960px]:justify-center"
          title="Your profile"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#7c83da] to-[#4e536f] text-[10px] font-semibold text-white">
            YS
          </span>
          <span className="min-w-0 flex-1 text-left max-[960px]:hidden">
            <span className="block truncate text-[11px] font-medium text-[#cac9c4]">Your studio</span>
            <span className="mt-0.5 block text-[10px] text-[#62635f]">Local prototype</span>
          </span>
          <Icon name="more" size={17} className="text-[#62635f] max-[960px]:hidden" />
        </button>
      </div>
    </aside>
  );
}
