import { Link } from "@tanstack/react-router";
import { ArrowRight, FileCheck2, FlaskConical, Layers, PenTool, Users } from "lucide-react";
import { Logo } from "../components/Logo";
import type { LucideIcon } from "lucide-react";

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Layers,
    title: "Annotation, surveys and experiments",
    text: "Code texts and images, ask survey questions, and randomize conditions: in one study, on any device.",
  },
  {
    icon: Users,
    title: "Coders, crowds and panels",
    text: "Hand out units to your team or to a crowd, with overlap, practice and gold units to check quality.",
  },
  {
    icon: FileCheck2,
    title: "Reproducible by design",
    text: "Every deployment records its design and the AnnoTinder version it ran on, ready to archive with your data.",
  },
];

/** The start page (`/`): what AnnoTinder is, and the way into the researcher and coder sections. */
export function WelcomePage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-16">
      <section className="text-center">
        <Logo smoke className="mx-auto h-16 w-16 text-wood" />
        <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight sm:text-5xl">AnnoTinder</h1>
        <p className="mt-2 text-sm font-medium text-muted-foreground">Open-source annotation for research</p>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Design a coding task or a survey, share a link, and collect clean, documented data: quick for coders, transparent for researchers.
        </p>
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-2" aria-label="Get started">
        <EntryCard
          to="/research"
          icon={FlaskConical}
          title="I'm a researcher"
          text="Create studies, upload units, design what coders see, deploy and download the results."
          action="Go to your studies"
        />
        <EntryCard
          to="/code"
          icon={PenTool}
          title="I'm a coder"
          text="Continue the studies you take part in on this device. New studies start from the link a researcher gave you."
          action="Go to coding"
        />
      </section>

      <section className="mt-12 grid gap-6 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title}>
            <Icon className="h-5 w-5 text-leaf-strong" />
            <h2 className="mt-2 text-sm font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}

function EntryCard({ to, icon: Icon, title, text, action }: { to: "/research" | "/code"; icon: LucideIcon; title: string; text: string; action: string }) {
  return (
    <Link
      to={to}
      className="group flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span className="mt-4 font-heading text-lg font-semibold">{title}</span>
      <span className="mt-1 flex-1 text-sm text-muted-foreground">{text}</span>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
        {action}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
