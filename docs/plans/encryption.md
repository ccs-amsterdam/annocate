# Encrypting answers in the browser (possible hardening)

On hold: not planned, nothing built.

The idea: participants' answers (personal data, e.g. survey responses) are
encrypted in the browser, so the server stores only ciphertext. With one
server that runs the study (`architecture.md` §1), whether this is worth it
is open.

## What is open

- **Who holds the key.** Probably the researcher: answers are encrypted to
  the researcher's public key, and decrypted on export, on the researcher's
  machine. The threat model is then the hosting provider and a database
  leak.
- **Key authenticity.** The server serves the client code and the coder
  codebook, so it could hand out another key. A key the server can't swap
  needs an anchor outside it, e.g. the key's fingerprint in the link's URL
  fragment (never sent to servers), with signed designs. And whoever serves
  the client code can always break browser encryption: this protects
  against leaks and curious infrastructure, not a malicious operator.
- **Is it worth it** next to the alternatives for sensitive work: a
  self-hosted server, or local coding from R or Python (`compositions.md`).

## What it would give up

- **Validation**: the server can only check that an answer is there, not
  that it fits the design.
- **Agreement-based saturation** on encrypted variables: impossible.
- **Settings on answers**: a coder's units depend on session values and
  computed variables, which the server sets, so they stay possible. Loop
  settings that depend on coder answers (`question-loops.md` §5) would
  need those answers in plain text.
- **Show if leaks**: a plain `skip` on a hidden question reveals the
  condition's outcome; the whole answer, `skip` included, would have to be
  encrypted.
- **Server-set values stay plain**: computed variables, session values
  (link and URL parameters, conditions).
- **Metadata stays visible**: which units, timing, answer lengths.
- **Resuming**: the session and the key would travel together (a transfer
  link carries both). Resuming with earlier answers hidden can't work:
  Show if conditions on hidden answers would fail, and storing their
  outcomes would leak them.
