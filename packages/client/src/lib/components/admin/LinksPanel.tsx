import { useState } from "react";
import {
  designItems,
  inviteOf,
  sessionItem,
  urlParamKey,
  type LinkResponse,
  type TopLevelItem,
} from "@annotinder/contracts";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { useDesignVersionQuery, useDeploymentQuery, useLinksQuery, useStudyQuery } from "../../admin/queries";
import { HelpButton } from "../../help/HelpButton";
import { InfoTip } from "@/components/ui/info-tip";
import { codeLinkUrl } from "../../session/coderSession";
import { LinkTable } from "./links/LinkTable";
import { LinksPerValue } from "./links/LinksPerValue";

interface LinksPanelProps {
  client: ResearcherApi;
}

/**
 * The Links page (docs/architecture.md §7): the links deploying made from
 * the design's who codes, one or one per coder. Here their access
 * settings (label, coder id, max uses), and revoking or renewing a link.
 * Links the design no longer makes are retired, never deleted: coders and
 * their answers refer to the link they came from.
 */
export function LinksPanel({ client }: LinksPanelProps) {
  const linksQuery = useLinksQuery(client);
  const deployment = useDeploymentQuery(client).data;
  // Links name the study by its public id
  const publicId = useStudyQuery(client).data?.publicId ?? "";
  const version = useDesignVersionQuery(client, deployment?.designVersionId ?? null).data;
  const items = (version ? designItems(version) : []) as TopLevelItem[];
  const session = sessionItem(items);
  const invite = inviteOf(session);
  const [showRetired, setShowRetired] = useState(false);

  // The URL parameters a link takes, with placeholders the panel (or the researcher) fills in.
  const urlParams = [
    ...(invite.mode === "crowd" && invite.coderParam && !invite.coderParam.optional
      ? [`${invite.coderParam.param}=<coder id>`]
      : []),
    ...(session?.urlParams ?? []).filter((p) => p.default === undefined).map((p) => `${urlParamKey(p)}=<${p.name}>`),
  ];
  const linkOf = (link: LinkResponse) => {
    const url = codeLinkUrl(publicId, link.secret);
    return urlParams.length ? `${url}${url.includes("?") ? "&" : "?"}${urlParams.join("&")}` : url;
  };
  // Expert coders who sign in: one link, and only the coders' addresses may code
  const emailCoders = invite.mode === "coders" && invite.link === "login";

  const links = linksQuery.data ?? [];
  const active = links.filter((l) => !l.retiredAt);
  const retired = links.filter((l) => l.retiredAt);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-1.5 text-lg font-medium">
          Links
          <InfoTip label="About links">
            Deploying the design makes its links: one, or with expert coders who get a link each, one per coder in the
            units&apos; coder set (<span className="font-mono">coder_set</span>). Links of coders who are gone are
            retired. Here you set who may use a link. Revoking stops new coders from joining with it; coders who already
            started keep working.
          </InfoTip>
          <HelpButton topic="links" label="Help: links" />
        </h2>
        {urlParams.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Links take these URL parameters (filled in by whoever shares them, e.g. a panel):{" "}
            <span className="font-mono">{urlParams.join("&")}</span>. Any link also takes an optional{" "}
            <span className="font-mono">source=…</span> ($session.source).
          </p>
        )}
        {emailCoders && (
          <div className="rounded-md border border-amber-500 bg-amber-500/10 p-2.5 text-xs">
            Coders sign in, so there is one link: each gets the units of the coder with their email address (the Coders
            page has the addresses). Other email addresses get &quot;This email address has no access to this
            study&quot;.
          </div>
        )}
        {linksQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading links...</p>
        ) : active.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {deployment
              ? "The deployed design makes no links right now (expert coders without a coder set?)."
              : "Deploy the design to get its links."}
          </p>
        ) : (
          <LinkTable client={client} links={active} linkOf={linkOf} />
        )}
      </section>

      {active.length > 0 && (
        <LinksPerValue session={session} links={active.map((l) => ({ label: l.label ?? "", link: linkOf(l) }))} />
      )}

      {retired.length > 0 && (
        <section className="flex flex-col gap-2">
          <button
            type="button"
            className="w-fit cursor-pointer text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setShowRetired(!showRetired)}
          >
            {showRetired ? "▾" : "▸"} Retired links ({retired.length}): the deployed design no longer makes them; they
            show &quot;This link is no longer active&quot;
          </button>
          {showRetired && <LinkTable client={client} links={retired} linkOf={linkOf} />}
        </section>
      )}
    </div>
  );
}
