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

Requirements:

- Node.js 22.14 or newer
- A running TrueForge instance at `http://localhost:8790`
- At least one model configured in TrueForge Settings → Models

Start the TrueForge harness in the first terminal:

```bash
npx @truefoundry/trueforge
```

TrueForge serves its own browser UI at `http://localhost:8790`; it is the inspectable agent runtime, not the main domain UI for this demo.

Install and launch ForgeCanary in a second terminal:

```bash
npm install
npm run demo
```

Open [http://127.0.0.1:9300](http://127.0.0.1:9300), then:

1. Select **Run the canary**.
2. Wait for the proposed-version regression and TrueForge approval card.
3. Choose **Deny — prove zero mutation**.
4. Select **Request the repair again**.
5. Choose **Allow — apply, then replay all six jobs**.
6. Confirm the final **6/6 outcomes correct** verdict and download the hashed receipt.

ForgeCanary automatically registers these loopback MCP connectors in TrueForge:

| Connector | Purpose | URL |
| --- | --- | --- |
| `forgecanary-inventory-v1` | Current behavior baseline | `http://127.0.0.1:9101/mcp` |
| `forgecanary-inventory-v2` | Proposed upgrade and repaired replay | `http://127.0.0.1:9102/mcp` |
| `forgecanary-adapter-control` | Approval-gated compatibility repair | `http://127.0.0.1:9200/mcp` |

Model credentials remain in TrueForge and are never returned by ForgeCanary. The operator server binds to loopback, requires JSON plus an ephemeral same-origin token for every state-changing request, and stores runtime state under the ignored `.data/` directory.

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
