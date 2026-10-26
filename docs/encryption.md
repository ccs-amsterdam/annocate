# Encrypting answers between client and db server (possible hardening)

Status: discussion summary (2026-10-18). Not planned yet; an option to
consider later. Nothing here is built.

## Goal

The job server should not see participants' answers (personal data, e.g.
survey responses). Only that: unit content is not covered (the job server
serves it), and the job server stays trusted for integrity and for running
the job. The point is to need less trust in the job server *regarding
participants' PII*, and to be able to say of a public job server: "it never
sees your answers".

## Two variants

### Preferred: encrypt to the db server's public key

- The db server has an **encryption key pair**; its public key reaches the
  client in a way the job server can't spoof (see "Authenticity" below).
- The client encrypts answers to that public key (hybrid encryption:
  e.g. ECDH P-256 or X25519 + AES-GCM, all in WebCrypto) before they go to
  the job server. Only the db server can decrypt.
- **No direct call between client and db server is needed**: everything
  still flows through the job server, which only ever holds ciphertext. A
  db server doesn't need an endpoint clients can reach.
- **Resuming with earlier answers**: the client encrypts with a
  per-session symmetric key K and sends K once wrapped with the db server's
  public key (only the db server can unwrap it). The device keeps K, so it
  can read its earlier answers; a new device gets K through the transfer
  link (in the URL fragment, which is never sent to servers). See
  "Resuming" below for why this is the only way to resume.

### Alternative: a symmetric key exchanged directly with the db server

- **The db server holds the key.** Per session, the client generates a
  random **symmetric** key and exchanges it **directly with the db server**
  when it starts the job (new: today the client only talks to the job
  server).
- **The client encrypts answers** before sending them to the job server.
  The job server stores, caches and forwards ciphertext; the db server
  decrypts as soon as the job server passes a batch on.
- **The db server tells the client to encrypt** (part of what the client
  gets from the db server directly), so the job server can't switch it off.
- **Resuming:** the client doesn't need to keep the key. To resume, it
  proves to the db server that it may have the key again (a login, or the
  device credential); without either, it can't resume, except by
  transferring the session from an older device. There is **no** "resume
  with earlier answers hidden": the partial leaks through branching aren't
  worth the complexity.
- Everything else is the current design.
- Costs a direct client-to-db-server call (a public, CORS-enabled db
  endpoint) and binding keys to coders (open question 1); what it buys over
  the preferred variant is resuming on a new device by logging in, without
  a transfer link.

## Resuming (decided 2026-10-18)

Encryption doesn't change who may resume; it follows the general rule in
`docs/coder-identity.md` §1: **a participant id is a label, never a
credential**. Panel companies put it in the URL, so anyone with the link
has it. Continuing on another device needs a transfer link, for every job,
encrypted or not; or, where the db server sends email, a recovery link.

For encrypted jobs this means:

- **The session and K travel together.** The device with the session has K;
  a transfer link carries both. There is no state "may continue, but can't
  read its earlier answers", so branching and conditions on encrypted
  answers keep working as in any job. We don't restrict branching.
- **We don't support resuming with earlier answers hidden.** A participant
  link on a new device without the session works as today
  (`participant_has_session`): continue on the original device, make a
  transfer link there, or start a new session that can't see the earlier
  one.
- **No PINs or passwords** to unlock K: people forget them, and they add
  little over a link.
- **Login is access control, not recovery.** If a job uses auth, the job
  server authenticates the coder (`coder-identity.md` §5) and passes the
  verified identity to the db server, which decides who gets in. A login
  doesn't bring K to a new device: whoever verifies a login could claim to
  be anyone, so a job server that verified one could also receive K.
- **Recovery by email (optional, db servers that send email).** The coder
  can ask "send me a recovery link". The db server mails it itself, so the
  job server never sees it:
  - **Registering the address.** The client sends the address with
    `HMAC(K, email)`. The db server (which can unwrap K) checks it; the job
    server, without K, can't register an address of its own in the coder's
    place. With an `emails` allowlist on the invite, the address comes from
    the researcher through the db server, so the job server never supplies
    it at all.
  - **Redeeming the link.** The link opens the client (served by the job
    server) with a secret R in the URL fragment, which isn't sent to
    servers. The client never sends R itself: the new device creates a
    one-time key pair and sends the public key with `HMAC(R, public key)`.
    The db server checks it and returns K wrapped with that public key. R
    is single use. The job server can relay all of this but can't redeem
    it for a key of its own.
  - **What remains:** whoever controls the mailbox can recover the session
    (as with any recovery link), and the client code must be honest (see
    "Where the guarantee ends").
- **The rare case of switching devices** is covered by offering the
  transfer link up front (`coder-identity.md` §4, "Offer the link early").

## Authenticity: invites and codebooks signed by the db server

The job server passes everything to the client, so it could hand out a
different public key, or change the codebook (e.g. turn encryption off for
a variable). Both are prevented by signatures from the db server, checked
against a key the job server can't replace:

- **The trust anchor is the invite link**, as the researcher distributes it
  (email, panel company): its URL fragment carries the fingerprint of the db
  server's **signing key**. The job server doesn't distribute links, and the
  fragment is never sent to it. Returning coders (who may come back without
  the link) and transferred devices keep the fingerprint: the client stores
  it on first use, the transfer link carries it.
- **Signed invitation:** the db server signs `{ job, invite, encryption
  public key }`, so a key from another job or a substituted key fails the
  check. (A job server sending coders a fake invite with its own key would
  have to reach those coders first; the links come from the researcher.)
- **Signed codebook:** the db server signs what the client relies on: the
  codebook, which variables are encrypted, the encryption public key, job
  and version (e.g. a JWS over the deployment spec, a new signature per
  version). The job server passes the signature through; the client checks
  it on every load and refuses a spec that doesn't verify.
- **Key rotation:** a new signing key is announced signed by the old one,
  or comes with new invite links.

All of this assumes the client code itself is honest (see "Where the
guarantee ends").

## What we gain

- The job server operator, and its infrastructure (Cloudflare, logs,
  caches, the outbox, a breach), never see participants' answers.
- A clear claim for public job servers, and an easier GDPR story: the
  processor in the middle only ever holds ciphertext.

## What we lose or must change

- **Validation:** the job server can only check structure ("an answer is
  present"), not answers against the codebook. Validation moves to the
  client (as now, but no longer enforced) and the db server.
- **Agreement-based saturation:** impossible for encrypted variables; we
  say so explicitly (the codebook editor refuses agreement rules on them).
- **Routing on answers:** the job server can't route on encrypted values.
  Decided (2026-10): the client evaluates every condition, including unit
  loop branch `when`, and fills in `$var` references in unitset names; it
  only tells the job server the chosen branch and unitset names
  (`architecture.md` §6.1). This reveals the branch and the unitset names,
  not the answers. The trade-off is that a coder can pick their own branch;
  routing is not access control. `balanced` assignment needs the values in
  plain text, so a variable that is balanced on can't be encrypted.
- **Condition leaks:** a plain `skip` on a question hidden by a condition
  reveals the condition's outcome. Encrypt the whole answer, `skip`
  included, so the job server sees only "answered".
- **The direct call from client to db server** (alternative variant only):
  the db server needs a public, CORS-enabled endpoint for the key exchange.
  The preferred variant avoids it.
- **Server-set values stay plain:** auto variables assigned by the job
  server (random, balanced, invite presets) and `url_param` values pass
  through it. Usually experimental conditions, not personal data.
- **Metadata stays visible:** which units, timing, answer lengths (pad to
  hide length).

## Where the guarantee ends

- **Who serves the client code.** Whoever serves the JavaScript can break
  any browser encryption. If the job server (or its host) serves the
  client, encryption protects against leaks and curious infrastructure,
  not against a malicious operator of the job server or its host.
  - The full guarantee needs the client served by someone else than the
    job server, and its configuration (the db server's instructions, the
    codebook) signed by the db server and verified by the client. That
    conflicts with "client and job server share an origin" (session
    cookies), so it would need the session design revisited.
  - The pragmatic position: we trust the job server's owner; encryption
    keeps the processor (e.g. Cloudflare) from seeing answers. Note that
    if Cloudflare also serves the client code, that only holds as long as
    the processor doesn't tamper with code it serves.
- **Key authenticity** relies on the signed invite and codebook (above),
  anchored in the link the researcher hands out.

## Open questions

1. **Binding a key to a coder** (only for the alternative variant). For resume, the db server must know which
   coder a key belongs to, and the session credential today is an httpOnly
   cookie on the job server's origin, which the db server never sees.
   Options: a separate device credential the client holds for the db
   server; a db server login; a short-lived ticket the job server issues
   (but then the job server could register keys too; harmless for
   confidentiality if every ciphertext carries its key id and the db server
   decrypts by key id, since the job server can't read the client's key).
2. ~~Resuming on a new device without a transfer link~~: decided, see
   "Resuming" (a transfer link, or a recovery link by email).
3. **Which variables:** every answer of a job, or only marked variables
   (then marked ones lose validation, agreement and `balanced` assignment;
   unmarked keep them; routing works either way, since the client chooses
   the branch)? A per-job switch is simpler and harder to get wrong.
4. **Is it worth it** compared to the alternatives for sensitive work:
   self-hosted job servers, or annotinder local with the end-to-end bridge
   (`docs/compositions.md`, variant B)?
