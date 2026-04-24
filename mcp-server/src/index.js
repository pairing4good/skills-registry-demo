import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import * as artifactory from './artifactory.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

const server = new McpServer({
  name: 'skills-registry-mcp',
  version: '1.0.0',
});

server.tool(
  'list_skills',
  'List all skills available in the JFrog Artifactory skills registry.',
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
  'Fetch the full SKILL.md content for a specific skill by name.',
  {
    name: z.string().describe('The skill name, e.g. "text-summarizer"'),
    version: z.string().optional().describe('Version string, e.g. "1.0.0". Defaults to latest.'),
  },
  async ({ name, version }) => {
    const content = await artifactory.getSkill(name, version);
    return {
      content: [{ type: 'text', text: content }],
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
const transports = new Map();

app.get('/health', async (_req, res) => {
  try {
    await artifactory.checkHealth();
    res.json({ status: 'ok', artifactory: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/messages', res);
  transports.set(transport.sessionId, transport);
  res.on('close', () => transports.delete(transport.sessionId));
  await server.connect(transport);
});

app.post('/messages', express.json(), async (req, res) => {
  const sessionId = req.query.sessionId;
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
