# JasonOS Digital Office Status Dashboard

Static GitHub Pages dashboard for passive CEO monitoring of the JasonOS digital office. Served at `https://jcduser01.github.io/jasonos-dashboard/`.

Two renderers share one data source (`status.json`). The first screen is the
Production Model headline: Delivered / Recipients / Next / Blockers /
Maintenance Attention Share. Ticket, closure, readiness, and conformance
surfaces are diagnostic-only:

- **Standard** — `index.html` at the site root (`/`). Single-column, mobile-first, tuned for dated/low-spec devices (iPad Mini 2, Safari 12 / WebKit 607).
- **Pro** — `pro/index.html` at `/pro/`. Fluid widescreen layout tuned for 1920×1080 modern browsers; more content above the fold, responsive down to phone width, with a light/dark toggle. See [Renderers](#renderers).

## Architecture

```
Mac mini (JasonOS)
  └── jasonos-status-generator.py
        reads: /Volumes/SandboxData/Governance/digital-organization-governance/portfolio/*.md
        writes: /Volumes/SandboxData/code/jasonos-dashboard/status.json
        cadence: every 15 min (launchd) + session close (President Agent)
        → git relay commits + pushes to origin
              └── push triggers .github/workflows/deploy-pages.yml → deploys to GitHub Pages

GitHub Pages
  └── https://jcduser01.github.io/jasonos-dashboard/
        index.html      fetches status.json     on load + every 15 min   (standard)
        pro/index.html  fetches ../status.json  on load + every 15 min   (pro)
        clients read the result (standard: iPad Mini / Safari 12; pro: modern desktop)
```

## Renderers

Both renderers are pure static HTML/CSS/JS and consume the **same** `status.json` — the generator is unchanged and serves both. Adding or editing a renderer never requires a generator change.

### Standard (`/`)
Single-column, mobile-first. Optimized to fit an iPad Mini 2 in portrait. Landscape gets a light flex-wrap pass. This is the conservative target: no CSS Grid dependence beyond simple cases, large tap targets, minimal layout risk on old WebKit.

### Pro (`/pro/`)
Widescreen layout optimized for 1920×1080, fluid at any reasonable size.

- **Shell** — a two-column flex layout: a fluid `#main` column plus a `position: sticky` rail (`clamp(360px, 25vw, 470px)`) that keeps **CEO Actions** and **Director Activity** in view while the main column scrolls. Below 1180px the rail drops beneath the main column.
- **Above the fold** — KPI strip (6 tiles, including **Paused** which reads the existing `stats.paused`), then **Current** as a card grid, then a lower zone of **Next + Paused** stacked beside the **Client** and **Infrastructure** backlogs (each backlog in its own column so tall lists pack left-to-right instead of wrapping into a gap).
- **Theme** — light/dark toggle in the header. Preference is stored in `localStorage` under `jasonos_theme`; with no stored preference it follows the OS `prefers-color-scheme`. Light/dark are defined as CSS custom-property sets on `:root` / `:root[data-theme="light"]`.
- **Data path** — because the page lives one directory down, it fetches `../status.json`.

Renderer-only fields (no generator dependency): the Pro renderer reuses every render function from the standard renderer verbatim, including its schema fallbacks (`backlog.infrastructure || backlog.digital_office`, `active_initiatives` → `active_initiative`, absent `paused`). It degrades gracefully against older schema shapes.

Both renderers share the same `PASSWORD_HASH` and auth gate (see [Password Setup](#password-setup)).

## status.json Schema (version 6)

The top-level `production` object is the shared semantic model also consumed by
the client/venture heartbeat. It contains the governing `headline`, delivery
facts, effort-source limitations, maintenance lifecycle counts, escape-hatch
audit counts, and the subordinate mechanism-ceiling readout. Renderers do not
derive or hand-maintain these facts.

`status.json` is public. Its `production` object is therefore the model's
enforced public projection: recipient/artifact names, commitment references,
dependency claims, and blocker text are absent. The dashboard shows counts,
dates, Red posture, and JasonOS item IDs; the CEO-controlled heartbeat can
render private labels from the same underlying model.

```json
{
  "generated_at":   "<ISO 8601 UTC timestamp>",
  "schema_version": "1",
  "stats": {
    "done":   36,
    "total":  44,
    "active": 0,
    "queued": 3
  },
  "active_initiative": {
    "id":     "INI-045",
    "name":   "Digital Office Status Dashboard",
    "status": "active"
  },
  "queue": [
    { "id": "INI-042", "name": "SIGIL.ZERO — Brand Design System", "status": "queued", "position": 1 }
  ],
  "ceo_actions": [
    { "id": "ACT-INI-016", "category": "pr_review", "label": "Open PR: jcduser01/jasoncookdesign.github.io → jasoncookdesign/jasoncookdesign.github.io" }
  ]
}
```

### Field reference

| Field | Description |
|---|---|
| `generated_at` | UTC timestamp when the artifact was generated |
| `schema_version` | Always `"1"` for this schema |
| `stats.done` | Count of files in `portfolio/done/` |
| `stats.total` | `done` + active portfolio count |
| `stats.active` | `0` or `1` |
| `stats.queued` | Count of `status: Next` files |
| `active_initiative` | Single `status: Current` initiative, or `null` |
| `queue` | All `status: Next` initiatives, sorted by `next_position` |
| `ceo_actions` | Actions derived from `ceo_action` frontmatter field |

## CEO Action Frontmatter Field

To surface a CEO action in the dashboard, add these fields to the relevant portfolio `INI-*.md` frontmatter:

```yaml
ceo_action: "Open PR: jcduser01/jasoncookdesign.github.io → jasoncookdesign/jasoncookdesign.github.io"
ceo_action_category: "pr_review"
```

Supported categories: `pr_review`, `approve`, `decision`, `action` (default).

The generator derives `id` automatically as `ACT-<initiative-id>` (e.g., `ACT-INI-016`).

## Password Setup

Before launch, replace the `PASSWORD_HASH` constant in `index.html` with the SHA-256 hex of your chosen password.

To generate the hash, open any browser console (on HTTPS) and run:

```javascript
crypto.subtle.digest("SHA-256", new TextEncoder().encode("yourpassword"))
  .then(function(b) {
    console.log(Array.from(new Uint8Array(b))
      .map(function(x) { return x.toString(16).padStart(2, "0"); })
      .join(""));
  });
```

The placeholder hash in the current `index.html` must be replaced with your own before iPad launch.

## Publication

The generator script lives at `/Volumes/SandboxData/bin/jasonos-status-generator.py`.

To publish manually (from a Cowork session):

```
message: feat(dashboard): update status artifact
repo: /Volumes/SandboxData/code/jasonos-dashboard
precommand: python3 /Volumes/SandboxData/bin/jasonos-status-generator.py
push: true
```

## GitHub Pages Configuration

Settings → Pages → Source: **GitHub Actions**.

Deployment runs via `.github/workflows/deploy-pages.yml`: on every push to `main` it uploads the repo root as the Pages artifact and deploys it. A `concurrency: pages` group collapses the status generator's rapid publish pushes into a single always-latest deployment. This replaces the legacy "Deploy from a branch" flow, which spawned one deployment per push and stacked overlapping deploys — the cause of the deploy-step timeouts observed under rapid publishing.
