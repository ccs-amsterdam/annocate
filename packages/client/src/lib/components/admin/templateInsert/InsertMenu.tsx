import { ChevronLeft, Code2, GitBranch, type LucideIcon } from "lucide-react";
import { block, type InsertSection, type SectionKey } from "./sections";

/** The Insert menu's first list: the sections to open, "Show if…" and the HTML block. */
export function InsertMenu({
  sections,
  onOpen,
  onCondition,
  onInsert,
}: {
  sections: Record<SectionKey, InsertSection>;
  onOpen: (section: SectionKey) => void;
  /** "Show if…": the condition is made in a dialog. */
  onCondition: () => void;
  onInsert: (snippet: string) => void;
}) {
  const open = (section: InsertSection) => (
    <MenuItem
      key={section.key}
      icon={section.icon}
      label={section.label}
      detail={section.detail}
      onClick={() => onOpen(section.key)}
    />
  );
  return (
    <>
      {[sections.headline, sections.text, sections.image, sections.snippet].map(open)}
      <div className="my-1 border-t border-border" />
      <MenuItem icon={GitBranch} label="Show if…" detail="only when a condition holds" onClick={onCondition} />
      {[sections.from, sections.style].map(open)}
      <MenuItem
        icon={Code2}
        label="HTML block"
        detail="your own HTML, shown in a sandbox"
        onClick={() => onInsert(block("::: html"))}
      />
    </>
  );
}

/** An opened section: what it can insert, or why there is nothing. */
export function InsertSectionList({
  section,
  onBack,
  onInsert,
}: {
  section: InsertSection;
  onBack: () => void;
  onInsert: (snippet: string) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-1 px-1 pb-1">
        <button
          type="button"
          title="Back"
          onClick={onBack}
          className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-muted"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">{section.title}</span>
      </div>
      {section.entries.length === 0 && <p className="px-2.5 py-1.5 text-xs text-muted-foreground">{section.empty}</p>}
      {section.entries.map((entry) => (
        <MenuItem
          key={entry.label}
          icon={entry.icon}
          label={entry.label}
          detail={entry.detail}
          onClick={() => onInsert(entry.snippet)}
        />
      ))}
    </>
  );
}

function MenuItem({
  icon: Icon,
  label,
  detail,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  detail?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-muted"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        {detail && <span className="text-[10px] text-muted-foreground">{detail}</span>}
      </span>
    </button>
  );
}
