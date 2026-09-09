# Upstream Sync: 2026-09-09

Upstream: `SmileLee-lyx/ne-rewritten`, `master` at `297c966`.
Local starting point: `5b7fb91`. Initial divergence: 35 local-only commits,
6 upstream-only commits. Integrate with real merge ancestry.

## Included Commits

| Commit | Change |
| --- | --- |
| `88793b7` | Optional debug verification; UP1MN expansion corrections |
| `98035e3` | Preserve imported entries below the tree bottom; import error translation |
| `c37de97` | Consecutive-rejection expansion guard and shared expansion context |
| `46c6a72` | Tree expansion algorithm documentation |
| `c41a252` | Move that documentation into docs and update references |
| `297c966` | UPMS and LPMS higher-parent loop boundary corrections |

## Confirmed Behavior

The user chose upstream behavior for importing and restoring entries below
the current tree bottom: retain them as pending data on the smallest initial
node. Do not force expansion during lazy import or restore. The existing
expand-all-on-import setting continues to control eager materialization.
Entries above the tree top remain unmatched.

Preserve the local page layout, Explore toolbar, focus/scroll preferences,
local-file lifecycle, stable notation IDs, standalone selection rules,
operation-sequence display and explicit equivalent-diagram routing.
No settings-page controls are reintroduced from upstream.

The expansion guard adopts upstream's module-level threshold synchronized
from settings and counts consecutive rejected terms within one expansion.
The operation-sequence search retains its independent bounded search;
it is not the tree expansion guard.

Debug verification runs for initial and expanded nodes when supplied by a
notation. Failure or a thrown verifier error only produces a console warning,
not a dialog or blocked node. UP1MN's sample verifier remains disabled.

## Conflict Resolution

- Keep local API documentation and append the debug-verification contract.
- Keep local SettingsBar unchanged; adapt the relocated ExploreToolbar calls.
- Keep NotationTreeItem's focus preference and equivalent/operation display.
- Keep local save/restore and file ownership behavior while applying upstream
  import handling and updated expansion calls.
- Combine UP1MN's explicit layer renderer with the corrected FS variants.

## Verification

- Type checking passes; 49 test files / 311 tests pass.
- Standard, compatibility and standalone builds pass. Existing warnings about
  large chunks, deprecated inlineDynamicImports and standalone import.meta remain.
- New tests cover below-bottom save/restore/materialization, above-top rejection,
  high valid FS indices, changed guard limits and non-blocking debug verification.
- UP1MN/UPMS differential checks cover 1,008 finite expansions across all three
  FS modes. These are bounded regression checks, not a proof of equivalence.
- Live browser checks confirm both requested BMS operation sequences, search,
  retained Explore layout and no substituted 1Y diagram. No browser errors.
- Local-file lifecycle and standalone boundaries are covered by the existing
  regression suite; their full browser workflows were not repeated this round.
