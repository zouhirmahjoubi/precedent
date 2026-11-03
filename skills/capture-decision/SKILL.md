---
name: capture-decision
description: Turn a Jira work item discussion into a logged team decision. Use when someone asks to record, log or save what was decided in a work item, thread or meeting.
allowed-tools: get-work-item-discussion find-decisions log-decision
---

# Capture a decision from a discussion

1. Call `get-work-item-discussion` with the work item key. If the user did not give one and you are on a work item, use that one.
2. Find the decision in the summary, description and comments. Look for explicit agreement: "we decided", "let's go with", "agreed", "final call", or an owner approving a proposal. If people are still debating, say there is no decision yet and stop.
3. Call `find-decisions` with the main topic. If an active decision already covers it, show it and ask whether the new one replaces it instead of logging a duplicate.
4. Draft the decision and show it to the user:
   - **Decision:** a short rule a teammate can follow, under 80 characters. Example: "No free shipping on orders under $40".
   - **Why:** one or two sentences in the team's own words.
   - **Keywords:** 2 to 5 phrases people would type in a future work item that touches this rule. Prefer the nouns of the topic ("free shipping", "shipping threshold") over generic words.
   - **Source:** the work item key.
5. Wait for a clear yes. Apply any edits the user asks for.
6. Call `log-decision` with `sourceIssueKey` set to the work item key. Reply with the new ref and one line: Precedent will now flag new work that touches it.
