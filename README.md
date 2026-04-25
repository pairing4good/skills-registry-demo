# skills-registry-demo

> An end-to-end reference implementation for publishing, discovering, and consuming AI agent skills through a governed enterprise registry — backed by JFrog Artifactory and exposed via the Model Context Protocol (MCP).

---

## Why this exists

AI agents are only as good as the instructions they can follow. As organizations deploy more agents — for code review, data analysis, customer support, document processing, and beyond — a quiet infrastructure problem emerges: **where do the skills that power those agents actually live, and who decides which ones are safe to use?**

Without a deliberate answer, teams default to ad-hoc solutions. Skills get copy-pasted between repos, versioning is inconsistent, and no one has a clear picture of what agents across the organization are actually capable of or constrained by. The result is duplicated effort, security blind spots, and agents that behave differently depending on which team built them.

This repo demonstrates a better path.

---

## The enterprise case for a governed skills registry

### Internal skills deserve the same rigor as internal libraries

When a software team writes a reusable library, they publish it to an internal artifact repository. They version it, test it, review it before it ships, and deprecate old versions deliberately. The same discipline should apply to the skills that define how AI agents behave.

An internal skills registry gives an organization:

**A single source of truth.** Every team building agents points at the same registry. When a skill is updated — because a policy changed, an API was deprecated, or a better approach was discovered — the update propagates everywhere. There is no stale copy floating in a forgotten repository.

**Institutional knowledge, encoded and preserved.** Skills capture hard-won understanding: how to handle edge cases in your specific data, how to interact with your internal systems, what tone and format your organization expects. That knowledge belongs to the company, not to whoever happened to write the first prompt. A registry makes it durable and transferable.

**Clear ownership and accountability.** When a skill is published to a registry, someone owns it. There is a named author, a version history, and a review trail. If an agent misbehaves, you can trace the behavior back to the skill that drove it — and to the person who approved it.

**Reuse without reinvention.** The analyst team figured out the right way to query the data warehouse. The support team perfected how to summarize tickets. Neither team should have to rediscover what the other already knows. A shared registry turns individual expertise into organizational capability.

---

### External skills need a curation layer

The broader AI ecosystem is producing skills, tools, and prompting patterns at a pace no organization can fully track. Many of these are genuinely useful. Some are poorly designed. A few could introduce security or compliance risks if deployed inside an enterprise environment.

A governed registry gives organizations a deliberate curation process for external skills:

**Vetting before deployment.** Before an externally sourced skill is available to agents inside the company, it passes through a review process. Does it handle sensitive data appropriately? Does it produce output consistent with company policy? Does it have dependencies that need security review? The registry enforces this gate.

**Approved skill sets, not open access.** Rather than allowing agents to pull skills from anywhere on the internet, agents consume from a curated catalog. The security team knows exactly what is in scope. Compliance can audit the catalog. Legal can flag anything that creates liability.

**Controlled updates.** External skills change. The original author may update them in ways that are beneficial — or in ways that break assumptions your agents depend on. By mirroring approved external skills in your own registry, your organization controls when and whether updates are adopted, rather than being subject to changes outside your visibility.

**Provenance and licensing clarity.** Enterprise environments have obligations around IP and data usage. A registry with explicit provenance records — where each skill came from, under what license, when it was last reviewed — gives legal and compliance teams the documentation they need.

---

## What this repo demonstrates

This project shows the full lifecycle of an enterprise skills registry, from initial setup through ongoing skill development and discovery:

- **A JFrog Artifactory instance** configured as a generic artifact repository for skills, running in Docker and pre-seeded with one vetted skill so the tutorial has something real to work with from the first command.

- **An MCP server** that wraps the Artifactory REST API and exposes structured tools agents can call to discover available skills, retrieve their content, and publish new ones — all without agents needing to know anything about the underlying storage.

- **MCP-native skill discovery** directly inside Claude Code. Connect Claude Code to the MCP server, then ask Claude to search the registry — it calls `list_skills`, `get_skill`, and `search_skills` in real time.

- **A skill authoring workflow** using the `skill-creator` skill, showing how Claude generates a new skill locally, how it gets committed to version control, and how it is published to the registry and immediately becomes available for discovery.

The infrastructure is intentionally straightforward. JFrog Artifactory is already the artifact repository of choice in many enterprises — for containers, packages, and binaries. This project shows that the same platform, the same access controls, and the same operational workflows can extend naturally to AI agent skills.

---

## Repository structure

```
skills-registry-demo/
├── docker/
│   ├── jfrog/              # Artifactory container, bootstrap script, and seed skills
│   └── mcp-server/         # MCP server container
├── docs/                   # Step-by-step tutorial
├── docker-compose.yml      # Brings up all containers together
└── README.md
```

---

## Prerequisites

- Docker and Docker Compose
- Claude Code CLI (`claude --version`)

---

## Quickstart

```bash
git clone https://github.com/your-org/skills-registry-demo
cd skills-registry-demo
docker compose up
```

This starts the JFrog Artifactory instance with `text-summarizer` pre-loaded and the MCP server pointed at it. The full tutorial walkthrough — discovering skills, creating a new one, publishing it, and confirming discovery — is in [`docs/Tutorial.md`](docs/Tutorial.md).

---

## The broader pattern

The specific tools in this demo — JFrog Artifactory, MCP, Claude — are choices, not requirements. The pattern they implement is tool-agnostic:

1. **Store skills as versioned artifacts** in a repository your organization already governs.
2. **Expose discovery and retrieval through a protocol agents understand**, so agents can find and use skills without hardcoded paths or manual distribution.
3. **Gate publishing behind a review process** that matches the sensitivity of the use case.
4. **Treat skill development as a first-class engineering practice**: version control, authorship, review, deprecation.

Organizations that get this right gain compounding returns. Each new skill makes every future agent better. Each vetted external skill becomes available to the whole organization immediately. The registry becomes a strategic asset — a record of what the organization knows how to do with AI, and a foundation every new project can build on.

---

## Contributing

Tutorial steps and additional skill examples will be added once the core infrastructure is finalized. If you have questions about the architecture or want to adapt this pattern for your own environment, open an issue.

---

## License

MIT
