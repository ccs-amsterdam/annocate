import { useState, useEffect } from "react";
import type { AdminClient } from "../../api/httpAdminClient";
import { useCodebooksQuery, useUnitsQuery } from "../../admin/queries";
import { JobRunner } from "../JobRunner";
import { Button } from "@/components/ui/button";
import { Smartphone, Monitor, RotateCcw, AlertCircle, Maximize2 } from "lucide-react";

interface JobPreviewProps {
  client: AdminClient;
  baseUrl: string;
}

interface DimensionPreset {
  label: string;
  width: number;
  height: number;
}

const MOBILE_PRESETS: DimensionPreset[] = [
  { label: "Small (320×568)", width: 320, height: 568 },
  { label: "iPhone SE (375×667)", width: 375, height: 667 },
  { label: "iPhone 15 (393×852)", width: 393, height: 852 },
  { label: "Large Phone (414×896)", width: 414, height: 896 },
];

const DESKTOP_PRESETS: DimensionPreset[] = [
  { label: "Tablet (768×1024)", width: 768, height: 1024 },
  { label: "Desktop Standard (1024×768)", width: 1024, height: 768 },
  { label: "Laptop HD (1280×800)", width: 1280, height: 800 },
];

export function JobPreview({ client, baseUrl }: JobPreviewProps) {
  const codebooksQuery = useCodebooksQuery(client);
  const unitsQuery = useUnitsQuery(client);

  const [deviceMode, setDeviceMode] = useState<"mobile" | "desktop">("mobile");
  const [mobileWidth, setMobileWidth] = useState<number>(375);
  const [mobileHeight, setMobileHeight] = useState<number>(667);
  const [desktopWidth, setDesktopWidth] = useState<number>(1024);
  const [desktopHeight, setDesktopHeight] = useState<number>(768);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  const [previewKey, setPreviewKey] = useState(() => `preview-${client.jobId}-${Date.now()}`);
  const [inviteSecret, setInviteSecret] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function initPreviewInvite() {
      setCreatingInvite(true);
      setError(null);
      try {
        const invite = await client.inviteCoder({
          label: "preview-session",
          access: "user_decides",
        });
        if (!cancelled) {
          setInviteSecret(invite.secret);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setCreatingInvite(false);
        }
      }
    }

    initPreviewInvite();
    return () => {
      cancelled = true;
    };
  }, [client, previewKey]);

  const handleReset = () => {
    setPreviewKey(`preview-${client.jobId}-${Date.now()}`);
  };

  const hasCodebook = (codebooksQuery.data?.length ?? 0) > 0;
  const hasUnits = (unitsQuery.data?.length ?? 0) > 0;

  if (codebooksQuery.isLoading || unitsQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">Loading job preview...</p>
      </div>
    );
  }

  if (!hasCodebook || !hasUnits) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-foreground">Job Not Ready For Preview</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          To preview how this job looks and works for annotators, you need:
        </p>
        <ul className="mt-3 text-left text-sm space-y-2 bg-muted/50 p-4 rounded-lg">
          <li className="flex items-center gap-2">
            <span className={hasCodebook ? "text-primary font-bold" : "text-muted-foreground"}>
              {hasCodebook ? "✓" : "○"}
            </span>
            <span>Codebook with questions {hasCodebook ? "(Ready)" : "(Missing)"}</span>
          </li>
          <li className="flex items-center gap-2">
            <span className={hasUnits ? "text-primary font-bold" : "text-muted-foreground"}>
              {hasUnits ? "✓" : "○"}
            </span>
            <span>Uploaded units {hasUnits ? "(Ready)" : "(Missing)"}</span>
          </li>
        </ul>
      </div>
    );
  }

  const currentWidth = deviceMode === "mobile" ? mobileWidth : desktopWidth;
  const currentHeight = deviceMode === "mobile" ? mobileHeight : desktopHeight;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Mode Switcher */}
          <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => {
                setDeviceMode("mobile");
                setIsFullScreen(false);
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                deviceMode === "mobile" && !isFullScreen
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              Mobile
            </button>
            <button
              type="button"
              onClick={() => {
                setDeviceMode("desktop");
                setIsFullScreen(false);
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                deviceMode === "desktop" && !isFullScreen
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Monitor className="h-3.5 w-3.5" />
              Desktop
            </button>
            <button
              type="button"
              onClick={() => setIsFullScreen(true)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                isFullScreen
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Full Width
            </button>
          </div>

          {/* Presets and Dimension Inputs */}
          {!isFullScreen && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground font-medium">Preset:</span>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium"
                onChange={(e) => {
                  const val = e.target.value;
                  const preset = (deviceMode === "mobile" ? MOBILE_PRESETS : DESKTOP_PRESETS).find(
                    (p) => p.label === val,
                  );
                  if (preset) {
                    if (deviceMode === "mobile") {
                      setMobileWidth(preset.width);
                      setMobileHeight(preset.height);
                    } else {
                      setDesktopWidth(preset.width);
                      setDesktopHeight(preset.height);
                    }
                  }
                }}
              >
                {(deviceMode === "mobile" ? MOBILE_PRESETS : DESKTOP_PRESETS).map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>

              {/* Adjustable Width & Height */}
              <div className="flex items-center gap-1 pl-2 border-l border-border">
                <span className="text-muted-foreground">W:</span>
                <input
                  type="number"
                  min={300}
                  max={2560}
                  step={10}
                  value={currentWidth}
                  onChange={(e) => {
                    const w = Number(e.target.value);
                    if (deviceMode === "mobile") setMobileWidth(w);
                    else setDesktopWidth(w);
                  }}
                  className="h-8 w-16 rounded-md border border-input bg-background px-2 text-xs font-mono"
                />
                <span className="text-muted-foreground">× H:</span>
                <input
                  type="number"
                  min={400}
                  max={2000}
                  step={10}
                  value={currentHeight}
                  onChange={(e) => {
                    const h = Number(e.target.value);
                    if (deviceMode === "mobile") setMobileHeight(h);
                    else setDesktopHeight(h);
                  }}
                  className="h-8 w-16 rounded-md border border-input bg-background px-2 text-xs font-mono"
                />
                <span className="text-muted-foreground">px</span>
              </div>
            </div>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="gap-1.5 text-xs font-semibold"
          disabled={creatingInvite}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset preview session
        </Button>
      </div>

      {/* Preview Container */}
      <div className="flex flex-1 items-center justify-center overflow-auto p-2 sm:p-6 bg-muted/20 rounded-2xl">
        {creatingInvite ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-muted-foreground animate-pulse">Initializing preview session...</p>
          </div>
        ) : error ? (
          <div className="p-4 text-center text-sm text-destructive">
            Failed to initialize preview: {error}
          </div>
        ) : inviteSecret ? (
          isFullScreen ? (
            /* Responsive Full Width */
            <div className="h-full w-full overflow-hidden rounded-xl border border-border bg-background shadow-lg">
              <JobRunner
                key={previewKey}
                baseUrl={baseUrl}
                coderKey={previewKey}
                inviteSecret={inviteSecret}
                preview={true}
              />
            </div>
          ) : deviceMode === "mobile" ? (
            /* Mobile Device Frame with simulated bezel */
            <div
              style={{ width: mobileWidth, height: mobileHeight }}
              className="max-w-full rounded-[38px] border-[10px] border-slate-900 bg-background shadow-2xl overflow-hidden flex flex-col my-auto transition-all"
            >
              {/* Top Speaker / Dynamic Island Notch */}
              <div className="h-6 w-full bg-slate-900 flex items-center justify-center shrink-0">
                <div className="h-3.5 w-24 rounded-full bg-slate-950" />
              </div>
              <div className="flex-1 overflow-auto">
                <JobRunner
                  key={previewKey}
                  baseUrl={baseUrl}
                  coderKey={previewKey}
                  inviteSecret={inviteSecret}
                  preview={true}
                />
              </div>
              {/* Bottom Home Indicator */}
              <div className="h-4 w-full bg-slate-900 flex items-center justify-center shrink-0">
                <div className="h-1 w-28 rounded-full bg-slate-700" />
              </div>
            </div>
          ) : (
            /* Desktop Device Frame with simulated window title bar */
            <div
              style={{ width: desktopWidth, height: desktopHeight }}
              className="max-w-full rounded-xl border border-border bg-background shadow-2xl overflow-hidden flex flex-col my-auto transition-all"
            >
              {/* Window Header */}
              <div className="flex h-8 w-full items-center gap-1.5 border-b border-border bg-muted px-3 shrink-0">
                <div className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-teal-500/60" />
                <span className="mx-auto text-[11px] font-mono text-muted-foreground">
                  Annotinder Preview ({desktopWidth} × {desktopHeight})
                </span>
              </div>
              <div className="flex-1 overflow-auto">
                <JobRunner
                  key={previewKey}
                  baseUrl={baseUrl}
                  coderKey={previewKey}
                  inviteSecret={inviteSecret}
                  preview={true}
                />
              </div>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
