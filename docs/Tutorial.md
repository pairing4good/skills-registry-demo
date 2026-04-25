# Skills Registry Demo — Tutorial

This tutorial walks through the complete skill lifecycle: start the registry, discover existing skills, author a new skill using the official Anthropic `skill-creator`, then publish it so agents can find it.

---

## Prerequisites

- **Docker Desktop** with Docker Compose v2+ (`docker compose version`)
- **Claude Code** CLI (`claude --version`)

---

## Step 1 — Clone and configure

```bash
git clone https://github.com/your-org/skills-registry-demo
cd skills-registry-demo
cp .env.example .env
```

The defaults in `.env` (`admin`/`password` for Artifactory) work as-is for local development — no other configuration needed.

---

## Step 2 — Install the skill-creator plugin

The `skill-creator` skill is published by Anthropic in the [`anthropics/skills`](https://github.com/anthropics/skills) marketplace. Install it once and it's available in every Claude Code session.

**Add the Anthropic marketplace:**

```
/plugin marketplace add anthropics/skills
```

**Install the `example-skills` plugin** (which includes `skill-creator`):

```
/plugin install example-skills@anthropic-agent-skills
```

**Reload plugins to activate:**

```
/reload-plugins
```

You can verify it's installed by opening the plugin manager and checking the **Installed** tab:

```
/plugin
```

---

## Step 3 — Start the infrastructure

```bash
docker compose up -d
```

This starts three services in order:

| Service | What it does |
|---------|-------------|
| `jfrog` | JFrog Artifactory OSS — the skills registry backend |
| `bootstrap` | One-shot script that creates the `skills-registry` repo and uploads `text-summarizer` v1.0.0 |
| `mcp-server` | Node.js MCP server that exposes skill discovery tools to agents |

**First start takes 2–3 minutes** while Artifactory initializes its embedded database. Subsequent starts are much faster.

Watch progress:

```bash
docker compose logs -f
```

Verify everything is healthy:

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","artifactory":"connected"}
```

You can also browse the Artifactory UI at [http://localhost:8082](http://localhost:8082) (login: `admin` / `password`).

---

## Step 4 — Connect Claude Code to the MCP server

The MCP server exposes its tools over HTTP. To make Claude Code aware of it, add an entry to `.claude/settings.local.json` in the project root:

```json
{
  "mcpServers": {
    "skills-registry": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Create this file at `.claude/settings.local.json` in the project root (the `.claude/` directory already exists). Claude Code picks up project-scoped settings automatically whenever you open the project directory.

> **Project-scoped vs user-scoped:** `.claude/settings.local.json` applies only to this project and is not committed to git — it's the right place for local connection details like `localhost` URLs. If you'd rather configure it once for all your projects, add the same `mcpServers` block to `~/.claude/settings.json` instead.

**Verify the connection** by running the `/mcp` command inside Claude Code:

```
/mcp
```

You should see `skills-registry` listed as a connected server, with its available tools:

```
skills-registry  connected
  • list_skills
  • get_skill
  • search_skills
```

If the server shows as disconnected, make sure the containers are running (`docker compose ps`) and the health check passes (`curl http://localhost:3000/health`).

---

## Step 5 — First discovery (partial)

Since Claude Code is already connected to the MCP server, you can query the registry directly — no separate agent or API key needed. Ask Claude:

> Search the skills registry for `text-summarizer` and `data-extractor`

Claude will call `list_skills` and `get_skill` through the `skills-registry` MCP connection and report back:

```
## text-summarizer ✓ FOUND

- Version: 1.0.0
- Description: Condenses long-form text into a concise bulleted list of key points.
- Tags: summarization, nlp, text-processing, productivity

## data-extractor ✗ NOT FOUND

The skill `data-extractor` is not currently registered in the skills registry.
```

One skill exists. One is missing. Let's build it.

---

## Step 6 — Create the missing skill with `/skill-creator`

Invoke the skill creator:

```
/skill-creator
```

Then describe what you want to build:

> I want to create a skill called `data-extractor` that extracts structured data — names, dates, numbers, and URLs — from unstructured text. It should output a clean JSON object with arrays for each entity type.

The skill-creator will guide you through its process:

1. **Capture Intent** — it asks clarifying questions: What does the skill do? When should it trigger? What's the output format?
2. **Interview & Research** — it asks about edge cases, example inputs, success criteria.
3. **Write the SKILL.md** — it drafts `skills/data-extractor/SKILL.md` with proper frontmatter, overview, usage, and examples.
4. **Propose test cases** — it suggests 2–3 realistic test prompts and asks if they look right.

Review the generated `skills/data-extractor/SKILL.md` before proceeding.

---

## Step 7 — Run evaluations

Once you confirm the test cases look good, the skill-creator runs them and presents results. It spawns two subagents per test — one using the skill, one without — so you can see the difference.

While the tests run, the skill-creator drafts quantitative assertions and explains what they check.

When the runs complete, it opens the eval viewer in your browser. The viewer has two tabs:

- **Outputs** — click through each test case, see the skill's output, and leave feedback
- **Benchmark** — pass rates, timing, and token usage compared to the baseline

Click through the test cases, leave notes in the feedback boxes, then click **Submit All Reviews** when done.

---

## Step 8 — Improve based on feedback

Tell the skill-creator you're done reviewing:

> Done reviewing. The date extraction looks good but it's missing URLs in the mixed-content test.

The skill-creator reads your feedback, rewrites the relevant sections of `SKILL.md` to address the issue, then re-runs the tests into a new iteration. It opens the viewer again with a **Previous Output** column so you can compare before and after.

Repeat until you're satisfied.

---

## Step 9 — Optimize the description for triggering

After the skill is working well, ask the skill-creator to optimize its description:

> The skill is looking good. Can you optimize the description so Claude triggers it reliably?

The skill-creator will:
1. Generate 20 eval queries (should-trigger and should-not-trigger), realistic and concrete
2. Open an interactive HTML editor so you can review and adjust them
3. Run the optimization loop in the background
4. Apply the best-scoring description to the SKILL.md frontmatter and show you the before/after

---

## Step 10 — Commit the skill to git

```bash
git add skills/data-extractor/
git commit -m "feat(skills): add data-extractor v1.0.0"
```

---

## Step 11 — Publish to JFrog

Push the skill artifact to the Artifactory registry:

```bash
source .env   # load ARTIFACTORY_USER, ARTIFACTORY_PASSWORD, ARTIFACTORY_URL

curl -u "${ARTIFACTORY_USER}:${ARTIFACTORY_PASSWORD}" \
  -X PUT \
  -H "Content-Type: text/markdown" \
  -T skills/data-extractor/SKILL.md \
  "${ARTIFACTORY_URL}/artifactory/skills-registry/skills/data-extractor/1.0.0/skill.md"
```

A `201 Created` response confirms the upload. Verify in the Artifactory UI at [http://localhost:8082](http://localhost:8082) under **Artifacts → skills-registry → skills → data-extractor**.

---

## Step 12 — Second discovery (full)

Ask Claude again:

> Search the skills registry for `text-summarizer` and `data-extractor`

Both skills are now registered:

```
## text-summarizer ✓ FOUND

- Version: 1.0.0
- Description: Condenses long-form text into a concise bulleted list of key points.
- Tags: summarization, nlp, text-processing, productivity

## data-extractor ✓ FOUND

- Version: 1.0.0
- Description: Extracts structured data (names, dates, numbers, URLs) from unstructured text.
- Tags: extraction, nlp, structured-data, parsing
```

Both skills are now registered and discoverable by any agent connected to the MCP server.

---

## What you built

| Component | Location | Purpose |
|-----------|----------|---------|
| JFrog Artifactory | `docker-compose.yml` → `jfrog` service | Versioned artifact storage for skills |
| Bootstrap script | `docker/jfrog/bootstrap.sh` | Seeds the registry with the first skill on startup |
| MCP server | `mcp-server/` | Exposes `list_skills`, `get_skill`, `search_skills` to any MCP-compatible agent |
| Pre-seeded skill | `skills/text-summarizer/SKILL.md` | Exists before the tutorial begins |
| Skill creator | Installed via `/plugin install example-skills@anthropic-agent-skills` | Official Anthropic skill-creator from [`anthropics/skills`](https://github.com/anthropics/skills) |

---

## Stopping the demo

```bash
docker compose down
```

To also remove the Artifactory data volume (full reset):

```bash
docker compose down -v
```
