import { useState, useEffect } from "react";
import {
  CODER_SET,
  designItems,
  inviteOf,
  sessionItem,
  urlParamKey,
  type PreviewSession,
  type SessionItem,
} from "@annotinder/contracts";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import {
  useDesignVersionQuery,
  useDesignVersionsQuery,
  useDeploymentQuery,
  useSetGroupsQuery,
  useUnitsQuery,
} from "../../admin/queries";
import { columnValues } from "../../design/assignment";
import { describeVersions } from "../../design/versions";
import { StudyRunner } from "../StudyRunner";
import { Button } from "@/components/ui/button";
import { Smartphone, Monitor, RotateCcw, AlertCircle, Maximize2 } from "lucide-react";

interface StudyPreviewProps {
  client: ResearcherApi;
  /** Where coder sessions run (`<url>/d/...`); normally the client's own origin (""): session cookies are same-origin. */
  coderApiUrl?: string;
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

/**
 * The Preview page: runs the study's latest design version (the draft, else
 * the live one) in a device frame. The server runs it as a preview
 * deployment: coders and answers stay in its memory, nothing is stored.
 * Each preview session gets a fresh token, and with it a fresh coder.
 */
export function StudyPreview({ client, coderApiUrl = "" }: StudyPreviewProps) {
  const designVersionsQuery = useDesignVersionsQuery(client);
  const deploymentQuery = useDeploymentQuery(client);
  const unitsQuery = useUnitsQuery(client);

  const [deviceMode, setDeviceMode] = useState<"mobile" | "desktop">("mobile");
  const [mobileWidth, setMobileWidth] = useState<number>(375);
  const [mobileHeight, setMobileHeight] = useState<number>(667);
  const [desktopWidth, setDesktopWidth] = useState<number>(1024);
  const [desktopHeight, setDesktopHeight] = useState<number>(768);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  const [previewKey, setPreviewKey] = useState(() => `preview-${client.studyId}-${Date.now()}`);
  const [preview, setPreview] = useState<PreviewSession | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function initPreviewLink() {
      setCreatingLink(true);
      setError(null);
      try {
        const session = await client.createPreview();
        if (!cancelled) {
          setPreview(session);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setCreatingLink(false);
        }
      }
    }

    initPreviewLink();
    return () => {
      cancelled = true;
    };
  }, [client, previewKey]);

  // A reset starts a new preview coder (the browser's preview session cookie would continue the old one).
  const [wasReset, setWasReset] = useState(false);
  const handleReset = () => {
    setWasReset(true);
    setPreviewKey(`preview-${client.studyId}-${Date.now()}`);
  };
  // Who the preview runs as: a coder, URL parameters' values (as a link's URL would give them); a change starts over
  const [as, setAs] = useState<Record<string, string>>({});
  const previewAs = (key: string, value: string) => {
    setAs((current) => ({ ...current, [key]: value }));
    handleReset();
  };

  const designVersions = designVersionsQuery.data ?? [];
  const hasDesign = designVersions.length > 0;
  const latest = designVersions.at(-1);
  const latestStatus = latest
    ? describeVersions(designVersions, deploymentQuery.data?.designVersionId ?? null).statusOf(latest.id)
    : null;
  const hasUnits = (unitsQuery.data?.length ?? 0) > 0;
  const latestVersion = useDesignVersionQuery(client, latest?.id ?? null).data;
  const groups = useSetGroupsQuery(client).data ?? [];
  const session = latestVersion ? sessionItem(designItems(latestVersion)) : null;

  if (designVersionsQuery.isLoading || unitsQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="animate-pulse text-sm text-muted-foreground">Loading study preview...</p>
      </div>
    );
  }

  if (!hasDesign || !hasUnits) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-foreground">Study Not Ready For Preview</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          To preview how this study looks and works for coders, you need:
        </p>
        <ul className="mt-3 space-y-2 rounded-lg bg-muted/50 p-4 text-left text-sm">
          <li className="flex items-center gap-2">
            <span className={hasDesign ? "font-bold text-primary" : "text-muted-foreground"}>
              {hasDesign ? "✓" : "○"}
            </span>
            <span>Design with questions {hasDesign ? "(Ready)" : "(Missing)"}</span>
          </li>
          <li className="flex items-center gap-2">
            <span className={hasUnits ? "font-bold text-primary" : "text-muted-foreground"}>
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-3">
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
                isFullScreen ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Full Width
            </button>
          </div>

          {latest && (
            <span
              className="rounded-md bg-muted px-2 py-1 text-xs text-foreground"
              title="Preview runs the latest version. Coders keep using the live version until you deploy."
            >
              Previewing v{designVersions.length} (
              {latestStatus === "draft" ? "draft" : latestStatus === "live" ? "live" : "not live"})
            </span>
          )}

          {/* Device presets, and the size */}
          {!isFullScreen && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-muted-foreground">Preset:</span>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium"
                // The preset matching the current size, if any ("Custom" otherwise)
                value={
                  (deviceMode === "mobile" ? MOBILE_PRESETS : DESKTOP_PRESETS).find((p) =>
                    deviceMode === "mobile"
                      ? p.width === mobileWidth && p.height === mobileHeight
                      : p.width === desktopWidth && p.height === desktopHeight,
                  )?.label ?? ""
                }
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
                <option value="" disabled>
                  Custom
                </option>
                {(deviceMode === "mobile" ? MOBILE_PRESETS : DESKTOP_PRESETS).map((p) => (
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
                  value={currentWidth}
                  onChange={(e) => {
                    const w = Number(e.target.value);
                    if (deviceMode === "mobile") setMobileWidth(w);
                    else setDesktopWidth(w);
                  }}
                  className="h-8 w-16 rounded-md border border-input bg-background px-2 font-mono text-xs"
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
                  className="h-8 w-16 rounded-md border border-input bg-background px-2 font-mono text-xs"
                />
                <span className="text-muted-foreground">px</span>
              </div>
            </div>
          )}
        </div>

        <PreviewAs session={session} groups={groups} value={as} onChange={previewAs} />
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="gap-1.5 text-xs font-semibold"
          disabled={creatingLink}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset preview session
        </Button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto rounded-2xl bg-muted/20 p-2 sm:p-6">
        {creatingLink ? (
          <div className="flex h-64 items-center justify-center">
            <p className="animate-pulse text-sm text-muted-foreground">Initializing preview session...</p>
          </div>
        ) : error ? (
          <div className="p-4 text-center text-sm text-destructive">Failed to initialize preview: {error}</div>
        ) : preview ? (
          isFullScreen ? (
            /* Full width */
            <div className="h-full w-full overflow-hidden rounded-xl border border-border bg-background shadow-lg">
              <StudyRunner
                key={previewKey}
                baseUrl={`${coderApiUrl}/d/${preview.deploymentId}`}
                linkSecret={preview.token}
                urlParams={as}
                newSession={wasReset}
                preview={true}
              />
            </div>
          ) : deviceMode === "mobile" ? (
            /* A phone frame */
            <div
              style={{ width: mobileWidth, height: mobileHeight }}
              className="my-auto flex max-w-full flex-col overflow-hidden rounded-[38px] border-[10px] border-slate-900 bg-background shadow-2xl transition-all"
            >
              <div className="flex h-6 w-full shrink-0 items-center justify-center bg-slate-900">
                <div className="h-3.5 w-24 rounded-full bg-slate-950" />
              </div>
              <div className="flex-1 overflow-auto">
                <StudyRunner
                  key={previewKey}
                  baseUrl={`${coderApiUrl}/d/${preview.deploymentId}`}
                  linkSecret={preview.token}
                  urlParams={as}
                  newSession={wasReset}
                  preview={true}
                />
              </div>
              <div className="flex h-4 w-full shrink-0 items-center justify-center bg-slate-900">
                <div className="h-1 w-28 rounded-full bg-slate-700" />
              </div>
            </div>
          ) : (
            /* A desktop window frame */
            <div
              style={{ width: desktopWidth, height: desktopHeight }}
              className="my-auto flex max-w-full flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl transition-all"
            >
              <div className="flex h-8 w-full shrink-0 items-center gap-1.5 border-b border-border bg-muted px-3">
                <div className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-ember/70" />
                <span className="mx-auto font-mono text-[11px] text-muted-foreground">
                  Annotinder Preview ({desktopWidth} × {desktopHeight})
                </span>
              </div>
              <div className="flex-1 overflow-auto">
                <StudyRunner
                  key={previewKey}
                  baseUrl={`${coderApiUrl}/d/${preview.deploymentId}`}
                  linkSecret={preview.token}
                  urlParams={as}
                  newSession={wasReset}
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

/**
 * Who the preview runs as (the server's preview session values): with
 * specific coders, one of them (else the first); a URL parameter with a
 * list of values, one of them (else its default, or the first).
 */
function PreviewAs({
  session,
  groups,
  value,
  onChange,
}: {
  session: SessionItem | null;
  groups: Parameters<typeof columnValues>[0];
  value: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const invite = inviteOf(session);
  const coders = invite.mode === "coders" ? columnValues(groups, CODER_SET) : [];
  const params = (session?.urlParams ?? []).filter((p) => p.values && p.values.length > 1);
  if (coders.length < 2 && params.length === 0) return null;
  const select = "h-8 rounded-md border border-input bg-background px-2 text-xs";
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-semibold text-muted-foreground">Preview as</span>
      {coders.length > 1 && (
        <select
          aria-label="Preview as coder"
          className={select}
          value={value.coder ?? coders[0]}
          onChange={(e) => onChange("coder", e.target.value)}
        >
          {coders.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
      {params.map((p) => (
        <select
          key={p.name}
          aria-label={`Preview with ${p.name}`}
          className={select}
          value={value[urlParamKey(p)] ?? p.default ?? p.values![0].value}
          onChange={(e) => onChange(urlParamKey(p), e.target.value)}
        >
          {p.values!.map((v) => (
            <option key={v.value} value={v.value}>
              {p.name}: {v.label ?? v.value}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
