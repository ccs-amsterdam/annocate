import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { HELP_SECTIONS, HELP_TOPICS, headingId, helpLink, helpTopic, type HelpTopic } from "./topics";
import { openHelp, type HelpTarget } from "./helpStore";
import { HelpExample } from "./HelpExample";
import { highlightTemplate } from "./highlight";

interface HastNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: string[] };
  children?: HastNode[];
}

const textOf = (node: HastNode | undefined): string => (node?.type === "text" ? (node.value ?? "") : (node?.children ?? []).map(textOf).join(""));

/**
 * The help dialog's content (lazy, with the topics): the topic menu, the
 * topics by section, the open topic, and its headings ("On this page").
 * Laid out after the Tailwind CSS docs.
 */
export default function HelpContent({ target }: { target: HelpTarget }) {
  const topic = helpTopic(target.slug) ?? HELP_TOPICS[0];
  const main = useRef<HTMLDivElement>(null);
  const [headings, setHeadings] = useState<{ id: string; text: string; depth: number }[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = main.current;
    if (!el) return;
    setHeadings([...el.querySelectorAll<HTMLElement>("article h2[id], article h3[id]")].map((h) => ({ id: h.id, text: h.textContent ?? "", depth: h.tagName === "H2" ? 2 : 3 })));
    const anchor = target.anchor ? el.querySelector<HTMLElement>(`#${CSS.escape(target.anchor)}`) : null;
    if (anchor) anchor.scrollIntoView?.({ block: "start" });
    else el.scrollTop = 0;
  }, [target, topic]);

  const onScroll = () => {
    const el = main.current;
    if (!el) return;
    let current: string | null = null;
    for (const h of el.querySelectorAll<HTMLElement>("article h2[id], article h3[id]")) {
      if (h.getBoundingClientRect().top - el.getBoundingClientRect().top > 96) break;
      current = h.id;
    }
    setActive(current);
  };

  const index = HELP_TOPICS.indexOf(topic);
  const previous = HELP_TOPICS[index - 1];
  const next = HELP_TOPICS[index + 1];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 pr-14">
        <BookOpen className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Help</span>
        <span className="text-muted-foreground/50">/</span>
        <TopicMenu topic={topic} />
      </header>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Help topics" className="hidden w-64 shrink-0 overflow-y-auto border-r border-border px-5 py-6 md:block">
          {HELP_SECTIONS.map((section) => (
            <div key={section} className="mb-6">
              <h4 className="mb-2 text-xs font-semibold text-foreground">{section}</h4>
              <ul className="flex flex-col border-l border-border">
                {HELP_TOPICS.filter((t) => t.section === section).map((t) => (
                  <li key={t.slug}>
                    <button
                      type="button"
                      onClick={() => openHelp(t.slug)}
                      aria-current={t === topic ? "page" : undefined}
                      className={cn(
                        "-ml-px w-full cursor-pointer border-l py-1 pl-3 text-left text-[13px] transition-colors",
                        t === topic
                          ? "border-primary font-medium text-primary"
                          : "border-transparent text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground",
                      )}
                    >
                      {t.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div ref={main} onScroll={onScroll} className="min-w-0 flex-1 overflow-y-auto">
          <article className="mx-auto max-w-3xl px-6 pb-16 pt-8 sm:px-10">
            <p className="mb-1 text-sm font-semibold text-primary">{topic.section}</p>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{topic.title}</h1>
            {topic.summary && <p className="mt-3 text-lg text-muted-foreground">{topic.summary}</p>}
            <div className="help-prose mt-8">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents(topic.slug)}>
                {topic.body}
              </ReactMarkdown>
            </div>
            <footer className="mt-12 flex justify-between gap-4 border-t border-border pt-6 text-sm">
              {previous ? <PagerLink topic={previous} direction="previous" /> : <span />}
              {next && <PagerLink topic={next} direction="next" />}
            </footer>
          </article>
        </div>

        <aside className="hidden w-56 shrink-0 overflow-y-auto py-8 pr-6 xl:block">
          {headings.length > 0 && (
            <>
              <h4 className="mb-3 text-xs font-semibold text-foreground">On this page</h4>
              <ul className="flex flex-col gap-2 text-[13px]">
                {headings.map((h) => (
                  <li key={h.id} className={h.depth === 3 ? "pl-3" : undefined}>
                    <a
                      href={`#${h.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        main.current?.querySelector(`#${CSS.escape(h.id)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className={cn("block transition-colors hover:text-foreground", active === h.id ? "text-primary" : "text-muted-foreground")}
                    >
                      {h.text}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

/** The dropdown to go to any topic, with a search box. */
function TopicMenu({ topic }: { topic: HelpTopic }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-muted"
          aria-label="Go to another help topic"
        >
          <span className="hidden text-muted-foreground sm:inline">{topic.section}</span>
          <ChevronRight className="hidden h-3.5 w-3.5 text-muted-foreground sm:inline" />
          <span className="truncate font-medium">{topic.title}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-0">
        <Command defaultValue={topic.slug}>
          <CommandInput placeholder="Search help…" />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>No topic found.</CommandEmpty>
            {HELP_SECTIONS.map((section) => (
              <CommandGroup key={section} heading={section}>
                {HELP_TOPICS.filter((t) => t.section === section).map((t) => (
                  <CommandItem
                    key={t.slug}
                    value={t.slug}
                    keywords={[t.title, t.summary, section]}
                    onSelect={() => {
                      setOpen(false);
                      openHelp(t.slug);
                    }}
                    className="flex flex-col items-start gap-0"
                  >
                    <span className={cn("text-sm", t === topic && "font-semibold text-primary")}>{t.title}</span>
                    {t.summary && <span className="line-clamp-1 text-xs text-muted-foreground">{t.summary}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PagerLink({ topic, direction }: { topic: HelpTopic; direction: "previous" | "next" }) {
  return (
    <button
      type="button"
      onClick={() => openHelp(topic.slug)}
      className={cn("group flex cursor-pointer flex-col gap-0.5", direction === "next" && "ml-auto items-end text-right")}
    >
      <span className="text-xs text-muted-foreground">{direction === "next" ? "Next" : "Previous"}</span>
      <span className="flex items-center gap-1 font-medium text-foreground group-hover:text-primary">
        {direction === "previous" && <ChevronLeft className="h-4 w-4" />}
        {topic.title}
        {direction === "next" && <ChevronRight className="h-4 w-4" />}
      </span>
    </button>
  );
}

function heading(Tag: "h2" | "h3") {
  return function Heading({ node, children }: { node?: unknown; children?: ReactNode }) {
    return <Tag id={headingId(textOf(node as HastNode))}>{children}</Tag>;
  };
}

/** How topic markdown renders: heading ids, links between topics, examples and template code. */
function markdownComponents(slug: string): Components {
  return {
    h2: heading("h2"),
    h3: heading("h3"),
    a({ href, children }) {
      const link = href ? helpLink(href, slug) : null;
      if (link)
        return (
          <a
            href={`#${link.anchor ?? ""}`}
            onClick={(e) => {
              e.preventDefault();
              openHelp(link.anchor ? `${link.slug}#${link.anchor}` : link.slug);
            }}
          >
            {children}
          </a>
        );
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
    pre({ node, children }) {
      const code = (node as HastNode | undefined)?.children?.find((c) => c.tagName === "code");
      const language = code?.properties?.className?.find((c) => c.startsWith("language-"))?.slice("language-".length);
      const text = textOf(code).replace(/\n$/, "");
      if (language === "example") return <HelpExample source={text} />;
      if (language === "template") return <pre>{highlightTemplate(text)}</pre>;
      return <pre>{children}</pre>;
    },
    table({ children }) {
      return (
        <div className="overflow-x-auto">
          <table>{children}</table>
        </div>
      );
    },
  };
}
