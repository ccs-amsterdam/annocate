import { Download, LayoutDashboard, Layers, Link2, PencilRuler, Send, Settings, Users } from "lucide-react";
import type { TabId } from "../../../admin/tabs";

/** The study's pages in the navigation (Preview has its own button), each with its icon. */
export const STUDY_PAGES: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "Overview", label: "Overview", icon: LayoutDashboard },
  { id: "Design", label: "Design", icon: PencilRuler },
  { id: "Units", label: "Units", icon: Layers },
  { id: "Coders", label: "Coders", icon: Users },
  { id: "Deploy", label: "Deploy", icon: Send },
  { id: "Links", label: "Links", icon: Link2 },
  { id: "Results", label: "Results", icon: Download },
  { id: "Settings", label: "Settings", icon: Settings },
];
