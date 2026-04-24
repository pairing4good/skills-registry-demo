import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000';

async function main() {
  console.log('Skills Discovery Agent');
  console.log('======================');
  console.log(`MCP Server: ${MCP_SERVER_URL}`);
  console.log('');
  console.log('Searching for: text-summarizer, data-extractor');
  console.log('');

  const response = await client.beta.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    mcp_servers: [
      {
        type: 'url',
        url: `${MCP_SERVER_URL}/sse`,
        name: 'skills-registry',
      },
    ],
    system: `You are an AI assistant that discovers and reports on available skills in an enterprise skills registry.
Use the available MCP tools to search the registry and report clearly on what was found and what was not found.
Be concise and factual.`,
    messages: [
      {
        role: 'user',
        content: `Search the skills registry for these two skills:
1. text-summarizer
2. data-extractor

Use list_skills to see all available skills, then use get_skill to fetch details for any you find.

For each skill:
- If FOUND: show its name, version, description, and tags
- If NOT FOUND: clearly state it is missing from the registry

Format your response clearly with a section for each skill.`,
      },
    ],
    betas: ['mcp-client-2025-04-04'],
  });

  for (const block of response.content) {
    if (block.type === 'text') {
      console.log(block.text);
    }
  }

  console.log('');
  console.log(`Stop reason: ${response.stop_reason}`);
}

main().catch((err) => {
  console.error('Agent error:', err.message);
  process.exit(1);
});
