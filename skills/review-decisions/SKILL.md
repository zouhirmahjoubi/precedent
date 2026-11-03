---
name: review-decisions
description: Review team decisions that are due, using how often each one was flagged, followed or challenged. Use when someone asks which decisions need review, or wants to clean up old decisions.
allowed-tools: list-decisions-due-for-review get-decision change-decision-status
---

# Review decisions that are due

1. Call `list-decisions-due-for-review`. Use the number of days the user asks for, or 30.
2. If nothing is due, say so in one line and stop.
3. For each decision, give one short line: ref, title, owner, review date, and its record (times caught, followed, reopen requests). When the user wants more on one decision, call `get-decision` for its reason, source and history.
4. Suggest an outcome for each, with the reason. Use `daysSinceDecided` from the results:
   - **Keep** when it was followed and nobody asked to reopen it, or when it is less than 180 days old. A young rule that has not flagged anything yet is quiet, not stale.
   - **Discuss** when there are reopen requests, or it was caught often but rarely followed. The rule may no longer fit.
   - **Expire** only when it is older than 180 days, was never caught, and the topic looks finished. Never suggest expiring a rule that guards money, legal or customer risk only because nothing touched it.
5. Only the owner can change a decision. If the user is the owner and confirms an outcome, call `change-decision-status`. For a replacement, ask for the new decision's ref first.
6. Never change a status without a clear yes for that specific decision.
