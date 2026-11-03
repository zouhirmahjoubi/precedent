# Precedent privacy policy

Last updated: November 3, 2026

Precedent is a Forge app for Jira and Confluence. It keeps a record of your team's decisions and flags new Jira work that touches them. This page explains what it stores and where.

## What Precedent stores

- **Decisions your team logs:** the decision, the reason, keywords, project keys, dates, status, and a short history of changes.
- **Atlassian account IDs** of the people who own, log, follow or ask to reopen a decision. Precedent does not store names, email addresses or profile details. It looks up display names from Atlassian when it needs to show them.
- **Links to where a decision was made:** the Jira work item key or Confluence page ID, title and link.
- **Per work item flags:** which decisions were flagged on a work item and how people responded.
- **Decision suggestions:** when a comment reads like a decision, the suggested rule, reason and keywords, the comment's ID, and whether someone logged or dismissed it. No account IDs are stored with a suggestion.
- **Review work items:** which Jira work items Precedent opened to review a decision, and the outcome (kept, replaced or expired). Who recorded the outcome is kept in the decision's history.
- **Settings** chosen by a site admin.

## What Precedent reads but does not keep

To do its job, Precedent reads the summary, description and comments of Jira work items, and the title of Confluence pages, using the permissions you grant when you install it. It compares that text with your decisions and then discards it, except for the decision suggestions listed above.

## Where the data lives

All data is kept in Atlassian's Forge hosted storage for your site. Precedent runs entirely on Atlassian's platform ("Runs on Atlassian"). It sends no data to the developer or to any other service, and it has no outside servers or analytics of its own.

## AI features

The Precedent Rovo agent and its tools for MCP clients (such as Claude or Cursor) run on behalf of the signed-in user and can only see what that user can already see in Jira and Confluence. Rovo is provided by Atlassian under Atlassian's own terms.

If a site admin turns on **Check matches with AI** in Precedent settings, Precedent sends the summary and description of a work item, together with the decisions it matched, to a Claude model hosted by Atlassian through Forge LLMs. This happens inside Atlassian's platform; the text is not sent to the developer or to any other service. Precedent stores only the verdict (conflicts, fits, unclear or unrelated) and a one-sentence reason on the work item's flags. With the same setting on, when a comment reads like a decision, Precedent sends the work item's summary, description and recent comments (with commenters' display names) to the same model to draft the suggested decision. The setting is off by default.

## Account closure and deletion

Precedent reports the account IDs it stores to Atlassian's personal data reporting service each week. When Atlassian reports that an account was closed, Precedent removes that account ID from its records. Decision owners can expire decisions, and site admins can uninstall the app, after which Atlassian deletes the app's storage under its Forge data retention rules.

## Contact

Questions about privacy: zouhir.mahjoubi@gmail.com
