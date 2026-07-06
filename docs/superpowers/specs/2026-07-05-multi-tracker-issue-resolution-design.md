# Multi-tracker issue resolution for /zeroshot

**Date:** 2026-07-05
**Status:** approved

## Goal

`/zeroshot <issue-ref>` currently resolves only GitHub issues (`gh issue view`). Add Linear
and Jira, keeping everything downstream unchanged: resolution happens in the skill's step 2,
in the main session, before the workflow is invoked; the workflow keeps receiving a plain
`task` string.

## Mechanism

Connected MCP tools, discovered at resolution time (Linear connector; Atlassian connector's
`getJiraIssue`). No CLIs: Linear has no official CLI and Jira's are third-party, while both
have first-party Claude Code connectors. GitHub stays on `gh`.

## Reference detection (first match wins)

| Input | Tracker | Resolution |
| --- | --- | --- |
| GitHub issue URL, `#N`, or pure integer | GitHub | `gh issue view N --json title,body` (unchanged) |
| `linear.app/.../issue/KEY-123...` URL | Linear | Linear MCP: get issue by identifier |
| `*.atlassian.net/browse/KEY-123` URL | Jira | Atlassian MCP: `getJiraIssue` |
| Bare key `KEY-123` (`[A-Z][A-Z0-9]+-\d+`) | ambiguous | Only one of Linear/Jira connected → use it. Both → ask the user once which tracker. Neither → error, do not fall through to inline text |
| Existing file path / anything else | — | unchanged (file contents / raw text) |

The no-questions rule binds the workflow's subagents; this pre-flight step in the main
session may ask the one disambiguation question.

## Task text

`"<title>\n\n<description>"` for all trackers — same shape as the existing GitHub form.
Comments, attachments, and custom fields (e.g. acceptance-criteria fields) are deliberately
excluded (user-confirmed: title + description is enough; the skill already requires "done"
criteria to be describable in the issue body).

## Errors

Any lookup failure (not found, no permission, connector absent) → report and stop, matching
the existing "if `gh` fails, tell the user and stop" rule. A bare key that cannot be resolved
is an error, never silently treated as inline task text.

## Files changed

- `zeroshot/skills/zeroshot/SKILL.md` — rewrite step 2; frontmatter description gains
  Linear/Jira mention.
- `README.md` — usage section: issue reference forms.

No lib/workflow/hook/test changes; no runnable surface added.
