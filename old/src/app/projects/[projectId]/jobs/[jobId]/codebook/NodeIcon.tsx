import { CodebookNodeType } from "@/app/types";
import { ClipboardList, Dot, Folder, MessageCircleQuestionIcon, PenTool } from "lucide-react";

export function NodeIcon({
  type,
  className,
  tailwindSize = 4,
}: {
  type: CodebookNodeType | null;
  className?: string;
  tailwindSize?: number;
}) {
  const size = `${tailwindSize * 0.25}rem`;
  if (!type) return null;
  if (["Survey phase"].includes(type)) return <ClipboardList size={size} className={className || ""} />;
  if (["Annotation phase", "Annotation task"].includes(type))
    return <PenTool size={size} className={className || ""} />;
  if (["Annotation group", "Survey group"].includes(type)) return <Folder size={size} className={className || ""} />;
  if (["Question"].includes(type)) return <MessageCircleQuestionIcon size={size} className={className || ""} />;

  return <Dot size={size} className={className || ""} />;
}
