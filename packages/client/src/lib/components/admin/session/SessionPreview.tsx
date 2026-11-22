import type { ReactNode } from "react";
import { inviteOf, urlParamKey, type SessionItem, type SetGroupResponse, type UrlParam } from "@annotinder/contracts";
import type { SessionTab } from "./sessionTab";

/** A link as coders get it (the secret is made when deploying). */
const linkBase = (studyId: number | undefined) =>
  `${typeof window === "undefined" ? "" : window.location.origin}/code/${studyId ?? "<study>"}?link=…`;

/** The URL parameters a link must or may carry, as they look in it. */
const paramPart = (params: UrlParam[]) =>
  params
    .filter((p) => p.default === undefined)
    .map((p) => `&${urlParamKey(p)}=<${p.name}>`)
    .join("");

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs break-all">{children}</code>
);

/**
 * What a part of the Study entry means for coders: the links they get
 * (invitations), what a link must carry (URL parameters), how the coding
 * screen looks (display).
 */
export function SessionPreview({
  item,
  part,
  groups,
  studyId,
}: {
  item: SessionItem;
  part: SessionTab;
  groups: SetGroupResponse[];
  studyId: number | undefined;
}) {
  const params = item.urlParams ?? [];
  const base = linkBase(studyId) + paramPart(params);
  return (
    <div className="flex flex-col gap-3">
      {part === "invite" && <InvitePreview item={item} groups={groups} base={base} />}
      {part === "urlParams" && <ParamsPreview params={params} base={base} />}
      {part === "display" && <DisplayPreview display={item.display} />}
    </div>
  );
}

function InvitePreview({ item, groups, base }: { item: SessionItem; groups: SetGroupResponse[]; base: string }) {
  const invite = inviteOf(item);
  if (invite.mode === "crowd") {
    const id = invite.coderParam;
    return (
      <div>
        <Row label="Links">
          One link for everyone: <Code>{base + (id && !id.optional ? `&${id.param}=<coder id>` : "")}</Code>
        </Row>
        <Row label="Who the coder is">
          {id
            ? `The coder id in ?${id.param}=${id.optional ? " (optional)" : ""}`
            : invite.login
              ? "Their email (they sign in)"
              : "Anonymous: a session per browser"}
        </Row>
        {invite.login && <Row label="Signing in">Coders sign in before they start</Row>}
        <Row label="Units">
          {invite.share
            ? `Shared: handed out until ${invite.share.codersPerUnit?.min ?? 1} coder(s) per unit${
                invite.share.codersPerUnit?.max ? `, at most ${invite.share.codersPerUnit.max}` : ""
              }`
            : "Every coder gets all units"}
        </Row>
        {invite.maxCoders !== undefined && <Row label="At most">{invite.maxCoders} coders</Row>}
      </div>
    );
  }
  const column = groups.find((g) => g.name === invite.column);
  const names = column?.sets.map((s) => s.name).filter((n) => !n.startsWith("_")) ?? [];
  return (
    <div>
      <Row label="Coders">
        {column ? (
          `${names.length} in the column ${invite.column}`
        ) : (
          <span className="text-destructive">No column {invite.column} yet</span>
        )}
      </Row>
      <Row label="Links">
        {invite.link === "per_coder"
          ? "A link per coder, made when you deploy (Deploy › Links)"
          : invite.link === "pick_name"
            ? "One link; coders pick their name from the list"
            : "One link; coders sign in, and get the units of their email address"}
      </Row>
      {invite.link === "per_coder" &&
        names.slice(0, 8).map((n) => (
          <Row key={n} label={n}>
            <Code>{base}</Code>
          </Row>
        ))}
      {invite.link !== "per_coder" && (
        <Row label="The link">
          <Code>{base}</Code>
        </Row>
      )}
      {invite.link === "pick_name" && names.length > 0 && (
        <Row label="Names to pick">{names.slice(0, 20).join(", ") + (names.length > 20 ? ", …" : "")}</Row>
      )}
      {names.length > 8 && invite.link === "per_coder" && (
        <p className="text-xs text-muted-foreground">…and {names.length - 8} more.</p>
      )}
    </div>
  );
}

function ParamsPreview({ params, base }: { params: UrlParam[]; base: string }) {
  return (
    <div>
      <Row label="A link">
        <Code>{base}</Code>
      </Row>
      {params.length === 0 && <Row label="Parameters">None: links need nothing extra</Row>}
      {params.map((p) => (
        <Row key={p.name} label={`$session.${p.name}`}>
          <Code>?{urlParamKey(p)}=</Code> {p.default === undefined ? "required" : `optional (default ${p.default})`}
          {p.values && `; one of ${p.values.map((v) => v.value).join(", ")}`}
          {p.pattern !== undefined && `; matching ${p.pattern}`}
        </Row>
      ))}
      <Row label="Always">
        <Code>$session.source</Code> from an optional <Code>?source=</Code>
      </Row>
    </div>
  );
}

function DisplayPreview({ display }: { display: SessionItem["display"] }) {
  const responsive = display?.layouts === "responsive";
  const theme = display?.theme ?? "coder";
  return (
    <div>
      <Row label="Answer layouts">
        {responsive
          ? "Responsive: answers rearrange to the screen's width; the numpad mapping is offered"
          : "Fixed: every coder sees the layout you chose, on any screen"}
      </Row>
      <Row label="Theme">
        {theme === "coder" ? "Light, unless the coder switches to dark (coder settings)" : `Always ${theme}`}
      </Row>
      <Row label="Coders can change">
        {["the keys for answers", ...(theme === "coder" ? ["light or dark"] : []), "showing key badges"].join(", ")}
      </Row>
    </div>
  );
}
