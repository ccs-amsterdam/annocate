import { Globe, Users, type LucideIcon } from "lucide-react";
import type { CoderKind } from "@annotinder/contracts";

/** The two kinds of coders a study can have, as the cards and the Who codes form name them. */
export const WHO_CODES: Record<CoderKind, { icon: LucideIcon; title: string; short: string; long: string }> = {
  expert: {
    icon: Users,
    title: "Expert coders",
    short: "Coders you know, each with their own units",
    long: "Best for content analysis with trained coders. Each coder has their own session, can come back to their job, and you can add units and redistribute them at any time.",
  },
  crowd: {
    icon: Globe,
    title: "Crowd (one link)",
    short: "One link for anyone: a survey, an experiment, or a crowd",
    long: "Best for many one-time coders: annotation at scale, or an experiment. Everyone starts from a single link, which a panel company can hand out, for example.",
  },
};
