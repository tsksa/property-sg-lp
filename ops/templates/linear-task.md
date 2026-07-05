# Linear Task Prompt

Use this prompt when starting work from a Linear issue.

Claude Code users should also have the repo root `CLAUDE.md` loaded. Run `/memory` inside Claude Code if you need to verify which project instructions are active.

```md
You are working on Linear issue <ISSUE-ID> (e.g. ABC-123).

Before editing:
- Read the Linear issue, linked spec, and relevant existing files.
- Identify the acceptance criteria and non-goals.
- Check current implementation patterns before adding new ones.
- Inspect current git status so unrelated work is not disturbed.

Rules:
- Implement only the acceptance criteria.
- Do not change unrelated files.
- Do not refactor opportunistically.
- Preserve existing behavior unless the issue explicitly changes it.
- Follow existing code style, architecture, naming, and UI conventions.
- Create or update tests when the change affects logic, data flow, permissions, integrations, or user-visible behavior.

Before opening a PR:
- Run the relevant checks.
- Review your own diff.
- Confirm no unrelated files were changed.

Open a PR.

In the PR description, explain:
- what changed
- why
- Linear issue
- acceptance criteria checked
- screenshots, Loom, or preview URL when relevant
- risk
- how to test
- what you intentionally did not do
- agent involvement
- follow-up issues created
```

## Linear Issue Shape

Use this structure for the Linear issue itself when possible:

```md
## Problem

What user, business, or technical problem does this solve?

## Acceptance Criteria

- [ ] Observable outcome one
- [ ] Observable outcome two

## Notes / Links

- Spec:
- Design:
- Relevant files:

## Non-goals

- What should not be changed in this task?

## Test Expectations

- What should be tested manually or automatically?
```
