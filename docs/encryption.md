# Encrypting answers in the browser (possible hardening)

Status: **on hold** (2026-10-26). Not planned; nothing built.

The idea: participants' answers (personal data, e.g. survey responses) are
encrypted in the browser, so the server stores only ciphertext. An earlier
design (2026-10-18) aimed at a job server in the middle that shouldn't read
answers; since the server became one (`architecture.md` §1), the question is
different and still open.

## What is open

- **Who holds the key.** Probably the researcher: answers are encrypted to
  the researcher's public key, and decrypted on export, on the researcher's
  machine. The threat model is then the hosting provider and a database
  leak.
- **Key authenticity.** The server serves the client code and the codebook,
  so it could hand out another key. A key the server can't swap needs an
  anchor outside it, e.g. the key's fingerprint in the invite link's URL
  fragment (never sent to servers), with signed codebooks. And whoever
  serves the client code can always break browser encryption: this protects
  against leaks and curious infrastructure, not a malicious operator.
- **Is it worth it** next to the alternatives for sensitive work: a
  self-hosted server, or annotinder local (`compositions.md`).

## What we would give up (still true)

- **Validation**: the server can only check that an answer is there, not
  that it fits the codebook.
- **Agreement-based saturation** on encrypted variables: impossible.
- **Routing on answers**: the server can't route on encrypted values. The
  client already chooses unit loop branches (`architecture.md` §6.1), which
  keeps this possible, but reveals the chosen branch.
- **Condition leaks**: a plain `skip` on a hidden question reveals the
  condition's outcome; the whole answer, `skip` included, would have to be
  encrypted.
- **Server-set values stay plain**: `auto` variables (random, balanced,
  invite presets, URL parameters).
- **Metadata stays visible**: which units, timing, answer lengths.

## What was decided

- **Resuming**: the session and the key travel together (a transfer link
  carries both). No resuming with earlier answers hidden: routing and
  conditions on hidden answers can't work, and storing their outcomes would
  leak them.
