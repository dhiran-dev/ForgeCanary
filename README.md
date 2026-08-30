# ForgeCanary

ForgeCanary is a semantic compatibility gate for MCP upgrades, built on TrueForge.

An upgraded tool can expose the same schema, receive the same arguments, and return the same successful response while silently changing the real business outcome. ForgeCanary replays proven agent work against both versions, verifies the resulting external state independently, and places any corrective write behind a native TrueForge human approval.

## The two-minute story

The included release case upgrades an inventory-reservation MCP:

1. Six previously successful jobs run through the current MCP.
2. The same six jobs run through the proposed MCP.
3. Both versions say that every reservation succeeded. Their schemas, arguments, and responses match.
4. An independent state check finds the hidden change: the proposed version ships cheaper medicine expiring in December instead of eligible medicine expiring in September.
5. TrueForge agents inspect the contract and outcome evidence with dynamic subagents and a sandbox.
6. TrueForge pauses a narrowly scoped compatibility adapter for human approval.
7. Denying the call proves that no state changed. Requesting it again and allowing it applies the reviewed repair.
8. A fresh six-job replay proves both the tool protocol and all business outcomes are correct.

The judge-facing interaction happens in the ForgeCanary operator console. The **Open TrueForge** link exposes the underlying sessions, MCP calls, subagents, sandbox activity, and approval history so the orchestration is directly inspectable.

## What is real in the demo?

- TrueForge performs the model turns, remote MCP calls, dynamic subagent work, sandbox work, approval pause, and session persistence.
- ForgeCanary owns the release workflow, independent business oracle, state hashes, replay comparison, and operator UI.
- The inventory data is a deterministic local fixture so every judge sees the same safe scenario. The MCP traffic is real Streamable HTTP traffic; no tool transcript is fabricated.
- The inventory MCP is the demonstration adapter, not the product boundary. The same pattern applies anywhere an outcome can be checked independently: billing, support workflows, deployments, fulfillment, data pipelines, or internal operations.

## Run locally

### Requirements

- Node.js 22.14 or newer
- Ports `8790`, `9101`, `9102`, `9200`, and `9300` available
- At least one model configured in TrueForge Settings → Models

Install the project first:

```bash
npm install
```

Start TrueForge in the first terminal:

```bash
npm run trueforge
```

Open [http://localhost:8790](http://localhost:8790), go to **Settings → Models**, and configure at least one model. Model credentials remain in TrueForge and are never returned by ForgeCanary.

Start ForgeCanary in a second terminal:

```bash
npm run demo
```

The demo command builds the React UI and starts the current inventory MCP, candidate inventory MCP, adapter-control MCP, and operator server. It prints the URLs when every service is ready. Open [http://127.0.0.1:9300](http://127.0.0.1:9300).

Press `Ctrl+C` in the demo terminal to stop the ForgeCanary services. Stop TrueForge separately in its terminal.

### Application routes

| Route | Purpose |
| --- | --- |
| `/` | Product landing page and visual explanation of the release workflow |
| `/studio` | Operator Studio for starting, monitoring, approving, and inspecting release checks |

Use **Open Studio** in the landing-page navigation to enter the operator workflow. The Studio header must show **TrueForge connected** before a release check can start.

## Run the complete release-check demo

The recommended walkthrough exercises both approval outcomes: deny first to prove zero mutation, then allow the same repair inside the existing parent run.

### 1. Start a fresh release check

Open `/studio` and select **Start release check**.

ForgeCanary then:

1. Checks TrueForge and the three MCP services.
2. Resets the deterministic inventory fixtures.
3. Creates or reconciles the reusable **ForgeCanary Replay Worker** saved agent.
4. Creates one fresh parent TrueForge session for this release check.
5. Compares the current and candidate MCP schemas.

The saved agent is reusable configuration. It is preserved between release checks, while every check receives a fresh parent execution session so one candidate version cannot leak context into another.

### 2. Watch workers spawn and replay the current MCP

The worker bank is empty before the run. Worker cartridges appear only when ForgeCanary dispatches their jobs.

Six previously successful jobs run against the current MCP. Each worker records:

- its canonical order and replay job IDs;
- the TrueForge turn used for the replay;
- the tool name, arguments, and response;
- an independent check of the resulting inventory state.

The animated conduits move while a worker is active. Green indicates active or verified work; coral indicates a held regression or failure.

### 3. Compare the candidate MCP

The same six jobs run against the proposed MCP. The demo candidate exposes the same schema and returns successful responses that look equivalent to the current version, but it silently selects a cheaper, later-expiring medicine lot instead of the correct first-expiring lot.

ForgeCanary therefore checks two different things:

1. **Protocol compatibility:** schema, tool arguments, and tool responses.
2. **Semantic compatibility:** the real external business outcome.

The release is held when protocol checks pass but the independent business oracle detects the changed outcome.

### 4. Inspect the analysis

TrueForge analyzes the evidence inside the parent release run. It can spawn a contract analyst and an outcome auditor and use its sandbox to summarize the evidence. MCP capabilities are removed during this phase, so analysis cannot mutate inventory.

Use these inspection controls at any time:

- Select a worker cartridge to inspect its current task, tool call, and latest outcome.
- Select **Inspect parent run** to open the release-level modal with spawned jobs, results, and approval history.
- Select **Open TrueForge** to inspect the underlying parent session, turns, MCP calls, subagents, sandbox activity, approvals, and tool results.

### 5. Deny the repair and prove zero mutation

When TrueForge proposes the compatibility adapter, Studio shows the exact adapter ID, scope, candidate schema hash, evidence hash, and expected state hash. The adapter-control tool is approval-gated, so the workflow pauses before any write occurs.

Select **Deny & prove no change**.

ForgeCanary hashes the adapter state and candidate state before and after the denial. The expected result is **“No” changed nothing.** This proves that denying the call caused zero mutation.

### 6. Resume the same run and allow the repair

Select **Request repair again**. ForgeCanary keeps the existing parent release run and creates a new proposal for the same reviewed adapter.

Select **Allow & verify repair**. TrueForge applies the approval, and ForgeCanary verifies that:

- the adapter changed;
- its ID and scope exactly match the reviewed proposal;
- its schema and evidence hashes match the approval;
- the candidate inventory state did not receive an unrelated mutation.

### 7. Verify the repaired candidate

ForgeCanary resets the candidate fixture to fresh state and replays all six jobs. The release completes only if every repaired tool transcript still matches the baseline and every external-state check passes.

The expected final result is:

```text
Safe to ship
6/6 outcomes correct
1 scoped mutation
```

Select **Download release receipt** to save the hashed JSON receipt.

## Understand the Studio

| Component | Meaning |
| --- | --- |
| **Saved Agent** | Reusable TrueForge configuration containing the model, reasoning level, instructions, connectors, sandbox/subagent settings, and approval policy |
| **Parent Release Run** | One fresh TrueForge session representing one complete MCP release check |
| **Replay Worker** | One isolated replay execution linked to the parent run; cartridges appear only after dispatch |
| **Live Activity** | Persisted release events and the selected worker's current evidence |
| **Human Checkpoint** | The exact approval-gated repair proposal; denying or allowing resumes the same parent workflow |
| **Parent Run Inspector** | Release-level view of spawned jobs, tool-call counts, results, payloads, and approval history |
| **Release Proof** | Final semantic verdict and download link for the receipt |

### Saved-agent lifecycle

On the first connection, ForgeCanary creates `ForgeCanary Replay Worker` in the TrueForge Agents Library. On later starts, it looks up the stored ID and updates that same agent to match the current model, reasoning level, instructions, connectors, and approval policy. If the referenced agent was deleted, ForgeCanary finds or creates a replacement and stores its new ID.

ForgeCanary stores only the saved agent ID in `.data/saved-agent.json`; it does not copy model credentials or the manifest into its own configuration.

### Session and retention lifecycle

- Every release check receives a new case ID and parent run ID.
- All six replay jobs, analysis, repair approval, denial, retry, and verification remain linked to that parent run.
- A worker exists in Studio only after its job is dispatched.
- Starting another release check after a terminal result creates a fresh parent session but preserves the saved agent.
- **Return to empty** dismisses a terminal run from Studio without deleting its retained summary. At a pending approval, it first denies the write and verifies zero mutation. It stays disabled during replay and analysis so an active execution cannot be orphaned.
- Release summaries, approval history, and receipts are retained.
- Low-level worker events are archived after a receipt is generated, and child-run noise stays hidden from the main history.
- Runtime state is stored under the ignored `.data/` directory and survives normal process restarts.

If ForgeCanary stops during an active release check, the persisted case is marked failed on restart. Start a fresh release check rather than continuing an interrupted execution.

## Receipt contents

The downloaded receipt records:

- case, saved-agent, parent-run, session, replay-job, and turn IDs;
- baseline and candidate version labels;
- schema hashes and protocol-equality results;
- expected, candidate, and repaired inventory lot IDs;
- approval arguments, state hashes, decision, and mutation proof;
- final verdict and receipt hash.

## Configuration reference

ForgeCanary uses these environment variables when present:

| Variable | Default | Purpose |
| --- | --- | --- |
| `TRUEFORGE_BASE_URL` | `http://localhost:8790` | TrueForge API and UI address |
| `FORGECANARY_MODEL` | First preferred or available TrueForge model | Exact TrueForge model name to use |
| `FORGECANARY_REASONING_EFFORT` | `low` | Saved-agent reasoning effort |
| `FORGECANARY_BASELINE_VERSION` | `MCP v1` | Current-version label shown in Studio and receipts |
| `FORGECANARY_CANDIDATE_VERSION` | `MCP v2` | Candidate-version label shown in Studio and receipts |
| `V1_FIXTURE_BASE_URL` | `http://127.0.0.1:9101` | Current inventory MCP and oracle service |
| `V2_FIXTURE_BASE_URL` | `http://127.0.0.1:9102` | Candidate inventory MCP and oracle service |
| `CONTROL_BASE_URL` | `http://127.0.0.1:9200` | Approval-gated adapter-control service |
| `FORGECANARY_CASE_STATE` | `.data/live-case.json` | Persisted case-state path |
| `FORGECANARY_AGENT_REF` | `.data/saved-agent.json` | Persisted saved-agent ID path |

ForgeCanary automatically registers these loopback MCP connectors in TrueForge:

| Connector | Purpose | URL |
| --- | --- | --- |
| `forgecanary-inventory-v1` | Current behavior baseline | `http://127.0.0.1:9101/mcp` |
| `forgecanary-inventory-v2` | Proposed upgrade and repaired replay | `http://127.0.0.1:9102/mcp` |
| `forgecanary-adapter-control` | Approval-gated compatibility repair | `http://127.0.0.1:9200/mcp` |

The operator server binds to loopback and requires JSON plus an ephemeral same-origin token for every state-changing request.

## Troubleshooting

### Studio says “Services need attention”

Confirm that TrueForge is running at `http://localhost:8790`, that a model is configured, and that ports `9101`, `9102`, and `9200` are not occupied by stale processes. The Studio start button stays disabled until every health check passes.

### `npm run demo` reports that a service is already responding

The demo intentionally refuses to start over an old stack. Stop the earlier demo process and run `npm run demo` again.

### TrueForge reports that no model is configured

Open [http://localhost:8790](http://localhost:8790), configure a provider under **Settings → Models**, and reload ForgeCanary. If `FORGECANARY_MODEL` is set, its value must exactly match one of the model names returned by TrueForge.

### A release check stops safely

Read the error banner and use **Open TrueForge** to inspect the failing turn. ForgeCanary marks the case failed and does not execute an unapproved repair. Once the case is terminal, select **Start fresh release check**.

### The start button is disabled

ForgeCanary permits only one active release check. Wait for the current run to reach approval, completion, denial proof, or failure. Approval decisions are made in the Human Checkpoint panel rather than with the start button.

## Verification

```bash
npm run check
npm test
npm run build:ui
npm audit
```

## Architecture

```text
ForgeCanary UI :9300
       │
       ├── release workflow + external-state oracle + receipt
       │
       └── TrueForge :8790
              ├── current inventory MCP :9101
              ├── proposed inventory MCP :9102
              ├── adapter-control MCP :9200
              ├── dynamic subagents
              ├── sandbox
              └── native tool approval
```

The interface is React-based and uses selected [Beautiful UI](https://www.beautifului.dev/) primitives for progress, tool traces, and approval interaction.
