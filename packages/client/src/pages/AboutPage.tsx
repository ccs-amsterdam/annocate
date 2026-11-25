import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { ServerInfo } from "@annotinder/contracts";
import { loadServerInfo } from "../lib/api/serverInfo";

/**
 * About this server (`/about`): who runs it, where it is hosted, how to
 * reach them, its privacy statement and terms, and the AnnoTinder version.
 * All but the version is what the server's operator set (docs/hosting.md,
 * "Settings").
 */
export function AboutPage({ apiUrl }: { apiUrl: string }) {
  const [info, setInfo] = useState<ServerInfo | "failed" | null>(null);
  useEffect(() => {
    let live = true;
    loadServerInfo(apiUrl).then(
      (loaded) => live && setInfo(loaded),
      () => live && setInfo("failed"),
    );
    return () => {
      live = false;
    };
  }, [apiUrl]);

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <h1 className="font-heading text-2xl font-bold tracking-tight">About this server</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        AnnoTinder is software: each server is run by someone. This is what the people who run this one say about it.
      </p>
      {info === "failed" ? (
        <p className="mt-6 text-sm text-muted-foreground">This server&apos;s information could not be loaded.</p>
      ) : (
        info && <ServerInfoList info={info} />
      )}
    </main>
  );
}

export function ServerInfoList({ info }: { info: ServerInfo }) {
  return (
    <dl className="mt-6 divide-y divide-border rounded-xl border border-border bg-card px-4 text-sm">
      <Row label="Run by">{info.operator}</Row>
      <Row label="Hosted">{info.hosting}</Row>
      <Row label="Contact">{info.contact && <Contact contact={info.contact} />}</Row>
      <Row label="Privacy statement">{info.privacyUrl && <External url={info.privacyUrl} />}</Row>
      <Row label="Terms of use">{info.termsUrl && <External url={info.termsUrl} />}</Row>
      <Row label="Version">
        AnnoTinder {info.version.release} (commit {info.version.commit})
      </Row>
    </dl>
  );
}

/** One line of the list; without a value: that the operator didn't say. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 font-medium">{label}</dt>
      <dd className="min-w-0 break-words">{children || <span className="text-muted-foreground">Not stated</span>}</dd>
    </div>
  );
}

/** An email address becomes a link; anything else is shown as written. */
function Contact({ contact }: { contact: string }) {
  if (!/^[^\s@]+@[^\s@]+$/.test(contact)) return contact;
  return (
    <a href={`mailto:${contact}`} className="underline">
      {contact}
    </a>
  );
}

function External({ url }: { url: string }) {
  return (
    <a href={url} rel="noreferrer" className="underline">
      {url}
    </a>
  );
}

/** The way to the page, under the start page and the coder home. */
export function AboutLink() {
  return (
    <p className="pb-8 text-center text-xs text-muted-foreground">
      <Link to="/about" className="underline">
        About this server
      </Link>
    </p>
  );
}
