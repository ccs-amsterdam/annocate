import { useCallback, useEffect, useState } from "react";
import type { ApiKeyCreated, ApiKeyResponse, MeResponse } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KeyRound, LogOut, UserCircle } from "lucide-react";

/** The logged-in researcher: their email, API keys and logging out. */
export function AccountMenu({ client, me, onLoggedOut }: { client: ResearcherApi; me: MeResponse; onLoggedOut?: () => void }) {
  const [keysOpen, setKeysOpen] = useState(false);

  async function logOut() {
    await client.logout();
    if (onLoggedOut) onLoggedOut();
    else window.location.reload();
  }

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
            <UserCircle className="h-4 w-4" />
            {me.email}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-1.5">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={() => setKeysOpen(true)}>
            <KeyRound className="h-4 w-4" /> API keys
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={logOut}>
            <LogOut className="h-4 w-4" /> Log out
          </Button>
        </PopoverContent>
      </Popover>
      {keysOpen && <ApiKeysDialog client={client} onClose={() => setKeysOpen(false)} />}
    </>
  );
}

/** Lists, creates and revokes the researcher's API keys (for R, Python and other scripts). */
function ApiKeysDialog({ client, onClose }: { client: ResearcherApi; onClose: () => void }) {
  const [keys, setKeys] = useState<ApiKeyResponse[] | null>(null);
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      client
        .listApiKeys()
        .then(setKeys)
        .catch((err: unknown) => setError(String(err))),
    [client],
  );
  useEffect(() => {
    void reload();
  }, [reload]);

  async function create() {
    setError(null);
    try {
      setCreated(await client.createApiKey(label.trim() || "API key"));
      setLabel("");
      await reload();
    } catch (err) {
      setError(String(err));
    }
  }

  async function revoke(id: number) {
    if (!confirm("Revoke this key? Scripts using it stop working.")) return;
    await client.revokeApiKey(id).catch((err: unknown) => setError(String(err)));
    await reload();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>API keys</DialogTitle>
          <DialogDescription>For scripts (R, Python) and other systems: they act as you, in every job you have a role in.</DialogDescription>
        </DialogHeader>
        {created && (
          <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 p-3">
            <p className="text-xs font-semibold">Copy this key now: it won't be shown again.</p>
            <code className="break-all text-xs">{created.key}</code>
          </div>
        )}
        <div className="flex gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What is it for? e.g. laptop R scripts" />
          <Button onClick={create}>Create</Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <ul className="flex flex-col divide-y divide-border text-xs">
          {keys?.map((key) => (
            <li key={key.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                <span className="font-medium">{key.label}</span>{" "}
                <code className="text-muted-foreground">{key.prefix}…</code>
                <span className="block text-muted-foreground">
                  {key.revokedAt
                    ? `revoked ${new Date(key.revokedAt).toLocaleDateString()}`
                    : `last used ${key.lastUsed ? new Date(key.lastUsed).toLocaleDateString() : "never"}`}
                </span>
              </span>
              {!key.revokedAt && (
                <Button variant="ghost" size="sm" onClick={() => revoke(key.id)}>
                  Revoke
                </Button>
              )}
            </li>
          ))}
          {keys?.length === 0 && <li className="py-2 text-muted-foreground">No keys yet.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
