# Home Project Planner — Shared Ownership Rules

GitHub is the authoritative source of truth for this project.

## Ownership

### ChatGPT owns content and project state
ChatGPT may update:
- `data/`
- project facts and descriptions
- phase status and next actions
- purchases, costs, budgets, and shopping links
- decisions and rejected options
- maintenance notes
- project photo references and content metadata

ChatGPT should NOT change visual design, CSS, typography, spacing, navigation, layout, or component structure unless the user explicitly asks for a design change.

### Claude owns design and presentation
Claude may update:
- HTML structure used for presentation
- CSS and typography
- JavaScript rendering and interaction logic
- responsive behavior
- tabs, cards, grids, navigation, visual hierarchy, and accessibility

Claude must treat files under `data/` as read-only project facts unless the user explicitly asks Claude to change content.

## Design requirements
- Professional, compact, information-dense layout.
- Minimize vertical scrolling.
- No page-level horizontal scrolling.
- No horizontally scrolling phase navigation on normal desktop widths.
- Prefer tabs, compact grids, drawers, accordions, and progressive disclosure over long stacked pages.
- Keep important status, current phase, spend, and next action visible above the fold when practical.
- Dense but readable typography; avoid oversized headings, hero sections, cards, and whitespace.
- Responsive on desktop, tablet, and mobile.
- Preserve existing functionality when restyling.

## Data rules
- Do not hard-code project facts in UI files when they belong in `data/`.
- The UI should render project state from JSON.
- When a fact changes, update the JSON rather than duplicating the fact in HTML.
- Never silently overwrite a locked decision.
- Keep rejected/paused options distinguishable from active decisions.

## Workflow
1. User discusses project decisions with ChatGPT.
2. ChatGPT updates project JSON in GitHub.
3. GitHub remains the source of truth.
4. User asks Claude to improve the design.
5. Claude reads project JSON but edits presentation only.
6. GitHub Pages publishes both kinds of changes automatically.
