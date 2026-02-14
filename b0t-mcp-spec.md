# b0t MCP Server — Technical Spec & Implementation Guide

## Overview

This document is a complete specification for building a secure MCP (Model Context Protocol) server that connects Claude Code to a production b0t instance. The MCP server runs locally on each user's machine and communicates with the b0t production API over HTTPS.

**Production instance:** `https://b0t-production-a8bd.up.railway.app`
**Git repo:** `https://github.com/colinwallmedia/b0t`

---

## Architecture

```
┌─────────────────────┐     HTTPS/API Key     ┌──────────────────────────┐
│   User's Machine    │ ────────────────────►  │   b0t Production         │
│                     │                        │   (Railway)              │
│  ┌───────────────┐  │                        │                          │
│  │  Claude Code  │  │                        │  ┌────────────────────┐  │
│  │               │  │                        │  │  API Key Auth      │  │
│  │  ┌─────────┐  │  │                        │  │  Middleware         │  │
│  │  │ b0t MCP │──│──│── Bearer Token ───────►│  ├────────────────────┤  │
│  │  │ Server  │  │  │                        │  │  /api/external/*   │  │
│  │  └─────────┘  │  │                        │  │  (New API routes)  │  │
│  │               │  │                        │  ├────────────────────┤  │
│  └───────────────┘  │                        │  │  PostgreSQL        │  │
│                     │                        │  │  Redis / BullMQ    │  │
│  API key stored in  │                        │  │  Workflow Engine    │  │
│  local env only     │                        │  └────────────────────┘  │
└─────────────────────┘                        └──────────────────────────┘
```

**Security model:**
- MCP runs locally — credentials never leave the user's machine
- All communication over HTTPS (Railway provides TLS)
- API keys issued per-user with scoped permissions
- Audit logging on every API call
- Keys are revocable from the b0t admin panel
- Rate limiting per API key

---

## Part 1: API Key System (Add to b0t)

This is the foundation. Before the MCP can talk to production, b0t needs an external API authentication system.

### 1.1 Database Schema

Add a new table for API keys. This goes alongside your existing Drizzle schema.

**File: `src/db/schema/api-keys.ts`**

```typescript
import { pgTable, text, timestamp, boolean, jsonb, uuid } from 'drizzle-orm/pg-core';

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),                    // e.g. "Colin's Claude Code"
  keyHash: text('key_hash').notNull().unique(),     // SHA-256 hash of the key
  keyPrefix: text('key_prefix').notNull(),          // First 8 chars for identification
  userId: text('user_id').notNull(),                // Owner of this key
  permissions: jsonb('permissions').notNull().$type<ApiKeyPermissions>(),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),               // Optional expiry
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  revokedAt: timestamp('revoked_at'),
});

export type ApiKeyPermissions = {
  workflows: {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
    execute: boolean;
  };
  modules: {
    read: boolean;        // List available modules
  };
  credentials: {
    read: boolean;        // List credential names (not values)
    create: boolean;
    delete: boolean;
  };
  clients: {
    read: boolean;
    create: boolean;
    update: boolean;
  };
};
```

### 1.2 API Key Generation

**File: `src/lib/api-keys.ts`**

```typescript
import { randomBytes, createHash } from 'crypto';

const API_KEY_PREFIX = 'b0t_';

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const rawKey = randomBytes(32).toString('base64url');
  const key = `${API_KEY_PREFIX}${rawKey}`;
  const hash = createHash('sha256').update(key).digest('hex');
  const prefix = key.substring(0, 12);  // "b0t_XXXXXXXX" for identification
  return { key, hash, prefix };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
```

### 1.3 Auth Middleware

**File: `src/middleware/api-key-auth.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { apiKeys } from '@/db/schema/api-keys';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { hashApiKey } from '@/lib/api-keys';

export async function validateApiKey(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader?.startsWith('Bearer b0t_')) {
    return { error: 'Missing or invalid API key', status: 401 };
  }

  const key = authHeader.replace('Bearer ', '');
  const keyHash = hashApiKey(key);

  const [apiKey] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.keyHash, keyHash),
        eq(apiKeys.isActive, true),
        isNull(apiKeys.revokedAt)
      )
    )
    .limit(1);

  if (!apiKey) {
    return { error: 'Invalid or revoked API key', status: 401 };
  }

  // Check expiry
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return { error: 'API key has expired', status: 401 };
  }

  // Update last used timestamp (non-blocking)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKey.id))
    .execute()
    .catch(() => {}); // Don't fail the request if this fails

  return { apiKey, userId: apiKey.userId, permissions: apiKey.permissions };
}

export function checkPermission(
  permissions: ApiKeyPermissions,
  resource: string,
  action: string
): boolean {
  const resourcePerms = permissions[resource as keyof ApiKeyPermissions];
  if (!resourcePerms) return false;
  return (resourcePerms as any)[action] === true;
}
```

### 1.4 Audit Logging

**File: `src/db/schema/api-audit-log.ts`**

```typescript
import { pgTable, text, timestamp, jsonb, uuid } from 'drizzle-orm/pg-core';

export const apiAuditLog = pgTable('api_audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  apiKeyId: uuid('api_key_id').notNull(),
  userId: text('user_id').notNull(),
  action: text('action').notNull(),           // e.g. "workflows.create"
  resource: text('resource'),                  // e.g. workflow ID
  requestMethod: text('request_method'),
  requestPath: text('request_path'),
  responseStatus: text('response_status'),
  metadata: jsonb('metadata'),                 // Additional context
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### 1.5 External API Routes

Create a new set of API routes specifically for external/MCP access. These all require API key auth.

**Route structure:**
```
src/app/api/external/
├── workflows/
│   ├── route.ts              # GET (list) / POST (create)
│   └── [id]/
│       ├── route.ts          # GET / PUT / DELETE
│       └── execute/
│           └── route.ts      # POST (run workflow)
├── modules/
│   └── route.ts              # GET (list available modules)
├── credentials/
│   └── route.ts              # GET (list names) / POST (create)
├── clients/
│   └── route.ts              # GET / POST
├── activity/
│   └── route.ts              # GET (execution history)
└── health/
    └── route.ts              # GET (no auth required)
```

**Example route — `src/app/api/external/workflows/route.ts`:**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, checkPermission } from '@/middleware/api-key-auth';
import { logAuditEvent } from '@/lib/audit';

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!checkPermission(auth.permissions, 'workflows', 'read')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  // Use existing workflow listing logic from your internal routes
  // Import from your existing service layer
  const workflows = await getWorkflowsForUser(auth.userId);

  await logAuditEvent({
    apiKeyId: auth.apiKey.id,
    userId: auth.userId,
    action: 'workflows.list',
    requestMethod: 'GET',
    requestPath: '/api/external/workflows',
    responseStatus: '200',
  });

  return NextResponse.json({ workflows });
}

export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!checkPermission(auth.permissions, 'workflows', 'create')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const body = await request.json();

  // Validate and create workflow using existing logic
  const workflow = await createWorkflow({
    ...body,
    userId: auth.userId,
  });

  await logAuditEvent({
    apiKeyId: auth.apiKey.id,
    userId: auth.userId,
    action: 'workflows.create',
    resource: workflow.id,
    requestMethod: 'POST',
    requestPath: '/api/external/workflows',
    responseStatus: '201',
    metadata: { workflowName: body.name },
  });

  return NextResponse.json({ workflow }, { status: 201 });
}
```

### 1.6 Admin Panel — API Key Management

Add a new section to the b0t admin panel (Settings > API Keys) where users can:

- Generate new API keys (show the key ONCE, then only the prefix)
- Set permissions per key
- Set optional expiry dates
- View last used timestamp
- Revoke keys
- View audit log

---

## Part 2: MCP Server (npm Package)

### 2.1 Package Structure

```
b0t-mcp-server/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts              # Entry point, MCP server setup
│   ├── client.ts             # HTTP client for b0t API
│   ├── tools/
│   │   ├── workflows.ts      # Workflow CRUD + execute tools
│   │   ├── modules.ts        # Module listing tools
│   │   ├── credentials.ts    # Credential management tools
│   │   ├── clients.ts        # Client management tools
│   │   └── activity.ts       # Execution history tools
│   └── types.ts              # Shared types
└── bin/
    └── b0t-mcp.js            # CLI entry point
```

### 2.2 Package.json

```json
{
  "name": "b0t-mcp-server",
  "version": "1.0.0",
  "description": "MCP server for connecting Claude Code to b0t workflow automation",
  "bin": {
    "b0t-mcp-server": "./dist/bin/b0t-mcp.js"
  },
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tsx": "^4.0.0"
  },
  "keywords": ["mcp", "b0t", "workflow", "automation", "claude"],
  "license": "AGPL-3.0"
}
```

### 2.3 MCP Tools Specification

These are the tools that Claude Code will see and use:

#### Workflow Tools

| Tool | Description | Permissions |
|------|-------------|-------------|
| `list_workflows` | List all workflows with status, trigger type, last run | workflows.read |
| `get_workflow` | Get full workflow details including steps and config | workflows.read |
| `create_workflow` | Create a new workflow from a JSON definition | workflows.create |
| `update_workflow` | Update an existing workflow | workflows.update |
| `delete_workflow` | Delete a workflow | workflows.delete |
| `execute_workflow` | Run a workflow and return results | workflows.execute |
| `get_workflow_status` | Check status of a running workflow execution | workflows.read |

#### Module Tools

| Tool | Description | Permissions |
|------|-------------|-------------|
| `list_modules` | List all available modules (140+) with their functions | modules.read |
| `get_module_details` | Get detailed info on a specific module's functions, params, examples | modules.read |
| `search_modules` | Search modules by keyword/capability | modules.read |

#### Credential Tools

| Tool | Description | Permissions |
|------|-------------|-------------|
| `list_credentials` | List stored credential names and types (never values) | credentials.read |
| `create_credential` | Store a new API key/credential (encrypted at rest) | credentials.create |
| `delete_credential` | Remove a stored credential | credentials.delete |

#### Activity Tools

| Tool | Description | Permissions |
|------|-------------|-------------|
| `get_execution_history` | View past workflow executions with results | workflows.read |
| `get_execution_details` | Get detailed step-by-step results of a specific run | workflows.read |

### 2.4 Core MCP Server Implementation

**File: `src/index.ts`**

```typescript
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/sdk/server';
import { B0tClient } from './client';
import { registerWorkflowTools } from './tools/workflows';
import { registerModuleTools } from './tools/modules';
import { registerCredentialTools } from './tools/credentials';
import { registerActivityTools } from './tools/activity';

const B0T_URL = process.env.B0T_URL;
const B0T_API_KEY = process.env.B0T_API_KEY;

if (!B0T_URL || !B0T_API_KEY) {
  console.error('Missing required environment variables: B0T_URL and B0T_API_KEY');
  console.error('');
  console.error('Configure in your Claude Code settings:');
  console.error('  B0T_URL=https://your-b0t-instance.railway.app');
  console.error('  B0T_API_KEY=b0t_your_api_key_here');
  process.exit(1);
}

const client = new B0tClient(B0T_URL, B0T_API_KEY);

const server = new McpServer({
  name: 'b0t',
  version: '1.0.0',
  description: 'Workflow automation — describe what you want and it happens.',
});

// Register all tool groups
registerWorkflowTools(server, client);
registerModuleTools(server, client);
registerCredentialTools(server, client);
registerActivityTools(server, client);

// Health check on startup
async function main() {
  const healthy = await client.healthCheck();
  if (!healthy) {
    console.error(`Cannot connect to b0t at ${B0T_URL}`);
    console.error('Check your B0T_URL and network connection.');
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`b0t MCP server connected to ${B0T_URL}`);
}

main().catch(console.error);
```

**File: `src/client.ts`**

```typescript
export class B0tClient {
  constructor(
    private baseUrl: string,
    private apiKey: string
  ) {}

  private async request(path: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}/api/external${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`b0t API error (${response.status}): ${error.error || response.statusText}`);
    }

    return response.json();
  }

  async healthCheck(): Promise<boolean> {
    try {
      await fetch(`${this.baseUrl}/api/external/health`);
      return true;
    } catch {
      return false;
    }
  }

  // Workflows
  async listWorkflows() { return this.request('/workflows'); }
  async getWorkflow(id: string) { return this.request(`/workflows/${id}`); }
  async createWorkflow(data: any) {
    return this.request('/workflows', { method: 'POST', body: JSON.stringify(data) });
  }
  async updateWorkflow(id: string, data: any) {
    return this.request(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }
  async deleteWorkflow(id: string) {
    return this.request(`/workflows/${id}`, { method: 'DELETE' });
  }
  async executeWorkflow(id: string, params?: any) {
    return this.request(`/workflows/${id}/execute`, {
      method: 'POST',
      body: JSON.stringify(params || {}),
    });
  }

  // Modules
  async listModules() { return this.request('/modules'); }
  async getModuleDetails(name: string) { return this.request(`/modules/${name}`); }
  async searchModules(query: string) { return this.request(`/modules?search=${encodeURIComponent(query)}`); }

  // Credentials
  async listCredentials() { return this.request('/credentials'); }
  async createCredential(data: any) {
    return this.request('/credentials', { method: 'POST', body: JSON.stringify(data) });
  }
  async deleteCredential(id: string) {
    return this.request(`/credentials/${id}`, { method: 'DELETE' });
  }

  // Activity
  async getExecutionHistory(limit = 20) { return this.request(`/activity?limit=${limit}`); }
  async getExecutionDetails(id: string) { return this.request(`/activity/${id}`); }
}
```

**File: `src/tools/workflows.ts`** (example tool registration)

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server';
import { z } from 'zod';
import { B0tClient } from '../client';

export function registerWorkflowTools(server: McpServer, client: B0tClient) {

  server.tool(
    'list_workflows',
    'List all workflows with their status, trigger type, and last run time',
    {},
    async () => {
      const data = await client.listWorkflows();
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'create_workflow',
    'Create a new workflow automation. Provide a name, description, trigger type, and the workflow steps as a JSON array.',
    {
      name: z.string().describe('Name of the workflow'),
      description: z.string().describe('What this workflow does'),
      trigger: z.enum(['manual', 'schedule', 'webhook', 'chat']).describe('How the workflow is triggered'),
      schedule: z.string().optional().describe('Cron expression if trigger is schedule'),
      steps: z.array(z.object({
        module: z.string().describe('Module name (e.g. "social/reddit", "ai/openai")'),
        function: z.string().describe('Function name within the module'),
        params: z.record(z.any()).describe('Parameters for the function'),
      })).describe('Ordered list of workflow steps'),
    },
    async (params) => {
      const data = await client.createWorkflow(params);
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'execute_workflow',
    'Execute/run a workflow by its ID and return the results',
    {
      workflowId: z.string().describe('The workflow ID to execute'),
      params: z.record(z.any()).optional().describe('Optional runtime parameters'),
    },
    async ({ workflowId, params }) => {
      const data = await client.executeWorkflow(workflowId, params);
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ... similar for get, update, delete, status
}
```

### 2.5 User Configuration

Users add this to their Claude Code config (`~/.claude/config.json` or project `.claude/config.json`):

```json
{
  "mcpServers": {
    "b0t": {
      "command": "npx",
      "args": ["-y", "b0t-mcp-server"],
      "env": {
        "B0T_URL": "https://b0t-production-a8bd.up.railway.app",
        "B0T_API_KEY": "b0t_xxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

---

## Part 3: Implementation Order

### Phase 1 — API Key System (b0t side)
Use Claude Code in your local b0t repo to implement:

1. Database schema for `api_keys` and `api_audit_log` tables
2. Drizzle migration
3. API key generation and hashing utilities
4. Auth middleware for external routes
5. External API routes (`/api/external/*`) that wrap your existing internal logic
6. Admin panel UI for managing API keys
7. Health check endpoint (no auth)

**Claude Code prompt for Phase 1:**
```
I need to add an external API system to b0t so that MCP clients can
connect securely. Here's what I need:

1. A new Drizzle schema for API keys (with hashed keys, permissions,
   expiry, audit logging)
2. Middleware that validates Bearer token API keys on incoming requests
3. A new set of routes at /api/external/* that expose workflow CRUD,
   module listing, credential management, and execution history
4. These routes should reuse the existing internal service logic but
   authenticate via API key instead of NextAuth session
5. An admin panel page at /settings/api-keys for generating and
   managing keys
6. A health check endpoint at /api/external/health (no auth)

The API key format should be: b0t_ followed by 32 bytes base64url.
Only the SHA-256 hash is stored in the database. Permissions are
scoped per resource (workflows, modules, credentials, clients) and
per action (create, read, update, delete, execute).

Every API call should be audit logged with the key ID, action,
resource, and timestamp.
```

### Phase 2 — MCP Server Package
After Phase 1 is deployed to Railway:

1. Create the `b0t-mcp-server` npm package
2. Implement the HTTP client
3. Register all MCP tools
4. Add connection validation on startup
5. Test against your production instance
6. Publish to npm

**Claude Code prompt for Phase 2:**
```
Create a new npm package called b0t-mcp-server that implements an
MCP server for connecting Claude Code to a remote b0t instance.

It should read B0T_URL and B0T_API_KEY from environment variables,
validate the connection on startup, and expose these MCP tools:

Workflow tools: list, get, create, update, delete, execute, status
Module tools: list, get details, search
Credential tools: list (names only), create, delete
Activity tools: execution history, execution details

Use @modelcontextprotocol/sdk for the MCP implementation.
All tools should call the b0t /api/external/* endpoints with
Bearer token auth.

The package should be runnable via npx b0t-mcp-server.
```

### Phase 3 — Documentation & Commercialisation
1. README with setup instructions
2. User guide: "How to connect Claude Code to b0t"
3. API key management docs
4. Pricing/access model for API keys

---

## Security Checklist

- [ ] API keys are SHA-256 hashed before storage (plain key shown once)
- [ ] All external routes require valid, non-expired, non-revoked API key
- [ ] Permissions are checked per-route, per-action
- [ ] Credential values are NEVER returned via the external API (names/types only)
- [ ] All API calls are audit logged
- [ ] Rate limiting per API key (recommend: 100 req/min)
- [ ] HTTPS enforced (Railway handles TLS)
- [ ] API keys have optional expiry dates
- [ ] Keys are revocable immediately from admin panel
- [ ] Health check endpoint requires no auth
- [ ] CORS restricted to prevent browser-based abuse
- [ ] Input validation on all external route payloads

---

## User Flow (End to End)

1. **Admin** logs into b0t dashboard → Settings → API Keys
2. **Admin** clicks "Generate API Key", sets permissions, gets key (shown once)
3. **Admin** sends key to user (or user generates their own if they have an account)
4. **User** adds MCP config to their Claude Code setup
5. **User** opens Claude Code and says: *"Create a workflow that monitors Reddit r/singularity and sends me the top posts on Slack every morning"*
6. **Claude Code** uses the `search_modules` tool to find reddit and slack modules
7. **Claude Code** uses `list_credentials` to check if Reddit/Slack creds exist
8. **Claude Code** uses `create_workflow` with the right module functions and params
9. **Workflow** appears in the b0t dashboard, ready to run
10. **User** says *"Run it now to test"* → Claude Code calls `execute_workflow`
11. **Results** come back in Claude Code's response

---

## Notes

- The MCP server is stateless — all state lives in b0t's PostgreSQL database
- Module registry information (the 900+ functions) should be served from the b0t API, not hardcoded in the MCP
- Consider adding a `describe_intent` tool that takes a natural language description and returns which modules/functions would be needed (leveraging b0t's existing AI workflow generation logic)
- For commercialisation: API keys can be tied to billing tiers (free = 100 executions/month, pro = unlimited, etc.)
