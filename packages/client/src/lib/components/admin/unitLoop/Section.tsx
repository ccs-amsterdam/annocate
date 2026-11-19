import { type ReactNode } from "react";
import { HelpButton } from "../../../help/HelpButton";

/** A titled part of a tab, with a line of help and a help topic. */
export function Section({
  title,
  help,
  topic,
  children,
}: {
  title: string;
  help?: string;
  topic?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="flex items-center gap-1.5 text-xs font-semibold">
          {title}
          {topic && <HelpButton topic={topic} label={`Help: ${title}`} />}
        </h3>
        {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
      </div>
      {children}
    </section>
  );
}
