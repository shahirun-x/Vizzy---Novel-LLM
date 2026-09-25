import { Icon, type IconName } from "@/components/ui/icon";

interface SidebarItemProps {
  icon: IconName;
  label: string;
  active?: boolean;
  badge?: string;
  onClick?: () => void;
}

export function SidebarItem({ icon, label, active = false, badge, onClick }: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex h-10 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[13px] transition-colors max-[960px]:justify-center max-[960px]:px-0 ${
        active
          ? "bg-white/[0.075] text-[#f5f3ef]"
          : "text-[#92938e] hover:bg-white/[0.045] hover:text-[#d5d4cf]"
      }`}
      aria-current={active ? "page" : undefined}
      title={label}
    >
      <Icon name={icon} size={18} className={active ? "text-[#aeb3ef]" : "text-[#777873]"} />
      <span className="flex-1 max-[960px]:hidden">{label}</span>
      {badge && (
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] tracking-wide text-[#777873] max-[960px]:hidden">
          {badge}
        </span>
      )}
    </button>
  );
}
