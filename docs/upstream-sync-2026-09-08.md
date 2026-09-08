# Upstream Sync: 2026-09-08

Upstream: `SmileLee-lyx/ne-rewritten`, `master` at `290a6d7`.
Local starting point: `8c0636d`.
Initial divergence: 31 local-only commits, 16 upstream-only commits.

## Round One

Merge through `34af9db` with real merge ancestry. This incorporates the first
13 upstream commits, including intermediate BBM removals and its final restoration.
Do not mark the final three commits as merged before their integration is complete.

| Commit | Change | Result |
| --- | --- | --- |
| d8bc4de | Missing-parser warning and DEN diagram scaling | Merged; warning in our Explore tab |
| 17f71dd | Display names and notation parsers | Merged |
| 14ed427 | Display name_id to name migration | Merged, including our EquivalentNotationBar |
| 1018a22 | Whitespace parsing and Veblen parser | Merged |
| d4cfe7d | Correct erroneous DEN2/Omega_Y test vectors | Merged |
| 4e82974 | BBM and BTBM naming correction | Merged |
| 9d82271 | Temporarily remove BBM hierarchy mode | Merged |
| 34531ff | Temporarily remove BBM | Merged |
| 377faca | Distinguish FS trial exhaustion from other failures | Merged |
| d2ec052 | Entry-point runtime polyfills | Merged |
| 097b3d9 | flat/flatMap and ResizeObserver guard | Merged |
| f93fbb8 | Restore BBM | Merged |
| 34af9db | BBM descriptions | Merged |

Conflict resolutions preserve our page tabs, folder picker, AI workspace,
local-file lifecycle, isolated storage keys and standalone allow-list.
DEN scaling additionally receives translated labels and a 0.1 input step.
No registry hydration changes are included in this round.

## Round Two: Integrated

The user confirmed the implemented recommendations on 2026-09-08. The final
three commits are integrated together with real merge ancestry at `290a6d7`:

- `2624c31`: initial-variant registry/state; automatic generator initialization.
- `f3c60a6`: initial-variant creation/deletion UI, navigation and data deletion.
- `290a6d7`: import cleanup based on the preceding two commits.

The feature creates a separate notation from an existing notation plus a
custom, strictly decreasing initial-expression list. It does not overwrite
the original notation. Upstream currently excludes generator members.

Confirmed decisions:

1. Entry and editor placement. Upstream adds a centered button row and modal
   wizard. Use an Explore-toolbar entry with an editor using our
   existing floating-panel style, retaining confirmation for destructive deletion.
2. Navigation and count. Upstream labels siblings as `(variant N)`.
   Variants are grouped beneath the base notation in our folder picker;
   the entire base family counts as one.
3. Standalone export. Upstream has no adaptation for our export pipeline.
   Include explicitly selected variants with their base definitions
   and initial lists, but omit creation/deletion controls from the exported app.
4. Local-file lifecycle. Disabling a base file hides its variants
   but retains their definitions; re-enabling restores them. Saving a modified
   base revalidates initial lists and resets affected trees/analysis, with invalid
   variants retained but unavailable. Permanent variant deletion requires confirmation.

Engineering requirements independent of UI choice: preserve stable IDs,
count-generated-family behavior, transactional local-file replacement and
rollback, and standalone registration filtering. Adapt the registry and all
local runtime registration call sites together to avoid double initialization.

Review fixes included with round two:

- Historical file IDs do not authorize deletion of another file's live or
  dormant variants, trees, notes or analysis.
- Local ownership includes members added after generator registration.
- Standalone definition dependencies do not implicitly select base analysis
  or notes; excluded notation settings and expansion selections are filtered.
- Refreshing an existing export panel retains explicit deselections.
- Regression tests cover the above ownership/export boundaries as well as
  creation, validation, hydration, source replacement and rollback.

## Verification

- Type checking and standard, compatibility and standalone builds pass.
- Full Vitest suite: 44 files, 287 tests pass.
- Build warnings remain for large chunks, deprecated inlineDynamicImports and
  standalone import.meta replacement; build success is not browser-runtime validation.
- Round-one browser verification was incomplete. Round two was verified in
  isolated Chromium using Playwright after the app browser plugin failed to
  start because its configured service-version directory was missing.
- Desktop (1365x900) and mobile (390x844) screenshots were inspected. Creation,
  grouped navigation/counts, reload, confirmed deletion, clean ID reuse,
  local-file upload, disable/enable and invalid-source recovery pass.
- An exported HTML was opened directly from disk with real CDN dependencies:
  the selected local variant loads even with analysis-data export disabled,
  and variant creation/deletion controls are absent. No page errors were
  recorded across the browser checks.
- Local QA script and screenshots are under ignored `logs/merge-*` paths.
