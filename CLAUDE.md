# Skills Registry Demo

## MCP server

The skills registry MCP server runs locally at `http://localhost:3000` (started via `docker compose up`). It is configured in `.claude/settings.local.json` under `mcpServers`.

The server is self-documenting — it will instruct you on the required workflow (including how to use `skills-lock.json`) when you connect.

## skills-lock.json

Defines the version constraint for every skill this project uses. Edit it to upgrade or pin skills. Commit it so every agent in the project uses the same versions.
