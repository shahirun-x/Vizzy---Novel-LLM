import { LogoMark } from "@/components/ui/logo-mark";

interface ChatMessageProps {
  content: string;
  role: "assistant" | "user";
}

export function ChatMessage({ content, role }: ChatMessageProps) {
  if (role === "user") {
    return (
      <div className="ml-9 flex justify-end">
        <div className="max-w-[92%] rounded-2xl rounded-br-md bg-[#343632] px-4 py-3 text-[12px] leading-[1.65] text-[#deddd8]">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <LogoMark size={27} />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="mb-1.5 text-[10px] font-semibold text-[#a6a79f]">Vizzy</div>
        <p className="text-[12px] leading-[1.7] text-[#c5c5bf]">{content}</p>
      </div>
    </div>
  );
}
