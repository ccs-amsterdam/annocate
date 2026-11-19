import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// What AI assistants can read about designing a study (mcp.ts resources):
// the help topics about the editor, question types, layouts and
// distribution, and the glossary. The same markdown files as the app's help
// (client/src/lib/help/topics), read from `guideDir`:
//
//   <guideDir>/topics/*.md   the help topics (front matter: title, section, summary)
//   <guideDir>/glossary.md   the glossary
//
// In a checkout the default finds them in the repository; the Docker image
// copies them (Dockerfile, ANNOTINDER_GUIDE_DIR).

/** The help sections about designing: what assistants editing a design need. */
const DESIGN_SECTIONS = new Set(["Getting started", "Editor", "Question types", "Unit layouts", "Units and distribution", "Design notes"]);

export interface GuideDoc {
  /** `annotinder://help/<slug>` or `annotinder://glossary`. */
  uri: string;
  name: string;
  title: string;
  description: string;
  text: string;
}

/** In a checkout: the client's help topics and the docs' glossary. */
export function defaultGuideDir(): string | null {
  const repo = fileURLToPath(new URL("../../../", import.meta.url));
  return existsSync(join(repo, "packages/client/src/lib/help/topics")) ? repo : null;
}

function frontMatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return { meta, body: raw.slice(match[0].length) };
}

const cache = new Map<string, GuideDoc[]>();

/** The documents in a guide directory (a checkout's layout, or the image's). */
export function loadGuide(dir: string | null): GuideDoc[] {
  if (!dir) return [];
  const hit = cache.get(dir);
  if (hit) return hit;
  // A checkout keeps topics in the client package and the glossary in docs/; the image puts both in one folder
  const topicsDir = [join(dir, "topics"), join(dir, "packages/client/src/lib/help/topics")].find((d) => existsSync(d));
  const glossary = [join(dir, "glossary.md"), join(dir, "docs/glossary.md")].find((f) => existsSync(f));
  const docs: GuideDoc[] = [];
  if (topicsDir) {
    for (const file of readdirSync(topicsDir).filter((f) => f.endsWith(".md")).sort()) {
      const { meta, body } = frontMatter(readFileSync(join(topicsDir, file), "utf8"));
      if (!DESIGN_SECTIONS.has(meta.section ?? "")) continue;
      const slug = file.replace(/\.md$/, "");
      docs.push({
        uri: `annotinder://help/${slug}`,
        name: slug,
        title: meta.title ?? slug,
        description: `${meta.section}: ${meta.summary ?? ""}`.trim(),
        text: `# ${meta.title ?? slug}\n\n${body}`,
      });
    }
  }
  if (glossary)
    docs.push({
      uri: "annotinder://glossary",
      name: "glossary",
      title: "Glossary",
      description: "The terms AnnoTinder uses (study, design, codebook, unit, set, link, deploy ...) and what they mean",
      text: readFileSync(glossary, "utf8"),
    });
  cache.set(dir, docs);
  return docs;
}
