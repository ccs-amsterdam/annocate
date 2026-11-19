---
title: Connecting an AI assistant
section: Editor
order: 8
summary: Let an AI assistant (Claude, ChatGPT, an IDE agent) read your study's design and save drafts of it, which you review and deploy.
---

You can connect an AI assistant to one of your studies. It can then read the
study's design, check it, and save a **draft**: for instance "add a question
about the article's tone, with five options" or "split this question in
two". It never deploys: you look at the draft in the editor, change what you
want, and deploy it yourself (see [Previewing and publishing](previewing-and-publishing.md)).

## Connecting

1. In your assistant, add a custom connector (a "remote MCP server") with
   this address, using your AnnoTinder server's address:

   ```
   https://<your AnnoTinder server>/api/mcp
   ```

2. The assistant opens AnnoTinder in your browser. Log in if asked; because
   you are giving access to a study, AnnoTinder may ask for your second
   factor again.
3. Pick the study and click **Allow**. You can only pick studies where you
   may edit the design (WRITE or ADMIN, see [Working together](working-together.md)).

One connection is for one study. To work on another study, connect again.

## What it can and can't do

The assistant can:

- read the design (the draft, the live version, older versions);
- check a design the way AnnoTinder does before deploying;
- save a draft (shown as saved by you, "via" the assistant's name);
- see the unit fields and a few example units, to write questions about them;
- compare the draft with the live version;
- read AnnoTinder's help pages about designing.

It can't deploy, see coders or their answers, change units, links or who
works on the study, or touch any other study. If someone saved the draft
after the assistant last read it, its save is refused and it has to read the
draft again, so it can't overwrite your edits unseen.

## Disconnecting

The account menu has **Connected assistants**: each connection, its study,
and when it was last used. **Disconnect** stops it at once. A connection
also stops working when you can no longer edit the study.
