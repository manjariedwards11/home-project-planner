# Home Project Planner

A static planner for home projects, published with GitHub Pages. Every project
fact lives in JSON under `data/`; the pages are thin shells that fetch it and
render at runtime. There is no build step — commit to `main` and Pages deploys.

**Live:** https://manjariedwards11.github.io/home-project-planner/

## How it fits together

```
index.html                     project list      -> assets/js/render-home.js
<project-id>.html              project workspace -> assets/js/render-project.js
assets/css/planner.css         tokens, reset, topbar, tables, badges
assets/css/home.css            project-list page only
assets/css/project.css         shared by every project page
data/*.json                    all project facts
assets/img/, assets/images/    photos
```

Each page is a shell with mount points (`data-project`, `data-projects`,
`data-tabs`, `data-panels`); the renderer fills them. No project fact is
written into HTML or JS.

## Adding a project

No code changes are needed:

1. Add `data/<project-id>.json` with `projectId`, `phases`, and the rest.
2. Add an entry to `data/projects.json` pointing at it.
3. Copy an existing project HTML shell, changing only `<title>` and
   `data-project-file`.
4. Optional: `assets/img/<project-id>.jpg` for the home-page card.

## Data files

`data/<project-id>.json` is the spine. A phase may point at a detail file with
`detailFile`, which is the authority for that phase:

| File | Holds |
| --- | --- |
| `<id>.json` | phases, decisions, maintenance, project-level shopping |
| `<id>-cost-plan.json` | target budget, per-phase estimates and actuals |
| `<id>-todos.json` | per-phase checklists, matched by `phaseId` then number |
| `<id>-phase-N-*.json` | one phase's goal, shopping list, memory, options |

A phase's own detail file wins over the project-level rollup, which can lag
behind it.

## Phase layout

Every phase renders the same way, so no phase reads like a different product:

```
Phase N — Title           status, estimated, actual
Goal                      one statement, full width, never repeated
Picture | To-Do | Shopping    ~31% / 31% / 38%
Anything else             comparisons, galleries, collapsed history
```

The row refolds to 2+1 at 1150px and stacks at 820px, closing its gaps before
giving up a column. Line 3 is omitted when a phase has nothing extra to say.

The renderer shows what is operationally useful now — goal, tasks, shopping,
costs — and collapses background, rationale and superseded options into
"Details & history". It deliberately does not render every field it finds.

## Conventions worth knowing

- **Colour carries state.** Green means settled, accent means live, neutral
  means neither. A finished phase's spend, its nav tab and its chosen option
  are all green; only the current phase uses accent.
- **Photos.** A phase shows `completionMemory.image`, else
  `assets/images/<project-id>/phase-N/…`, else a placeholder. The in-page
  picker stores a downscaled copy in `localStorage` for preview only — a static
  site cannot publish an upload, so committing the file is what makes it real.
- **Desktop does not scroll the page.** Header, metrics and phase nav stay put;
  the active panel scrolls.

## Ownership

`PROJECT_RULES.md` has the full split. In short: ChatGPT owns `data/`, Claude
owns presentation. See `CLAUDE.md` for the design brief.
