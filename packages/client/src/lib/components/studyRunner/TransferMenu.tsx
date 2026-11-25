import { useState } from "react";
import { renderSVG } from "uqr";
import { Check, Copy, Loader2, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CoderApi } from "../../api/httpCoderApi";
import { logInWithAccount } from "../../session/coderSession";
import { useMenuKeys } from "../../keyboard/hooks";

/**
 * "Continue on another device": a one-time link + QR code for this session.
 * A coder whose session is linked to their email can also log in on the
 * other device (there: **Log in** on the "already started" notice, or in
 * this menu). Where the link offers a login, it is offered here too.
 */
export function TransferMenu({
  coderApi,
  transferUrl,
  login,
  canLogIn,
}: {
  coderApi: CoderApi;
  transferUrl: (token: string) => string;
  login: string | null;
  canLogIn: boolean;
}) {
  const [link, setLink] = useState<{ url: string; expiresAt: Date } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  useMenuKeys(isOpen);

  async function open(next: boolean) {
    setIsOpen(next);
    if (!next || !coderApi.createTransfer) return;
    setError(null);
    setCopied(false);
    try {
      const transfer = await coderApi.createTransfer();
      setLink({ url: transferUrl(transfer.token), expiresAt: new Date(transfer.expiresAt) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Popover open={isOpen} onOpenChange={open}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-bar-foreground transition-colors hover:bg-bar-foreground/15"
          title="Continue on another device"
          aria-label="Continue on another device"
        >
          <MonitorSmartphone className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-3 shadow-lg">
        <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Continue on another device
        </h4>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!error && !link && <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />}
        {link && (
          <>
            <div
              className="mx-auto w-44 rounded bg-white p-1"
              // uqr renders an SVG of rects from the URL; no user markup is involved.
              dangerouslySetInnerHTML={{ __html: renderSVG(link.url) }}
            />
            <div className="flex items-center gap-1">
              <input
                readOnly
                value={link.url}
                className="h-8 min-w-0 flex-1 rounded border border-input bg-background px-2 text-xs"
              />
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                title="Copy link"
                onClick={() => {
                  void navigator.clipboard?.writeText(link.url).then(() => setCopied(true));
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Scan or open this on your other device. It works once, until{" "}
              {link.expiresAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Anyone with the link can
              continue your session, so don&apos;t share it.
            </p>
          </>
        )}
        {login && (
          <p className="border-t pt-2.5 text-[11px] text-muted-foreground">
            Or open this study&apos;s link on the other device and choose <strong>Log in</strong> there (on the notice
            that you already started, or under &quot;Continue on another device&quot;): log in as{" "}
            <strong>{login}</strong>.
          </p>
        )}
        {canLogIn && (
          <div className="space-y-1.5 border-t pt-2.5">
            <p className="text-[11px] text-muted-foreground">
              Or log in: your answers are then kept with your account, and you continue on another device by opening
              this study&apos;s link and logging in there too.
            </p>
            <Button type="button" size="sm" variant="outline" className="w-full" onClick={logInWithAccount}>
              Log in
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
