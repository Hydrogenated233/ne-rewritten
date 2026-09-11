# Upstream Sync: 2026-09-12

Upstream: `SmileLee-lyx/ne-rewritten`, `master` at `679382b`.
Local starting point: `5c1ddfb`. Merge all nine upstream-only commits with
real merge ancestry.

## Scope

The user withdrew the RPD inline-SVG report after identifying it as display-mode
behavior, not a bug. Do not modify the external RPD file or HTML/LaTeX routing.
Only integrate upstream, preserving the fork's UI and local-file lifecycle.

| Commit | Change |
| --- | --- |
| `0730106` | Add UP2MN v1b; update UP1MN helpers |
| `f1ef5b8` | Describe UP2MN v1b |
| `8fdfb5c` | Add UP2MN v1b+ |
| `a9c77e2` | Add UP2DBMS v1b+ and shared display helper |
| `b8a2200` | Correct UP2DBMS v1b+ bad-root indexing |
| `157af88` | Add UP2DBMS v1 |
| `d08756f` | Log import, lookup and corrupt-save errors |
| `07c9411` | Normalize types, infinity comparisons and vertical lookup |
| `679382b` | Add trial category; update credits and descriptions |

## Integration

- Retain the fork's SettingsBar unchanged. Apply upstream lookup logging to
  ExploreToolbar, where that workflow now lives.
- Combine the UP1MN import changes with its existing explicit layer renderer.
- Register all four new notations. Adopt the upstream trial category for
  UP2MN v1a, UP2MN v1b and UP2DBMS v1b+, retaining their stable IDs.
- Bind the new notations' existing layer renderers explicitly, including
  layer-simple displays. Bind UP2DBMS UP1Y to its implemented UP1Y mode.
  Marked/simple displays without a dedicated renderer remain unsupported;
  no base-renderer fallback or invented drawing is introduced.
- Preserve note-table data, resize history, local-file ownership, standalone
  selection rules, operation sequences and existing application layout.
- Mathematical implementation changes match upstream; local notation-source
  differences only adapt the explicit diagram contract.

## Verification

- Type checking and all 51 test files / 343 tests pass.
- Standard, compatibility and standalone builds pass. Existing large-chunk,
  inlineDynamicImports and standalone import.meta warnings remain.
- New tests cover registration/category identity, infinity comparisons,
  bounded expansion and plain-display round trips across all three FS variants,
  supported/unsupported equivalent diagrams, source selection and relocated logs.
- Existing local-file, note-table, standalone and operation-sequence regression
  suites remain passing.
- Live browser smoke checks confirm the trial category, new notation selection,
  UP2DBMS v1 expansion, UP1Y display and its nonblank floating diagram.
  Browser console checks report no warnings or errors.
- These bounded tests do not prove the new notation algorithms mathematically
  correct. Full mobile and local-file lifecycle browser workflows were not
  repeated for this upstream-only integration.
