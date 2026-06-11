# JasonOS Digital Office Status Dashboard

Static GitHub Pages dashboard for passive CEO monitoring of the JasonOS digital office. Served at `https://jcduser01.github.io/jasonos-dashboard/`.

## Architecture

```
Mac mini (JasonOS)
  └── jasonos-status-generator.py
        reads: /Volumes/SandboxData/Governance/digital-organization-governance/portfolio/*.md
        writes: /Volumes/SandboxData/code/jasonos-dashboard/status.json
        cadence: every 15 min (launchd) + session close (President Agent)
        → git relay commits + pushes to origin

GitHub Pages
  └── https://jcduser01.github.io/jasonos-dashboard/
        index.html fetches status.json on load + every 15 min
        iPad Mini (Safari 12 / WebKit 607) reads the result
```

## status.json Schema (version 1)

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

Settings → Pages → Source: **Deploy from a branch** → Branch: `main` / Folder: `/ (root)`.
