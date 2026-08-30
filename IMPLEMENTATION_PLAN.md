# ForgeCanary Post-Hero Sections — Implementation and PR Plan

This plan implements the approved four-section landing narrative with ImageGen hardware plates, code-rendered SVG glass conduits, HTML copy, and state-bound packet motion. It deliberately excludes hero redesign and all Blender work.

## Delivery architecture

```text
ReleaseRunwayPrototype
├── existing hero (unchanged by this work)
└── ReleaseRunwaySections
    ├── ReplaySection
    │   ├── keyed ImageGen hardware plate
    │   ├── SVG glass conduits and packets
    │   └── HTML copy and live labels
    ├── EvidenceSection
    ├── HumanControlSection
    └── ReleaseProofSection
```

Expected source layout:

```text
ui/src/runway/
├── ReleaseRunwaySections.tsx
├── release-runway-sections.css
└── sections/
    ├── ReplaySection.tsx
    ├── replay-section.css
    ├── EvidenceSection.tsx
    ├── evidence-section.css
    ├── HumanControlSection.tsx
    ├── human-control-section.css
    ├── ReleaseProofSection.tsx
    └── release-proof-section.css

ui/public/images/runway-sections/
├── replay/
├── evidence/
├── control/
└── proof/
```

Every section accepts:

```ts
type StorySectionProps = {
  view: RunwayView;
  reducedMotion: boolean;
};
```

The existing `deriveRunwayView` remains the single source of truth. No duplicated release state machine is permitted.

## Asset workflow

For each section:

1. Open the approved mockup and identify the non-semantic hardware silhouettes.
2. Generate one unlabelled plate in the same front/near-orthographic perspective and neutral lighting.
3. Exclude copy, status colors, particles, and animated conduits from the plate.
4. Ask for a uniform `#0000ff` background when direct alpha is unreliable.
5. Convert blue to alpha with a deterministic `ffmpeg colorkey` pass.
6. Verify `sips -g hasAlpha` reports `yes` and `file` reports RGBA.
7. Composite the plate over `#0b0e12` and inspect edges at original resolution.
8. Keep only useful source and production assets; never leave the final app dependent on `$CODEX_HOME` paths.

Example extraction command:

```sh
ffmpeg -y -i hardware-chroma.png \
  -vf 'colorkey=0x0000ff:0.28:0.08,format=rgba' \
  -frames:v 1 hardware-keyed.png
```

Similarity and blend values must be visually checked per asset; they are not blindly copied when edge spill remains.

## Shared compositor foundation

The first checkpoint adds:

- post-hero section container and shared tokens;
- SuisseIntl/Inter Variable human-copy stack;
- GT America Mono/IBM Plex Mono system-copy stack;
- reusable conduit stroke classes and gradients;
- reduced-motion helpers;
- lazy image behavior and stable aspect-ratio frames;
- a single insertion point after the hero.

The page must become scrollable only on the `/runway` route. Existing operator-console overflow behavior must remain untouched.

## Section checkpoints

### Checkpoint 1 — Replay orchestration

Deliverables:

- central release-lead composition;
- four specialist modules;
- six sequential replay cartridges;
- glass/metal conduit network;
- continuous fast rectangular packets;
- state-bound active/pending/held presentation;
- `DESIGN.md`, this plan, and the approved reference images.

Verification:

- screenshot at 1728×972 and 1440×900;
- compare hardware mass, copy column, active Replay rail, and mismatch socket with reference 01;
- confirm packet positions change over time without scale pulsing;
- confirm reduced motion produces a complete static state;
- run `npm run check`, `npm test`, and `npm run build:ui`.

PR:

- branch: `feat/release-runway-section-01-replay`
- base: `feat/release-runway-hero`
- title: `feat(runway): add replay orchestration story section`

### Checkpoint 2 — Evidence diff

Deliverables:

- result split from one request into Current and Upgrade;
- identical reported result on both sides;
- exact medicine-lot evidence in HTML;
- semantic-diff detector and single Coral branch;
- `OUTCOME MATCHED / EVIDENCE DIVERGED` status.

Verification:

- compare against reference 02 at 1728×972 and 1440×900;
- ensure both normal paths remain Green and only the semantic branch is Coral;
- verify the two evidence cards are readable and aligned with their inspection bays;
- run the full check/test/build gate.

PR:

- branch: `feat/release-runway-section-02-evidence`
- stacked base: `feat/release-runway-section-01-replay`
- title: `feat(runway): add evidence-diff story section`

### Checkpoint 3 — Human release control

Deliverables:

- Current and Upgrade comparison paths;
- closed mechanical operator interlock;
- Coral divergence held before production;
- exact `KEEP BLOCKED` and `REVIEW SAFE FIX` controls;
- live/static copy tied to the `RunwayView` phase.

Verification:

- compare against reference 03;
- prove production remains dark when blocked;
- inspect keyboard focus and action semantics;
- run the full check/test/build gate.

PR:

- branch: `feat/release-runway-section-03-control`
- stacked base: `feat/release-runway-section-02-evidence`
- title: `feat(runway): add human release-control section`

### Checkpoint 4 — Release proof

Deliverables:

- release lead and four approved specialist states;
- six verified proof cells and final Safe to Ship gate;
- proof-receipt rows and actions;
- no Coral in the resolved section.

Verification:

- compare against reference 04;
- prove all six cells and output gate respond to completion state;
- validate receipt/action semantics;
- run the full check/test/build gate.

PR:

- branch: `feat/release-runway-section-04-proof`
- stacked base: `feat/release-runway-section-03-control`
- title: `feat(runway): add release-proof story section`

## Required visual-audit loop

For every checkpoint:

1. Start the local Vite page at `/runway`.
2. Capture the whole section at the reference desktop viewport.
3. Open the captured screenshot and approved reference side by side.
4. Audit composition, typography, hardware scale, alpha edges, conduit construction, packet motion, color rationing, and copy.
5. Change the ImageGen asset, extraction parameters, SVG geometry, motion, or CSS whenever the mismatch is material.
6. Repeat capture and audit until no high- or medium-severity visual mismatch remains.
7. Run `design-review` on the rendered section.
8. Run `review-animations` on the motion implementation.
9. Fix every valid blocking or high-confidence finding and repeat verification.

The audit is evidence-driven. A passing build does not prove visual acceptance.

## Functional verification

Every checkpoint must pass:

```sh
npm run check
npm test
npm run build:ui
```

Browser verification must prove:

- `/runway` loads without new console errors;
- all required assets return successfully;
- live `RunwayView` classes/data update the intended states;
- pause/reduced-motion behavior does not remove information;
- there is no horizontal overflow at the primary desktop viewport;
- one narrow-width sanity check has no catastrophic overflow or unreadable page order.

The API backend may remain unavailable during Vite-only QA; pre-existing proxy failures are recorded separately and cannot conceal new client errors.

## PR and Qodo workflow

The four PRs are stacked to keep each review focused while landing the shared foundation only once.

For each PR:

1. Commit only the current checkpoint's files.
2. Push the named branch to `origin`.
3. Open the PR against the named base branch.
4. Include the approved reference and the captured implementation screenshot in the PR description when practical.
5. Wait for Qodo to finish.
6. Read every Qodo finding and reproduce or inspect it before changing code.
7. Fix valid findings on the same branch.
8. Re-run check/test/build and targeted visual QA.
9. Push the fixes and wait for Qodo again when review reruns.
10. Leave the PR merge-ready before declaring its checkpoint complete.

If the hero branch is not yet present on GitHub, implementation and local commits continue, but PR 1 is opened only after `feat/release-runway-hero` exists remotely. Do not publish an obsolete or incomplete hero branch merely to create a base.

## Commit boundaries

Expected history:

1. `feat(runway): add replay orchestration story section`
2. `feat(runway): add evidence diff story section`
3. `feat(runway): add human release control section`
4. `feat(runway): add release proof story section`

Qodo fixes receive focused follow-up commits when they materially clarify review history; trivial same-checkpoint corrections may be folded before first push.

## Completion criteria

The objective is complete only when:

- all four approved sections render after the unchanged hero;
- all four match their reference at the primary desktop viewport with no unresolved high/medium visual findings;
- glass conduits and rectangular packet motion satisfy `DESIGN.md`;
- copy uses the prescribed human/technical typography pairing;
- the live state model drives visible states;
- reduced motion and focus behavior are present;
- check, test, and production build pass;
- design and animation audits pass after fixes;
- four focused PRs are pushed;
- Qodo findings are processed and each PR is merge-ready.
