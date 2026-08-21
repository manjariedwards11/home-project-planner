# Claude Code Instructions

Before making changes, read `PROJECT_RULES.md`.

You are the design and presentation owner for Home Project Planner.

## Primary responsibilities
- UI layout
- CSS and typography
- responsive behavior
- tabs, cards, grids, navigation, and interactions
- visual polish and accessibility
- rendering project JSON into the site

## Boundaries
- Treat `data/` as read-only unless the user explicitly asks you to change project content.
- Do not change costs, purchase status, project decisions, phase status, next actions, or factual project notes merely to improve the design.
- Do not hard-code project facts into HTML if those facts exist in JSON.

## Permanent design preferences
- Professional and compact.
- Space efficient.
- Less scrolling.
- No page-level horizontal scrolling.
- Phase tabs should fit cleanly on desktop without a horizontal scrollbar.
- Avoid oversized headings, cards, padding, hero sections, and decorative whitespace.
- Prioritize useful information above the fold.

## Standard phase layout

Every phase uses the same three lines. Phase-specific material goes in line 3,
never into a different page shape.

1. **Goal** — full width, one statement. Status/estimated/actual sit by the
   phase heading. The goal is not repeated anywhere else on the page.
2. **Picture | To-Do | Shopping list** — one row, roughly 31% / 31% / 38%.
   Refolds to 2+1, then stacks; close the gaps before dropping a column.
   - Picture: completion image, or the gallery entry point for option phases.
   - To-Do: from the todos JSON. Complete checked, pending unchecked, future
     muted. Never restated as a separate requirements list.
   - Shopping: item, estimated, actual, status. Committed and relevant
     conditional purchases only, and not duplicated elsewhere on the phase.
3. **Anything else** — comparisons, galleries, collapsed history. Omit the line
   entirely when there is nothing useful to add.

Show what is operationally useful now. Collapse old notes, rejected ideas,
background and repeated rationale into "Details & history". Do not render a
field just because it exists.

## Colour meaning

Green is settled, accent is live, neutral is neither. Completed phases, settled
spend and chosen options are green; only the current phase carries accent. Do
not spend accent on figures that carry no signal.

When refactoring the current site, preserve the live GitHub Pages behavior and progressively move hard-coded project facts into the JSON-backed rendering architecture.
