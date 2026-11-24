import type { ReactNode } from "react";
import { MonitorSmartphone } from "lucide-react";
import { LogoSmoke } from "@/components/Logo";

export function LoadingScreen() {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center p-8 text-center">
      <LogoSmoke label="Loading session…" />
    </div>
  );
}

/** A screen with a message instead of a question: a title, and what the coder can do. */
export function SessionNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-[300px] items-center justify-center p-6">
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-lg">
        <div className="rounded-full bg-primary/10 p-3 text-primary">
          <MonitorSmartphone className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {children}
      </div>
    </div>
  );
}
