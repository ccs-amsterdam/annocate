import { z } from "zod";

/**
 * A person's own settings (`GET` / `PUT /api/coder/settings`): how the
 * coding screen (and the researcher UI's theme) works for them, kept with
 * their login so it follows them to every device. Without a login they stay
 * in the browser. Each is optional: absent, the default (or the browser's).
 * Accessibility settings will join them.
 */
export const UserSettingsSchema = z
  .object({
    theme: z.enum(["light", "dark"]).optional(),
    /** Answer with keys (answer shortcuts); off by default. */
    answerKeys: z.boolean().optional(),
    /** Which keys answer: the shortcut style. */
    keyMapping: z.enum(["numbers", "numpad", "letters", "filter"]).optional(),
    /** The shortcut badges on answers and buttons. */
    showShortcuts: z.boolean().optional(),
  })
  .strict();
export type UserSettings = z.infer<typeof UserSettingsSchema>;
