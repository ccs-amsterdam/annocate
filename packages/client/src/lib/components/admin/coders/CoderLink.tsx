import { Check, Copy, ExternalLink, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCopied } from "../links/useCopied";

/** An expert coder's own link: to copy and send them, or to open. */
export function CoderLink({ coder, url, revoked }: { coder: string; url: string; revoked: boolean }) {
  const { copied, copy } = useCopied();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`The link of ${coder}`} title="Their link">
          <Link2 className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-2 p-3 text-xs">
        <span className="font-mono break-all">{url}</span>
        {revoked && (
          <span className="text-destructive">Revoked: nobody can start with it (reopen it under Links).</span>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="xs" className="gap-1" onClick={() => void copy(url)}>
            {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button asChild variant="outline" size="xs" className="gap-1">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </a>
          </Button>
        </div>
        <span className="text-muted-foreground">
          Opening it starts {coder}&apos;s session in this browser: they would then have to confirm a new session on
          their own device.
        </span>
      </PopoverContent>
    </Popover>
  );
}
