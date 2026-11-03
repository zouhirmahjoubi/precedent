# Precedent

Precedent remembers what your team decided and why, and flags new Jira work that goes against it.

## What's in the app

| Part | Forge module | What it does |
|---|---|---|
| Guard | `trigger` on work item created and updated | Checks the work against active decisions. On a likely conflict it comments and mentions the owner. |
| AI verdict | `llm` (Forge LLMs, Claude) | Optional. When keywords match, judges whether the work goes against the decision, fits it, or is unrelated, and gives a one-line reason. Off by default; turn it on in Precedent settings. |
| Decision capture | `trigger` on comments | When a comment reads like a decision ("we agreed", "decided", "from now on"), the panel offers to log it with the rule, reason and keywords filled in. With AI on, the model reads the thread; without it, a plain sentence rule does. Points to the existing decision instead when it is already logged. |
| Work item panel | `jira:issueContext` | Shows the decisions this work touches, with Follow it, Ask to reopen, Not related. Log a decision from the work item. |
| Decision log | `jira:globalPage` | All decisions with search, status tabs, review dates, and how often each was flagged and followed. |
| Review reminders | `scheduledTrigger` (daily) | On a decision's review date, opens a Jira work item assigned to the owner. The Precedent panel on it has Keep, Replace and Let it expire; the outcome is commented and the work item closed when the workflow allows. |
| Settings | `jira:adminPage` | Comment options, the AI verdict switch, decision capture from comments, review reminders and their project, a button to check for due reviews now, and a button that adds sample decisions. |
| Confluence capture | `confluence:contentAction`, `confluence:contentBylineItem` | Log a decision from a page; see the decisions logged from it. |
| Precedent agent | `rovo:agent`, 7 `action`s, 2 `rovo:skill`s | Answers "what did we decide about X", checks plans, captures decisions from threads, runs reviews. |
| MCP tools | `rovo:mcp` | The same 7 actions for Claude, Cursor and other MCP clients. |

The Guard matches keywords first, so most edits cost nothing. Only matched decisions go to the model, and each verdict is stored on the work item until its text or the decision changes. Forge LLMs run inside Atlassian, so the app keeps its Runs on Atlassian eligibility.

Decisions live in the Forge custom entity store (`decision`, keyed by ref like `D-4`). A weekly scheduled trigger reports stored account IDs to Atlassian and removes closed accounts. See the [privacy policy](docs/PRIVACY.md) and [terms of use](docs/TERMS.md).

## Develop

```bash
npm install
npm test
```

```bash
forge register
```

```bash
forge deploy
```

```bash
forge install --site <your-site>.atlassian.net --product jira
```

## Use Precedent from Claude, Cursor or another MCP client

1. A site admin opens Atlassian Administration > Apps > Sites > your site > Connected apps > Precedent and turns on **Expose tools to MCP-compatible apps**.
2. Add the server to your client:

```bash
claude mcp add --transport http precedent https://mcp.atlassian.com/forge/2ef747d1-8d4a-4652-b06c-ac4d2d7a50bf
```

3. Sign in when the browser opens and pick your site.
4. Optional: add the skill in [`agent-skill/precedent/SKILL.md`](agent-skill/precedent/SKILL.md) so the agent checks decisions before it plans or writes work, and logs decisions from meetings and Loom videos.

## Try it

1. Jira settings > Apps > Precedent settings > **Add sample decisions**.
2. Create a work item called "Black Friday: free shipping on everything".
3. Precedent comments on it within a few seconds. With the AI verdict on, try "Black Friday: free shipping on orders over $50" too: it fits the rule, so Precedent stays quiet. Open the Precedent panel on the work item to follow the decision or ask to reopen it.
4. Open Apps > Decisions to see the log.
5. In Rovo chat, pick the Precedent agent and ask "What did we decide about free shipping?"
6. To try a review: set a decision's review date to today in the Decisions page, set a review project in Precedent settings, and click **Check for due reviews**. Open the new work item and use Keep, Replace or Let it expire in the Precedent panel.
7. To capture a decision: on any work item, comment "We agreed: gift wrap is free on orders over $60 because the wrap costs us $2.10." Precedent replies that this looks like a decision. Open the Precedent panel and click **Log it**.
