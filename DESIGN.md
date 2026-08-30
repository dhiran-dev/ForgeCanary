# ForgeCanary Post-Hero Landing Design Contract

Status: approved for implementation
Scope: the four landing-page sections after the existing release-runway hero
Hero boundary: the hero render, copy, video/poster, layout, lighting, and scroll cue remain owned by the hero task and are not redesigned here.

## Approved visual references

These images are the visual acceptance criteria. They are not loose mood boards.

| Section | Reference |
| --- | --- |
| 01 — Replay orchestration | `design/release-runway/reference/01-replay-orchestration.png` |
| 02 — Evidence diff | `design/release-runway/reference/02-evidence-diff.png` |
| 03 — Human release control | `design/release-runway/reference/03-human-release-control.png` |
| 04 — Release proof | `design/release-runway/reference/04-release-proof.png` |

When this document and a visual reference appear to disagree, preserve the reference's composition and this document's typography, color-rationing, accessibility, and motion constraints.

## Product story

The page explains one release-safety narrative in four steps:

1. TrueForge launches specialists that replay the same real work against the current and upgrade versions.
2. ForgeCanary compares evidence, not only matching agent/tool replies.
3. A detected behavioral change is held behind a human-controlled release gate.
4. A reviewed repair is replayed, verified, and exported as proof.

Every animated element must explain one of those causal steps. Idle rotation, floating decoration, ambient orbiting, parallax, and camera motion are out of scope.

## Visual thesis

The interface should feel like a datacenter rack at midnight with one green LED lit:

- near-black, floorless canvas;
- glossy black anodized hardware;
- crisp neutral-silver machined edges;
- exposed but physically credible conduits;
- green used as an active electrical signal, never as decoration;
- coral used only where evidence diverges or a release is held;
- system labels that look engraved or terminal-issued;
- human copy that remains calm, editorial, and highly legible;
- generous negative space with no decorative grid or floor plane.

## Color tokens

```css
--color-void-black: #0b0e12;
--color-carbon: #181a1d;
--color-graphite: #1f2124;
--color-slate-base: #303235;
--color-fog: #5d5e61;
--color-steel: #818284;
--color-ash: #a3a4a5;
--color-silver: #bababb;
--color-bone: #dedede;
--color-phosphor-green: #00d892;
--color-deep-teal: #002923;
--color-emerald-depth: #005441;
--color-diagnostic-magenta: #9f3f53;
--color-syntax-violet: #c58aff;
--color-syntax-coral: #ff6285;
--color-syntax-forest: #006d4a;
```

### Color rationing

- Phosphor Green is limited to active/initialized/verified signals, the brand mark, and text on a Deep Teal action.
- Deep Teal is the only filled chromatic UI surface and is limited to one primary action per section.
- Syntax Coral appears only on the actual evidence divergence, held path, or mismatch label.
- The resolved Release Proof section contains no coral.
- Large green fills, generic green borders, blue lighting, amber lighting, and decorative gradients are prohibited.

## Typography

### Human-readable copy

Primary family:

```css
font-family: "SuisseIntl", "Inter Variable", "Helvetica Neue", system-ui, sans-serif;
font-weight: 400;
```

SuisseIntl is the target. Inter Variable is the packaged production substitute. Weight 400 is the only permitted weight; hierarchy comes from size, leading, tracking, and color.

| Role | Size | Line height | Tracking |
| --- | ---: | ---: | ---: |
| Display | 65px | 1.10 | -0.005em |
| Section heading | 50–60px | 1.08–1.12 | -0.003em |
| Heading | 36px | 1.17 | 0 |
| Subheading | 20px | 1.30 | 0.014em |
| Body | 14–18px | 1.38–1.50 | 0 |

### System-issued copy

Primary family:

```css
font-family: "GT America Mono", "IBM Plex Mono", ui-monospace, monospace;
font-weight: 400;
font-feature-settings: "calt" 0;
```

Use GT America Mono semantics for section indices, machine labels, evidence values, statuses, buttons, captions, and process rails. IBM Plex Mono is the packaged production substitute.

| Role | Size | Line height | Tracking |
| --- | ---: | ---: | ---: |
| Caption | 10px | 1.60 | 0.064em |
| Machine label | 10–11px | 1.30–1.45 | 0.058em |
| Action | 12px | 1.30 | 0.053em |
| Technical subheading | 20px | 1.30 | 0.014em |

Do not bake words into ImageGen assets. All meaningful copy must be HTML so spelling, responsiveness, accessibility, and live data remain exact.

## Spacing and structure

- Page maximum width: 1200px.
- Desktop section minimum height: approximately one viewport, with content allowed to grow.
- Desktop section padding: 80–128px vertically, 32–48px horizontally.
- Primary split: 34–40% copy and 60–66% hardware.
- Element gap: 12px.
- Card padding: 20px.
- Structural radius: 1px.
- Structural elevation: surface-color stepping plus one-pixel Slate strokes; no drop shadows on UI panels.
- Section boundaries: one-pixel Slate hairline.
- Copy remains left-aligned. Centered marketing copy is prohibited.

Mobile is a fail-gracefully target in this phase: preserve reading order, prevent overflow, keep labels legible where practical, and provide a static/reduced animation state. Separate mobile art direction is deferred.

## ImageGen hardware contract

ImageGen is responsible only for the physically rich, non-semantic hardware plate:

- glossy black metal chassis;
- silver chamfers and fasteners;
- smoked inspection glass;
- recessed blank display faces;
- physically coherent perspective and neutral studio lighting.

ImageGen must not supply:

- page background;
- copy or labels;
- icons whose meaning is required;
- particles;
- colored status lighting;
- conduits that need to animate;
- buttons or other interactive UI.

Generate each final plate against a uniform out-of-palette `#0000ff` chroma background. Direct ImageGen transparency is not trusted because the prototype produced RGB files with a baked checkerboard. Convert the chroma plate to a verified RGBA PNG with `ffmpeg` and inspect the result over `#0b0e12` before committing it.

Production pages consume only the keyed RGBA plate. Keep the source chroma asset only when it materially helps reproduce or revise the plate.

## Glass conduit contract

The conduits are code-rendered SVG and must read as glass-and-metal tubes, not flat neon lines.

Each visible conduit uses the same path several times in this back-to-front order:

1. deep-black outer occlusion stroke;
2. Graphite metal housing stroke;
3. thin Silver edge highlight;
4. translucent smoked-glass interior stroke;
5. faint Emerald Depth inner channel;
6. narrow active Phosphor Green or mismatch Coral signal core.

Requirements:

- square or round joins are selected to match the reference hardware, never a generic hand-drawn curve;
- curves have broad mechanical radii and deliberate ninety-degree routing;
- all image-plate ports and SVG endpoints overlap beneath the raster hardware so joins are hidden;
- the glass channel remains visible when no packet is present;
- glow is restrained and localized; there is no global bloom haze;
- routes behind hardware are naturally occluded by placing SVG below the RGBA plate;
- a foreground SVG layer is allowed only where a route must visibly cross in front.

## Packet motion contract

Purpose: explanation and state indication.
Frequency tier: continuous marketing demonstration.
Tool: SVG path-following motion plus CSS opacity transitions; no animation library is required.

Packets are small rectangular data bars, not dots or scale pulses:

- target size: 12–24px long and 2–5px high at the reference viewBox;
- constant, fast translation along the conduit with linear timing;
- multiple packets offset along an active route to make direction unambiguous;
- no bounce, wobble, rotation for decoration, or size pulsing;
- packets stop, dim, or change route in response to the real `RunwayView` phase;
- only the divergence packet and branch use Coral;
- `prefers-reduced-motion` removes translation and leaves a static, legible signal state.

## Section specifications

### 01 — Replay orchestration

Copy:

- `01 / HOW REPLAY WORKS`
- `Your safety team is checking the upgrade.`
- `ForgeCanary asks TrueForge to launch four specialists. Watch who is working, what each is checking, and what they return before anything ships.`

Required hardware: central release lead, old-version replay, upgrade replay, reality checker, safety reviewer, and six replay cartridges. Four cartridges can be shown complete, one active, and one pending during replay. Exactly one Coral branch terminates at `01 CHANGE HELD` after a divergence is known.

### 02 — Evidence diff

Copy:

- `02 / EVIDENCE DIFF`
- `Both returned success. Only one did the right thing.`
- `The upgrade produced the same answer, but selected different medicine. ForgeCanary compares what actually happened—not just what the agent said.`

Required evidence: both paths report `RESERVED 4 UNITS`; Current selects `EXP / SEP 05`; Upgrade selects `EXP / DEC 01`; Coral appears only on the semantic difference and `EVIDENCE DIVERGED` state.

### 03 — Human release control

Copy:

- `03 / HUMAN RELEASE CONTROL`
- `Nothing ships until you decide.`
- `The upgrade reserved the same four units, but chose later-expiring stock. ForgeCanary holds the release before anything changes.`

Required state: a substantial closed mechanical interlock between comparison and production; `KEEP BLOCKED` is the Deep Teal primary action; `REVIEW SAFE FIX` is a neutral outlined action; production beyond the gate remains dark.

### 04 — Release proof

Copy:

- `04 / RELEASE PROOF`
- `Every release leaves a receipt.`
- `The reviewed repair preserved every expected outcome and changed nothing outside scope.`

Required state: release lead connected to the four specialists, six verified proof cells, a final `SAFE TO SHIP` gate, proof receipt rows, and no Coral anywhere in the section.

## Live data mapping

All sections receive the derived `RunwayView` rather than creating a second state model.

- `ready/current`: Current connected; later routes dim.
- `replay`: replay routes and cartridges run sequentially.
- `compare`: evidence routes active and divergence visible when `changesFound > 0`.
- `blocked/failed`: Coral divergence remains held at the closed operator gate.
- `repair`: corrected replay route becomes active; held path dims.
- `complete`: all six proof cells and Safe to Ship illuminate in Green; Coral is absent from Release Proof.

Static fallback values may explain the canonical six-order story when the API is unavailable, but real values supersede them whenever present.

## Accessibility and performance

- Hardware imagery has concise alt text when informative and empty alt text when equivalent labels already exist in the DOM.
- SVG motion layers are `aria-hidden`.
- Section headings and reading order remain semantic.
- Buttons and links have visible one-pixel Green focus outlines with at least four pixels of offset.
- Reduced motion leaves complete static evidence; it never removes information.
- Images declare dimensions and load lazily below the hero.
- Prefer one keyed raster plate per section over dozens of component requests.
- Avoid runtime blur filters over large areas; emissive effects should be baked or limited to small SVG/HTML elements.
- The implementation must not introduce a second WebGL canvas.

## Visual acceptance checklist

A section is not complete until a desktop screenshot proves all of the following against its approved reference:

- composition, negative space, and scale match;
- hardware occupies the intended visual mass;
- raster alpha has no blue or checkerboard fringe;
- conduit endpoints meet hardware ports;
- conduits read as glass/metal rather than flat strokes;
- packet size, speed, spacing, and direction communicate work;
- typography follows the two-family rule and weight 400;
- Green and Coral obey the rationing rules;
- no floor, grid, cream, amber, rounded structural cards, or generic glow was introduced;
- exact copy is readable and correctly spelled;
- the hero above remains unchanged.
