import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TabId } from "../../../admin/tabs";
import { openGuide } from "./guideStore";

/** In the study's header: the guide, on this page's section (where it was last in it). */
export function GuideButton({ page }: { page: TabId }) {
  return (
    <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => openGuide(page)}>
      <Compass className="h-3.5 w-3.5" />
      Guide
    </Button>
  );
}
