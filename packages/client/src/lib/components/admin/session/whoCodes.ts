import { Globe, Users, type LucideIcon } from "lucide-react";
import type { Invite } from "@annotinder/contracts";

/** The two ways coders come to a study, as the cards and the Who codes form name them. */
export const WHO_CODES: Record<Invite["mode"], { icon: LucideIcon; title: string; short: string; long: string }> = {
  coders: {
    icon: Users,
    title: "Specific coders",
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

/** What choosing a mode starts with (contracts `Invite`). */
export const firstInvite = (mode: Invite["mode"]): Invite =>
  mode === "coders" ? { mode: "coders", link: "per_coder" } : { mode: "crowd" };
