import { useCallback, useEffect, useState } from "react";
import { startAuthentication, startRegistration, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import type { MeResponse, Passkey } from "@annotinder/contracts";
import { Fingerprint, KeyRound, Trash2 } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatWhen } from "../../../admin/format";

// The second factor for researcher access (docs/security.md "Second
// factor"): with ANNOTINDER_2FA=annotinder a passkey checked here, with
// `oidc` the login provider's own.

const message = (err: unknown) =>
  err instanceof Error && err.name === "NotAllowedError" ? "Cancelled, or the passkey wasn't available. Try again." : err instanceof Error ? err.message : String(err);

/** Adds a passkey on this device (the browser asks for a fingerprint, face or PIN). Returns the recovery codes, if any. */
async function addPasskey(client: ResearcherApi, name: string): Promise<string[] | null> {
  const options = (await client.passkeyRegisterOptions()) as PublicKeyCredentialCreationOptionsJSON;
  const response = await startRegistration({ optionsJSON: options });
  return (await client.passkeyRegister(response, name)).recoveryCodes;
}

/** Recovery codes, shown once: to copy or download. */
function RecoveryCodes({ codes }: { codes: string[] }) {
  const text = `AnnoTinder recovery codes (each works once)\n\n${codes.join("\n")}\n`;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        Keep these <strong>recovery codes</strong> somewhere safe (a password manager, or on paper). Each works once, to get in when
        you lose your passkey. They are shown only now.
      </p>
      <pre className="rounded-md bg-muted p-3 font-mono text-sm">{codes.join("\n")}</pre>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(text)}>
          Copy
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
            a.download = "annotinder-recovery-codes.txt";
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          Download
        </Button>
      </div>
    </div>
  );
}

/**
 * Shown instead of the app while a login lacks the required second factor:
 * add a first passkey, or confirm with one (or a recovery code); with the
 * login provider's second factor (`oidc`), log in again with it.
 */
export function SecondFactorGate({ client, me, onConfirmed }: { client: ResearcherApi; me: MeResponse; onConfirmed: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("Passkey");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [code, setCode] = useState("");
  const logOut = () => void client.logout().then(() => window.location.reload());

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (me.twoFactor.mode === "oidc") {
    body = (
      <>
        <h1 className="font-heading text-lg font-bold">Log in with a second factor</h1>
        <p className="text-sm text-muted-foreground">
          This server asks for two-factor authentication to manage jobs, and your login ({me.email}) didn&apos;t use one. Set it up
          with your login provider, then log out and in again. Coding works without it.
        </p>
      </>
    );
  } else if (codes) {
    body = (
      <>
        <h1 className="font-heading text-lg font-bold">Your passkey is set up</h1>
        <RecoveryCodes codes={codes} />
        <Button onClick={onConfirmed}>I saved them: continue</Button>
      </>
    );
  } else if (me.twoFactor.passkeys === 0) {
    body = (
      <>
        <h1 className="font-heading text-lg font-bold">Add a passkey</h1>
        <p className="text-sm text-muted-foreground">
          To manage jobs on this server you confirm each login with a <strong>passkey</strong>: your device&apos;s fingerprint, face
          or PIN, or a security key. It is a second lock besides your login ({me.email}): someone who gets into your email or login
          account still can&apos;t reach your jobs. Coding works without it.
        </p>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Name (to recognise it later)
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Work laptop" />
        </label>
        <Button disabled={busy || !name.trim()} onClick={() => void run(async () => setCodes(await addPasskey(client, name.trim())))}>
          <Fingerprint className="mr-2 h-4 w-4" /> Add a passkey
        </Button>
        <p className="text-xs text-muted-foreground">
          A passkey that syncs (iCloud Keychain, Google Password Manager, 1Password) works on your other devices too. Add a second one
          later from the account menu.
        </p>
      </>
    );
  } else {
    body = (
      <>
        <h1 className="font-heading text-lg font-bold">Confirm it&apos;s you</h1>
        <p className="text-sm text-muted-foreground">Confirm this login ({me.email}) with your passkey.</p>
        <Button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const options = (await client.passkeyLoginOptions()) as PublicKeyCredentialRequestOptionsJSON;
              await client.passkeyLogin(await startAuthentication({ optionsJSON: options }));
              onConfirmed();
            })
          }
        >
          <Fingerprint className="mr-2 h-4 w-4" /> Use my passkey
        </Button>
        {!recovering ? (
          <button type="button" className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setRecovering(true)}>
            Lost your passkey? Use a recovery code
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <Input aria-label="Recovery code" placeholder="xxxx-xxxx-xxxx" value={code} onChange={(e) => setCode(e.target.value)} />
            <Button
              variant="outline"
              disabled={busy || !code.trim()}
              onClick={() =>
                void run(async () => {
                  await client.passkeyRecover(code.trim());
                  onConfirmed();
                })
              }
            >
              Use the recovery code
            </Button>
            <p className="text-xs text-muted-foreground">
              Then add a new passkey from the account menu. No codes left? A server administrator can reset your passkeys after
              checking who you are.
            </p>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-sm">
        {body}
        {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
        <Button variant="ghost" size="sm" className="self-start" onClick={logOut}>
          Log out
        </Button>
      </div>
    </div>
  );
}

/** The account menu's passkeys: list, add, remove, and new recovery codes. */
export function PasskeysDialog({ client, onClose }: { client: ResearcherApi; onClose: () => void }) {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    client.listPasskeys().then(setPasskeys, (err: unknown) => setError(message(err)));
  }, [client]);
  useEffect(load, [load]);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
      load();
    } catch (err) {
      setError(message(err));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Passkeys</DialogTitle>
          <DialogDescription>Each login to manage jobs is confirmed with one of these. Keep at least two, on different devices or synced.</DialogDescription>
        </DialogHeader>
        {codes ? (
          <>
            <RecoveryCodes codes={codes} />
            <Button className="self-start" onClick={() => setCodes(null)}>
              Done
            </Button>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1 text-sm">
              {(passkeys ?? []).map((p) => (
                <li key={p.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    added {formatWhen(p.created)}
                    {p.lastUsed ? `, last used ${formatWhen(p.lastUsed)}` : ""}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto"
                    aria-label={`Remove ${p.name}`}
                    disabled={(passkeys ?? []).length <= 1}
                    title={(passkeys ?? []).length <= 1 ? "Your only passkey: add another one first" : "Remove"}
                    onClick={() => confirm(`Remove the passkey "${p.name}"?`) && void run(() => client.deletePasskey(p.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input aria-label="Name of the new passkey" placeholder="Name, e.g. Phone" value={name} onChange={(e) => setName(e.target.value)} />
              <Button
                disabled={!name.trim()}
                onClick={() =>
                  void run(async () => {
                    await addPasskey(client, name.trim());
                    setName("");
                  })
                }
              >
                <Fingerprint className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                confirm("Make new recovery codes? The old ones stop working.") && void run(async () => setCodes((await client.renewRecoveryCodes()).recoveryCodes))
              }
            >
              New recovery codes
            </Button>
          </div>
        )}
        {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
