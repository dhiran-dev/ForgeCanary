# Variant F state suite

The original `Agent Workbench` composition is the visual baseline. These mockups describe one complete ForgeCanary release check without changing that layout.

## Interactive canvas

Open `index.html` to review the suite in a zoomable and pannable canvas. Use the left rail, bottom timeline, arrow keys, or autoplay to move through the release. `All states` opens a contact sheet; selecting a card returns to the canvas. Keyboard shortcuts: Left/Right for states, Space for autoplay, `F` to fit, and `B` to toggle the board.

## State sequence

| State | Mockup | Product behavior |
| --- | --- | --- |
| 01 | `01-ready-setup.png` | Resolve the reusable saved agent, review current/candidate MCP versions, replay corpus, and retention before creating a fresh parent run. |
| 02 | `02-worker-spawn-replay.png` | The parent run dispatches exactly six isolated replay workers. Users can see spawning, queued, working, and selected-worker activity. |
| 03 | `03-compare-divergence-held.png` | Existing approved Variant F: workers compare Current MCP, Upgrade MCP, evidence, and result; a semantic divergence is held. |
| 04 | `04-repair-approval.png` | The same parent run pauses for a human decision with accurate scope and inventory evidence. |
| 05 | `05-denied-zero-mutation.png` | Denial is verified against adapter and candidate state; requesting the repair again resumes this parent run. |
| 06 | `06-repair-verification.png` | Allowing the scoped repair replays all six jobs from fresh candidate state and independently verifies each outcome. |
| 07 | `07-release-proof.png` | All workers close into verified receipts, the parent receives a safe-to-ship verdict, and the release receipt is retained. |
| 08 | `08-history-retention.png` | History shows one expandable parent entry, six archived child results, inspection tabs, and automatic retention controls. |

## Functional invariants

- `ForgeCanary Replay Worker` is created once in TrueForge Agents Library and reused as configuration.
- ForgeCanary runtime configuration stores only the saved agent ID.
- Every release check creates a fresh parent execution titled `Release check: MCP v1 → v2`.
- The parent dispatches exactly six isolated replay workers; it does not create six unrelated History entries.
- Each worker follows `Current MCP → Upgrade MCP → Evidence → Result`.
- Repair denial, a later approval request, repair application, and verification remain in the same parent run.
- A new candidate version always starts a fresh parent run, preventing context carryover.
- Parent and job records carry case ID, candidate version, parent run ID, replay job ID, and final verdict.
- Release summaries and receipts are retained; low-level worker activity is archived or deleted by policy.

## Motion contract

- Spawn workers with transform and opacity over 180–220 ms, staggered by roughly 50 ms.
- Move small rectangular packets linearly along only the active SVG conduit.
- Expand the selected worker and its activity panel; completed workers compress into inspectable result receipts.
- Keep a held divergence open in Coral until the operator acts.
- On denial, stop the held path and reveal zero-mutation proof without creating a new parent entry.
- On approval, dim the prior held path and replay the same six workers from fresh execution state.
- Under reduced motion, remove packet travel and present the same information as static states.

## Image-generation prompt set

All generated states used `03-compare-divergence-held.png` as the visual reference. Prompts preserved its straight-on, near-black physical workbench and changed only the requested application state:

1. Ready setup with saved-agent checks, release inputs, six empty worker sockets, and a start action.
2. Live replay with two working workers, one spawning worker, queued workers, and selected-worker activity.
3. Human repair approval with matching `RESERVED 4 UNITS` responses and the `EXP / SEP 05` versus `EXP / DEC 01` evidence difference.
4. Denied proof with unchanged state hashes and an in-place `Request repair again` action.
5. Repair verification with four closed results, one active evidence check, one queued worker, and no Coral.
6. Safe-to-ship proof with six verified receipts, approval history, receipt metadata, and no Coral.
7. Expanded History with one parent entry, six archived child results, inspection tabs, and retention controls.

Shared constraints: `#0b0e12` canvas, neutral hardware, Green `#00d892` only for active/verified state, Coral `#ff6285` only for divergence/held state, no gradients, blue, amber, decorative grid, idle motion, or raw chat/session/thread terminology.
