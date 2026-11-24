import type { ReactNode } from "react";
import type { DeviceSize, DeviceView } from "./devices";

const FRAME = {
  full: "h-full w-full overflow-hidden rounded-xl border border-border bg-background shadow-lg",
  mobile:
    "my-auto flex max-w-full flex-col overflow-hidden rounded-[38px] border-[10px] border-slate-900 bg-background shadow-2xl transition-all",
  desktop:
    "my-auto flex max-w-full flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl transition-all",
};

/**
 * The preview in its frame: a phone, a desktop window, or over the full
 * width. One element holds the preview in every frame (by its key), so
 * changing the frame doesn't start the preview over.
 */
export function DeviceFrame({ view, children }: { view: DeviceView; children: ReactNode }) {
  const frame = view.fullWidth ? "full" : view.mode;
  const size = view.sizes[view.mode];
  return (
    <div style={frame === "full" ? undefined : size} className={FRAME[frame]}>
      {frame === "mobile" && <PhoneTop key="top" />}
      {frame === "desktop" && <WindowBar key="top" size={size} />}
      <div key="preview" className={frame === "full" ? "h-full" : "flex-1 overflow-auto"}>
        {children}
      </div>
      {frame === "mobile" && <PhoneBottom key="bottom" />}
    </div>
  );
}

function PhoneTop() {
  return (
    <div className="flex h-6 w-full shrink-0 items-center justify-center bg-slate-900">
      <div className="h-3.5 w-24 rounded-full bg-slate-950" />
    </div>
  );
}

function PhoneBottom() {
  return (
    <div className="flex h-4 w-full shrink-0 items-center justify-center bg-slate-900">
      <div className="h-1 w-28 rounded-full bg-slate-700" />
    </div>
  );
}

function WindowBar({ size }: { size: DeviceSize }) {
  return (
    <div className="flex h-8 w-full shrink-0 items-center gap-1.5 border-b border-border bg-muted px-3">
      <div className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
      <div className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
      <div className="h-2.5 w-2.5 rounded-full bg-ember/70" />
      <span className="mx-auto font-mono text-[11px] text-muted-foreground">
        Annotinder Preview ({size.width} × {size.height})
      </span>
    </div>
  );
}
