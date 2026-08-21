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

When refactoring the current site, preserve the live GitHub Pages behavior and progressively move hard-coded project facts into the JSON-backed rendering architecture.
