import { z } from "zod";

// The design format's version, apart from version.ts so the design schemas can
// use it without importing what version.ts builds from them.

/**
 * The design file's format (`formatVersion`): bumped on a breaking change to
 * the design schema, so a viewer knows whether it can read a file. Older
 * files open in the viewer of the release they name.
 */
export const DESIGN_FORMAT_VERSION = 1;

/**
 * The format of a design someone sends (a design version, a recipe): left
 * out, the current one; never a newer one than this server knows.
 */
export const WrittenDesignFormatSchema = z
  .number()
  .int()
  .positive()
  .max(
    DESIGN_FORMAT_VERSION,
    `This server knows design format ${DESIGN_FORMAT_VERSION} and older: update it for a newer design`,
  )
  .optional();
