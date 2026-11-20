import { DESIGN_FORMAT_VERSION, type RecipeInput } from "@annotinder/contracts";

// A new study from a design file (`designs/v<n>.json` in the results
// download, or Export › Design file in the editor): the design as a draft,
// with its unit fields, and no units yet. Made through
// `POST /study/from-recipe`.

/** What a design file holds, to show before making the study. */
export interface DesignImport {
  /** What to send; its name can be changed. */
  recipe: RecipeInput;
  /** Questions and loops at the top of the design. */
  items: number;
  /** The release the file was made with. */
  release: string;
}

/** Reads a design file. Throws with a message for people. */
export function readDesignFile(bytes: Uint8Array): DesignImport {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("This file isn't a design file: it can't be read as JSON.");
  }
  const file = json as {
    format?: unknown;
    formatVersion?: unknown;
    client?: { release?: unknown };
    name?: unknown;
    note?: unknown;
    design?: { items?: unknown; session?: unknown; public?: unknown; units?: unknown };
  };
  if (file.format !== "annotinder-design") throw new Error("This file isn't an AnnoTinder design file.");
  const release = typeof file.client?.release === "string" ? file.client.release : "unknown";
  if (typeof file.formatVersion === "number" && file.formatVersion > DESIGN_FORMAT_VERSION)
    throw new Error(`This file was made with a newer AnnoTinder (${release}): update this server to import it.`);
  const design = file.design;
  if (!design || !Array.isArray(design.items)) throw new Error("This design file has no design.");
  const recipe = {
    name: typeof file.name === "string" && file.name.trim() ? file.name : "Imported design",
    design: {
      ...(typeof file.note === "string" && file.note ? { note: file.note } : {}),
      ...(design.public ? { public: design.public } : {}),
      ...(design.session ? { session: design.session } : {}),
      ...(design.units ? { units: design.units } : {}),
      items: design.items,
    },
    publish: false,
  } as RecipeInput;
  return { recipe, items: design.items.length, release };
}
