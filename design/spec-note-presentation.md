# Spec: Task presentation filtered by date headings

## Problem

The notes file contains both daily task sections (under date headings like `## 2026-01-28-W5-Wed`) and non-task sections (like `## notes` for scratch notes). Previously, all `- list items` were counted as tasks and rendered in Task View regardless of which heading they belonged to.

## Solution

Only treat list items as tasks when they appear under a heading that starts with a date (`YYYY-MM-DD`). Items under non-date headings (e.g. `## notes`) are excluded from the task counter and hidden in Task View.

## Date heading pattern

A heading is considered a "date heading" if its text starts with `YYYY-MM-DD`:

```
/^\d{4}-\d{2}-\d{2}/
```

Examples that match:
- `## 2026-01-28-W5-Wed`
- `## 2026-02-09`
- `## 2026-02-09 Monday`

Examples that don't match:
- `## notes`
- `## Today`
- `## my-tasks`

## Changes

### `web/MarkdownParser.ts`

New exported function:
```typescript
export function isDateHeading(headerText: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(headerText.trim());
}
```

### `web/app.ts` — `updateTaskCount()`

Task counter now parses sections and only counts tasks under date headings, instead of naively counting all lines starting with `-`.

### `web/TaskView.ts` — `render()`

Task View only renders sections whose header is a date heading. Non-date sections are preserved in the data model (serialization still round-trips correctly) but not displayed.

### `web/TaskView.ts` — `addTask()`

The "+" button adds new tasks to the first date-heading section instead of the first section with any header.

## Example

Given this markdown:

```markdown
## 2026-02-09-W6-Sun
- Buy groceries
- Walk the dog

## notes
- Remember to check that thing
- Random idea about project
```

- **Task counter**: shows `2` (only the date section items)
- **Task View**: renders only the `2026-02-09-W6-Sun` section with its 2 tasks
- **Text View**: unchanged, shows all content as before
- **Serialization**: unchanged, all sections preserved in the underlying markdown
