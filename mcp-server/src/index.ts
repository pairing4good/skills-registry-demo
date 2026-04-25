import express, { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import * as artifactory from './artifactory.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

const server = new McpServer(
  { name: 'skills-registry-mcp', version: '1.0.0' },
  {
    instructions: `This is the Skills Registry MCP server. It serves versioned skill bundles from a JFrog Artifactory repository.

REQUIRED WORKFLOW — follow this before every get_skill call:
1. Read the project's skills-lock.json file from the working directory.
2. Find the version constraint for the skill you need.
3. Pass that constraint as the version parameter to get_skill.

If skills-lock.json does not exist: stop and tell the user they must create one before any skills can be loaded.
If a skill is not listed in skills-lock.json: stop and ask the user which version to use — do not guess.

Version constraint formats:
  "latest"  — resolves to the highest published version at call time
  "1.2.3"   — exact pin, never auto-upgraded
  "~1.2.0"  — patch-compatible: highest version >=1.2.0 and <1.3.0
  "^2.0.0"  — minor-compatible: highest version >=2.0.0 and <3.0.0

The version parameter on get_skill is required. The server will reject calls that omit it.`,
  }
);

server.tool(
  'list_skills',
  'List all skills available in the JFrog Artifactory skills registry, including every published version of each skill.',
  {},
  async () => {
    const skills = await artifactory.listSkills();
    return {
      content: [{ type: 'text', text: JSON.stringify(skills, null, 2) }],
    };
  }
);

server.tool(
  'get_skill',
  `Fetch all files for a specific skill by name and version.

IMPORTANT — version is required. Before calling this tool you must:
1. Read the project's skills-lock.json file.
2. Find the version constraint for this skill.
3. Pass it as the version parameter.

If skills-lock.json does not exist, stop and tell the user they must create one before skills can be loaded. Do not guess or assume a version.

Accepted version formats:
  "latest"   — resolves to the highest published version
  "1.2.3"    — exact pinned version
  "~1.2.0"   — patch-compatible: highest version >=1.2.0 and <1.3.0
  "^2.0.0"   — minor-compatible: highest version >=2.0.0 and <3.0.0`,
  {
    name: z.string().describe('The skill name, e.g. "text-summarizer"'),
    version: z.string().describe(
      'Version constraint from skills-lock.json. Required — do not call without consulting skills-lock.json first.'
    ),
  },
  async ({ name, version }) => {
    const resolvedVersion = await artifactory.resolveVersion(name, version);
    const content = await artifactory.getSkill(name, resolvedVersion);
    return {
      content: [{
        type: 'text',
        text: `skill: ${name}@${resolvedVersion} (constraint: ${version})\n\n${content}`,
      }],
    };
  }
);

server.tool(
  'search_skills',
  'Search skills by name, tag, or description keyword.',
  {
    query: z.string().describe('Search term to match against skill name, description, or tags.'),
  },
  async ({ query }) => {
    const results = await artifactory.searchSkills(query);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  }
);

const app = express();
const transports = new Map<string, SSEServerTransport>();

app.get('/health', async (_req: Request, res: Response) => {
  try {
    await artifactory.checkHealth();
    res.json({ status: 'ok', artifactory: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', message: (err as Error).message });
  }
});

app.get('/sse', async (_req: Request, res: Response) => {
  const transport = new SSEServerTransport('/messages', res);
  transports.set(transport.sessionId, transport);
  res.on('close', () => transports.delete(transport.sessionId));
  await server.connect(transport);
});

app.post('/messages', express.json(), async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(400).json({ error: 'Unknown sessionId' });
    return;
  }
  await transport.handlePostMessage(req, res);
});

app.listen(PORT, () => {
  console.log(`Skills Registry MCP server listening on port ${PORT}`);
  console.log(`Health:  http://localhost:${PORT}/health`);
  console.log(`SSE:     http://localhost:${PORT}/sse`);
  console.log(`POST:    http://localhost:${PORT}/messages`);
});
