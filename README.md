# ForgeCanary

ForgeCanary is a semantic compatibility gate for agent tools.

An MCP upgrade can keep the same schema, accept the same arguments, and return the same response while silently changing the real business outcome. ForgeCanary replays successful agent work against both tool versions, verifies external state independently, and places any corrective write behind TrueForge human approval.

## Demo scenario

The included inventory scenario tests a proposed reservation-tool upgrade:

- The current version reserves the eligible batch that expires first.
- The proposed version returns the same protocol response but chooses a cheaper, later-expiring batch.
- ForgeCanary detects the external-state regression.
- TrueForge pauses before a reversible compatibility adapter can be activated.
- A denial leaves state unchanged; an approval is followed by a fresh replay and verification.

## Architecture

- **TrueForge** owns model calls, MCP tool execution, sandboxing, dynamic subagents, approval, and persisted session history.
- **ForgeCanary** provides the operator-facing workflow and independent business-state verification.
- **Project-owned MCP services** provide isolated current, candidate, and adapter-control endpoints for a safe demonstration.

The live operator flow is being developed on a feature branch. Complete setup, verification, and demo instructions will be added before that branch is merged.
