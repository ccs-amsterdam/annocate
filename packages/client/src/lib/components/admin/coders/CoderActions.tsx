import { Mail, Trash2, UserMinus } from "lucide-react";
import type { CoderResponse, LinkResponse } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { codeLinkUrl } from "../../../session/coderSession";
import { CoderLink } from "./CoderLink";

/**
 * A coder's row actions: their email address and own link (expert coders),
 * handing the units they haven't coded to the other coders, and deleting
 * them.
 */
export function CoderActions({
  coder,
  publicId,
  link,
  movable,
  onEditEmail,
  onHandOver,
  onDelete,
}: {
  coder: CoderResponse;
  /** The study's id in coder links. */
  publicId: string;
  /** Their own link, where the deployed design gives coders a link each. */
  link: LinkResponse | undefined;
  /** How many units of the draft they haven't coded and other coders can take. */
  movable: number;
  onEditEmail: () => void;
  onHandOver: () => void;
  onDelete: () => void;
}) {
  const expert = coder.kind === "expert";
  return (
    <>
      {expert && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Email address of ${coder.coder}`}
          title="Edit their email address"
          onClick={onEditEmail}
        >
          <Mail className="h-3.5 w-3.5" />
        </Button>
      )}
      {link && publicId && (
        <CoderLink coder={coder.coder} url={codeLinkUrl(publicId, link.secret)} revoked={link.revokedAt !== null} />
      )}
      {expert && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Move ${movable} units of ${coder.coder} to the other coders`}
          title={`Move the ${movable} units they haven't coded to the other coders (in the draft)`}
          disabled={movable === 0}
          onClick={onHandOver}
        >
          <UserMinus className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete ${coder.coder}`}
        title="Delete this coder and their data"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </>
  );
}
