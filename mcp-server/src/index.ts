import express, { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import * as artifactory from './artifactory.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

const server = new McpServer(
  { name: 'skills-registry-mcp', version: '1.0.0' },
  {
    instructions: `This is the Skills Registry MCP server. It serves versioned skill bundles from a JFrog Artifactory repository.

REQUIRED WORKFLOW — follow this before every skills_get call:
1. Read the project's skills-lock.json file from the working directory.
2. Find the version constraint for the skill you need.
3. Pass that constraint as the version parameter to skills_get.

If skills-lock.json does not exist: stop and tell the user they must create one before any skills can be loaded.
If a skill is not listed in skills-lock.json: stop and ask the user which version to use — do not guess.

Version constraint formats:
  "latest"  — resolves to the highest published version at call time
  "1.2.3"   — exact pin, never auto-upgraded
  "~1.2.0"  — patch-compatible: highest version >=1.2.0 and <1.3.0
  "^2.0.0"  — minor-compatible: highest version >=2.0.0 and <3.0.0

The version parameter on skills_get is required. The server will reject calls that omit it.`,
  }
);

server.registerTool(
  'skills_list',
  {
    title: 'List Skills',
    description:
      'List all skills available in the JFrog Artifactory skills registry, including every published version of each skill. ' +
      'Results are paginated — use limit and offset to page through large registries.',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(100).default(20)
        .describe('Maximum number of skills to return (1–100, default 20).'),
      offset: z.number().int().min(0).default(0)
        .describe('Number of skills to skip for pagination (default 0).'),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ limit, offset }) => {
    try {
      const result = await artifactory.listSkills(limit, offset);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      };
    }
  }
);

server.registerTool(
  'skills_get',
  {
    title: 'Get Skill',
    description: `Fetch all files for a specific skill by name and version.

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
    inputSchema: z.object({
      name: z.string().describe('The skill name, e.g. "text-summarizer"'),
      version: z.string().describe(
        'Version constraint from skills-lock.json. Required — do not call without consulting skills-lock.json first.'
      ),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ name, version }) => {
    try {
      const resolvedVersion = await artifactory.resolveVersion(name, version);
      const content = await artifactory.getSkill(name, resolvedVersion);
      return {
        content: [{
          type: 'text',
          text: `skill: ${name}@${resolvedVersion} (constraint: ${version})\n\n${content}`,
        }],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      };
    }
  }
);

server.registerTool(
  'skills_search',
  {
    title: 'Search Skills',
    description:
      'Search skills by name, tag, or description keyword. ' +
      'Results are paginated — use limit and offset to page through large result sets.',
    inputSchema: z.object({
      query: z.string().describe('Search term to match against skill name, description, or tags.'),
      limit: z.number().int().min(1).max(100).default(20)
        .describe('Maximum number of results to return (1–100, default 20).'),
      offset: z.number().int().min(0).default(0)
        .describe('Number of results to skip for pagination (default 0).'),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ query, limit, offset }) => {
    try {
      const results = await artifactory.searchSkills(query, limit, offset);
      return {
        content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      };
    }
  }
);

const app = express();

app.get('/health', async (_req: Request, res: Response) => {
  try {
    await artifactory.checkHealth();
    res.json({ status: 'ok', artifactory: 'connected' });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post('/mcp', express.json(), async (req: Request, res: Response) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`Skills Registry MCP server listening on port ${PORT}`);
  console.log(`Health:  http://localhost:${PORT}/health`);
  console.log(`MCP:     http://localhost:${PORT}/mcp`);
});
