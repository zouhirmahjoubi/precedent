---
name: precedent
description: Check team decisions before planning or writing work, and log new decisions from meetings, Loom videos or threads. Use when the user plans a campaign, feature, policy or task, asks "what did we decide about X", shares a meeting recording or transcript, or asks to record a decision. Needs the Precedent MCP server.
---

# Precedent

Precedent is a team's decision memory in Jira and Confluence. Each decision has a ref (like `D-4`), a short rule, the reason, an owner, keywords, a source link and a status. Precedent flags new Jira work that touches an active decision.

## Connect

Add the Precedent MCP server for your Atlassian site. Your site admin must first turn on "Expose tools to MCP-compatible apps" for Precedent in Atlassian Administration > Apps > Sites > your site > Connected apps.

```bash
claude mcp add --transport http precedent https://mcp.atlassian.com/forge/2ef747d1-8d4a-4652-b06c-ac4d2d7a50bf
```

The first call opens a browser sign-in. Precedent only shows what your Atlassian account can see.

## Tools

| Tool | Use it to |
|---|---|
| `find-decisions` | Search decisions by topic, keyword or ref. Defaults to active ones. |
| `get-decision` | Read one decision with its reason, source and history. |
| `check-work-against-decisions` | Check a Jira work item key, or plan text, against active decisions. |
| `log-decision` | Log a new decision. The signed-in user becomes the owner. |
| `change-decision-status` | Mark a decision active, replaced or expired. Owner only. |
| `list-decisions-due-for-review` | List active decisions with a review date coming up. |
| `get-work-item-discussion` | Read a Jira work item's description and comments. |

## Before you plan or write work

Call `check-work-against-decisions` with the plan text or the work item key before you draft a campaign, spec, task list or code change. If it returns matches, tell the user which decision each part of the plan touches, quote the reason and name the owner. Do not quietly change the plan to fit; let the user decide whether to follow the decision or ask the owner to reopen it.

## Turning a meeting into decisions

When the user shares a meeting, Loom video, transcript or thread:

1. Read it with the tool that fits (for a Loom link, the Atlassian MCP Loom tools; for a Jira work item, `get-work-item-discussion`).
2. Pick out real decisions only: explicit agreement, a final call, an owner approving a proposal. Skip ideas still being debated.
3. For each one, call `find-decisions` on its topic first. If an active decision already covers it, say so and ask whether the new one replaces it.
4. Draft each decision for the user:
   - **Decision:** a short rule a teammate can follow, under 80 characters.
   - **Why:** one or two sentences in the team's words.
   - **Keywords:** 2 to 5 phrases people would type in a future work item that touches it.
   - **Source:** the work item key or the meeting link.
5. Wait for a clear yes, then call `log-decision` once per decision. Report the new refs.

## Rules

- Only state decisions the tools return. If nothing matches, say so. Never invent a decision, reason or owner.
- Always cite the ref and owner.
- A replaced or expired decision no longer applies.
- Never call `log-decision` or `change-decision-status` without the user's clear yes.
