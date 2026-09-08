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

## Round Two: Awaiting User Decisions

Deferred commits:

- `2624c31`: initial-variant registry/state; automatic generator initialization.
- `f3c60a6`: initial-variant creation/deletion UI, navigation and data deletion.
- `290a6d7`: import cleanup based on the preceding two commits.

The feature creates a separate notation from an existing notation plus a
custom, strictly decreasing initial-expression list. It does not overwrite
the original notation. Upstream currently excludes generator members.

Decisions to confirm:

1. Entry and editor placement. Upstream adds a centered button row and modal
   wizard. Recommended: an Explore-toolbar entry with an editor using our
   existing floating-panel style, retaining confirmation for destructive deletion.
2. Navigation and count. Upstream labels siblings as `(variant N)`.
   Recommended: variants grouped beneath the base notation in our folder picker;
   confirm whether each counts individually or the entire base family counts as one.
3. Standalone export. Upstream has no adaptation for our export pipeline.
   Recommended: include explicitly selected variants with their base definitions
   and initial lists, but omit creation/deletion controls from the exported app.
4. Local-file lifecycle. Recommended: disabling a base file hides its variants
   but retains their definitions; re-enabling restores them. Saving a modified
   base revalidates initial lists and resets affected trees/analysis, with invalid
   variants retained but unavailable. Permanent variant deletion requires confirmation.

Engineering requirements independent of UI choice: preserve stable IDs,
count-generated-family behavior, transactional local-file replacement and
rollback, and standalone registration filtering. Adapt the registry and all
local runtime registration call sites together to avoid double initialization.

## Verification

- Type checking and standard, compatibility and standalone builds pass.
- Full Vitest suite passes after adding merge-integration coverage.
- Build warnings remain for large chunks, deprecated inlineDynamicImports and
  standalone import.meta replacement; build success is not browser-runtime validation.
- Interactive browser verification was not completed because browser connection timed out.
