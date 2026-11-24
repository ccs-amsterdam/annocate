import type { ReactNode } from "react";
import { Maximize2, Monitor, Smartphone } from "lucide-react";
import { PRESETS, presetOf, withSize, type DeviceView } from "./devices";

/** The preview's frame: phone, desktop or full width, and for a frame its preset and size. */
export function PreviewToolbar({
  view,
  onChange,
  children,
}: {
  view: DeviceView;
  onChange: (view: DeviceView) => void;
  /** Shown between the frame buttons and the size (which version is previewed). */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
        <FrameButton
          active={view.mode === "mobile" && !view.fullWidth}
          onClick={() => onChange({ ...view, mode: "mobile", fullWidth: false })}
        >
          <Smartphone className="h-3.5 w-3.5" />
          Mobile
        </FrameButton>
        <FrameButton
          active={view.mode === "desktop" && !view.fullWidth}
          onClick={() => onChange({ ...view, mode: "desktop", fullWidth: false })}
        >
          <Monitor className="h-3.5 w-3.5" />
          Desktop
        </FrameButton>
        <FrameButton active={view.fullWidth} onClick={() => onChange({ ...view, fullWidth: true })}>
          <Maximize2 className="h-3.5 w-3.5" />
          Full Width
        </FrameButton>
      </div>
      {children}
      {!view.fullWidth && <FrameSize view={view} onChange={onChange} />}
    </div>
  );
}

function FrameButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
        active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

const sizeInput = "h-8 w-16 rounded-md border border-input bg-background px-2 font-mono text-xs";

/** The frame's size: a device preset ("Custom" when the size is none of them), or a width and height. */
function FrameSize({ view, onChange }: { view: DeviceView; onChange: (view: DeviceView) => void }) {
  const presets = PRESETS[view.mode];
  const size = view.sizes[view.mode];
  const choosePreset = (label: string) => {
    const preset = presets.find((p) => p.label === label);
    if (preset) onChange(withSize(view, { width: preset.width, height: preset.height }));
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-medium text-muted-foreground">Preset:</span>
      <select
        className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium"
        value={presetOf(view)?.label ?? ""}
        onChange={(e) => choosePreset(e.target.value)}
      >
        <option value="" disabled>
          Custom
        </option>
        {presets.map((p) => (
          <option key={p.label} value={p.label}>
            {p.label}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1 border-l border-border pl-2">
        <span className="text-muted-foreground">W:</span>
        <input
          type="number"
          min={300}
          max={2560}
          step={10}
          value={size.width}
          onChange={(e) => onChange(withSize(view, { width: Number(e.target.value) }))}
          className={sizeInput}
        />
        <span className="text-muted-foreground">× H:</span>
        <input
          type="number"
          min={400}
          max={2000}
          step={10}
          value={size.height}
          onChange={(e) => onChange(withSize(view, { height: Number(e.target.value) }))}
          className={sizeInput}
        />
        <span className="text-muted-foreground">px</span>
      </div>
    </div>
  );
}
