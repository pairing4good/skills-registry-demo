# Skills Registry Demo — Tutorial

This tutorial walks through the complete skill lifecycle: start the registry, discover existing skills, author a new skill using the official Anthropic `skill-creator`, then publish it so agents can find it.

---

## Prerequisites

- **Docker Desktop** with Docker Compose v2+ (`docker compose version`)
- **Node.js 18+** (`node --version`)
- **Python 3.9+** (`python3 --version`) — needed for the skill-creator's eval scripts
- **Claude Code** CLI (`claude --version`)
- **An Anthropic API key** — get one at [console.anthropic.com](https://console.anthropic.com)

---

## Step 1 — Clone and configure

```bash
git clone https://github.com/your-org/skills-registry-demo
cd skills-registry-demo
cp .env.example .env
```

Open `.env` and set your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

The other defaults (`admin`/`password` for Artifactory) work as-is for local development.

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

## Step 4 — First agent run (partial discovery)

Install the agent's dependencies and run it:

```bash
cd agent
npm install
node discover-skills.js
```

The agent asks the MCP server to find two skills: `text-summarizer` and `data-extractor`.

**Expected output:**

```
Skills Discovery Agent
======================
MCP Server: http://localhost:3000

Searching for: text-summarizer, data-extractor

## text-summarizer ✓ FOUND

- **Version:** 1.0.0
- **Description:** Condenses long-form text into a concise bulleted list of key points.
- **Tags:** summarization, nlp, text-processing, productivity

## data-extractor ✗ NOT FOUND

The skill `data-extractor` is not currently registered in the skills registry.
```

One skill exists. One is missing. Let's build it.

---

## Step 5 — Create the missing skill with `/skill-creator`

Go back to the project root in Claude Code:

```bash
cd ..   # back to skills-registry-demo root
```

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

## Step 6 — Run evaluations

Once you confirm the test cases look good, the skill-creator runs them and presents results. It spawns two subagents per test — one using the skill, one without — so you can see the difference.

While the tests run, the skill-creator drafts quantitative assertions and explains what they check.

When the runs complete, it opens the eval viewer in your browser. The viewer has two tabs:

- **Outputs** — click through each test case, see the skill's output, and leave feedback
- **Benchmark** — pass rates, timing, and token usage compared to the baseline

Click through the test cases, leave notes in the feedback boxes, then click **Submit All Reviews** when done.

---

## Step 7 — Improve based on feedback

Tell the skill-creator you're done reviewing:

> Done reviewing. The date extraction looks good but it's missing URLs in the mixed-content test.

The skill-creator reads your feedback, rewrites the relevant sections of `SKILL.md` to address the issue, then re-runs the tests into a new iteration. It opens the viewer again with a **Previous Output** column so you can compare before and after.

Repeat until you're satisfied.

---

## Step 8 — Optimize the description for triggering

After the skill is working well, ask the skill-creator to optimize its description:

> The skill is looking good. Can you optimize the description so Claude triggers it reliably?

The skill-creator will:
1. Generate 20 eval queries (should-trigger and should-not-trigger), realistic and concrete
2. Open an interactive HTML editor so you can review and adjust them
3. Run the optimization loop in the background
4. Apply the best-scoring description to the SKILL.md frontmatter and show you the before/after

---

## Step 9 — Commit the skill to git

```bash
git add skills/data-extractor/
git commit -m "feat(skills): add data-extractor v1.0.0"
```

---

## Step 10 — Publish to JFrog

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

## Step 11 — Second agent run (full discovery)

```bash
cd agent
node discover-skills.js
```

**Expected output:**

```
Skills Discovery Agent
======================
MCP Server: http://localhost:3000

Searching for: text-summarizer, data-extractor

## text-summarizer ✓ FOUND

- **Version:** 1.0.0
- **Description:** Condenses long-form text into a concise bulleted list of key points.
- **Tags:** summarization, nlp, text-processing, productivity

## data-extractor ✓ FOUND

- **Version:** 1.0.0
- **Description:** Extracts structured data (names, dates, numbers, URLs) from unstructured text.
- **Tags:** extraction, nlp, structured-data, parsing
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
| Discovery agent | `agent/discover-skills.js` | Demonstrates agent-driven skill lookup via MCP |
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
