# DB-MCP

A Model Context Protocol (MCP) server that provides governed semantic analytics queries through Cube.js.

## What is this?

DB-MCP acts as a bridge between AI assistants and your data warehouse, enabling natural language queries while enforcing governance policies. It exposes your Cube.js semantic layer as MCP tools that AI models can use safely.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   AI Assistant  │────▶│     DB-MCP      │────▶│    Cube.js      │
│  (Claude, etc)  │◀────│   MCP Server    │◀────│  Semantic Layer │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │                        │
                               │                        ▼
                               │                ┌─────────────────┐
                               │                │   Data Warehouse │
                               │                │  (Postgres, etc) │
                               │                └─────────────────┘
                               ▼
                        ┌─────────────────┐
                        │ Governance Layer │
                        │  - Query limits  │
                        │  - PII blocking  │
                        │  - Member access │
                        └─────────────────┘
```

## Components

### MCP Server (`/src`)
- **Tools exposed via MCP:**
  - `catalog.search` - Search available measures, dimensions, segments
  - `catalog.describe` - Get details about a specific member
  - `query.semantic` - Execute governed queries against the semantic layer

- **Governance** (`/src/policy`) - Enforces limits, blocks PII, validates members
- **Catalog** (`/src/catalog`) - Indexes Cube metadata with fuzzy search
- **Query** (`/src/query`) - Executes validated queries through Cube.js

### Admin UI (`/admin`)
- **Backend** (`/admin/backend`) - Express API for management
- **Frontend** (`/admin/frontend`) - React admin dashboard with:
  - Database schema browser
  - Governance configuration
  - Query playground
  - AI chat interface (uses MCP tools)

### Cube.js (`/cube`)
- Semantic layer definitions (cubes, measures, dimensions)
- Connects to your data warehouse

## Quick Start

```bash
# Start infrastructure (Postgres, Cube.js)
docker-compose up -d

# Install and build MCP server
npm install
npm run build

# Start admin backend (port 3000)
cd admin/backend && npm install && npm run dev

# Start admin frontend (port 3001)
cd admin/frontend && npm install && npm run dev
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
CUBE_API_URL=http://localhost:4000/cubejs-api/v1
CUBE_JWT_SECRET=your-secret-min-32-chars
MAX_LIMIT=1000
DENY_MEMBERS=Users.email,Users.ssn
```

## MCP Integration

Use with Claude Desktop or any MCP-compatible client:

```json
{
  "mcpServers": {
    "db-mcp": {
      "command": "node",
      "args": ["/path/to/db-mcp/dist/index.js"],
      "env": {
        "CUBE_API_URL": "http://localhost:4000/cubejs-api/v1",
        "CUBE_JWT_SECRET": "your-secret"
      }
    }
  }
}
```

## License

MIT
