import type { SignIn } from "@annotinder/contracts";
import { InfoTip } from "@/components/ui/info-tip";

/**
 * Whether coders sign in (docs/architecture.md §7): for the whole
 * study, not per link. Coders given by email address always sign in: then
 * the choice is shown, locked.
 */
export function SignInSetting({ value, onChange, emailCoders }: { value: SignIn; onChange: (value: SignIn) => void; emailCoders: boolean }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex items-center gap-1 font-medium">
        Coders sign in
        <InfoTip label="About signing in">
          <strong>Off</strong>: coders start from their link, without an account; their session stays on their device (they can move it
          to another device with a code). <strong>Optional</strong>: they may sign in, to continue on any device. <strong>Required</strong>:
          they must sign in with a verified email address first, e.g. to make sure each person codes once. When the units are divided over
          coders by email address, sign-in is required: that is how coders get their own units.
        </InfoTip>
      </span>
      <select
        aria-label="Coders sign in"
        className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-70"
        value={emailCoders ? "required" : value}
        disabled={emailCoders}
        onChange={(e) => onChange(e.target.value as SignIn)}
      >
        <option value="off">Off: anonymous links</option>
        <option value="optional">Optional: to continue on any device</option>
        <option value="required">{emailCoders ? "Required (coders sign in with their email)" : "Required"}</option>
      </select>
    </label>
  );
}
