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

## The design discussed

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
- **Routing on answers:** the job server can't route on encrypted values
  (`when` branches, unitset `{placeholders}`, `balanced` on them). Either
  such variables can't be encrypted, or the client picks the branch, which
  reveals the branch.
- **Condition leaks:** a plain `skip` on a question hidden by a condition
  reveals the condition's outcome. Encrypt the whole answer, `skip`
  included, so the job server sees only "answered".
- **A direct call from client to db server:** the db server needs a public,
  CORS-enabled endpoint for the key exchange. Today a db server only has
  to be reachable by its job servers. (Annotinder local and the bridge,
  `docs/compositions.md`, would need the same.)
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
- **Key authenticity.** The client must know it is talking to the real db
  server, not one the job server points it to: it can derive the db host
  from the deployment id (`<db host>/<jobId>`) and rely on TLS to that host.

## Open questions

1. **Binding a key to a coder.** For resume, the db server must know which
   coder a key belongs to, and the session credential today is an httpOnly
   cookie on the job server's origin, which the db server never sees.
   Options: a separate device credential the client holds for the db
   server; a db server login; a short-lived ticket the job server issues
   (but then the job server could register keys too; harmless for
   confidentiality if every ciphertext carries its key id and the db server
   decrypts by key id, since the job server can't read the client's key).
2. **Symmetric key exchange vs. public-key encryption.** Alternative: the
   client encrypts to a job public key (fetched from the db host directly)
   and keeps its own answers locally for resume. No key exchange and no
   key storage on the db server, but resuming on another device can't show
   earlier answers. The symmetric exchange is what makes resume-with-answers
   possible.
3. **Which variables:** every answer of a job, or only marked variables
   (then marked ones lose validation, agreement and routing; unmarked keep
   them)? A per-job switch is simpler and harder to get wrong.
4. **Is it worth it** compared to the alternatives for sensitive work:
   self-hosted job servers, or annotinder local with the end-to-end bridge
   (`docs/compositions.md`, variant B)?
