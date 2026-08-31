# ADR 0003: Migrate the application layer onto ne-rewritten

Date: 2026-08-31

## Decision

The fork keeps `ne-rewritten` as the only notation-definition format. The
application features from `notation-explorer` are migrated into this Vue/Vite
repository in vertical slices; the old classic-script runtime is not copied as
the application runtime and `register.push(...)` is not accepted for new local
sources.

The first slice exposes `notation_tools` from the existing registry/tree/
expander core. It provides listing, inspection, fundamental-sequence expansion,
infinite-chain detection, notation diffing, and isolated source validation for
the future AI and tools pages.

## Constraints

- Existing `TreeNode`, `registry`, `expander`, `analysis`, diagram, and XLSX
  modules remain the source of truth.
- AI output is validated in an isolated registration collector before it can be
  handed to the local-file lifecycle.
- Standalone builds must not acquire mutable AI/session state as a side effect.
- Migration commits stay in this fork; the old `notation-explorer` checkout is
  not modified.

## Follow-up slices

1. Port the owner-aware local notation file store/runtime using native
   `register_notation` and `register_category` only.
2. Port the page-level navigation and Tools workspace.
3. Port AI generation, visible tool-loop activity, cancellation/restart, and
   persisted active/archive conversations.
4. Port the standalone export boundary and add browser-level regression tests.

