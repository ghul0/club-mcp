import { describe, expect, it, vi } from 'vitest';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ok, err, validationError, type GetClient } from '@hhc-mcp/core';
import { createLogger } from '../src/logger.js';
import { createMcpServer, type ServerDeps } from '../src/server.js';
import { listToolDefinitions } from '../src/tools.js';

const silentLogger = createLogger({ writer: () => undefined });

const buildClient = (responses: Record<string, unknown> = {}): GetClient => ({
  get: vi.fn((path: string) => {
    const body = responses[path] ?? responses['*'];
    if (body === undefined) {
      return Promise.resolve(err(validationError('no mock for path ' + path)));
    }
    return Promise.resolve(ok(body));
  }) as unknown as GetClient['get'],
});

const buildDeps = (responses: Record<string, unknown> = {}): ServerDeps => ({
  config: {
    baseUrl: 'https://example.test',
    user: 'u',
    appPass: 'p',
  },
  client: buildClient(responses),
  logger: silentLogger,
});

const callRequestHandler = async <T>(
  mcp: McpServer,
  schema: typeof ListToolsRequestSchema | typeof CallToolRequestSchema,
  request: T,
): Promise<unknown> => {
  const internal = mcp.server as unknown as {
    _requestHandlers: Map<string, (req: unknown, extra: unknown) => Promise<unknown>>;
  };
  const method = (schema as { shape: { method: { value: string } } }).shape.method.value;
  const handler = internal._requestHandlers.get(method);
  if (handler === undefined) {
    throw new Error('handler not registered for method ' + method);
  }
  return handler(request, {
    signal: new AbortController().signal,
    requestId: 1,
    sendNotification: () => Promise.resolve(),
    sendRequest: () => Promise.resolve({}),
  });
};

describe('createMcpServer', () => {
  it('returns an MCP Server instance', () => {
    const server = createMcpServer(buildDeps());
    expect(server).toBeInstanceOf(McpServer);
  });

  it('registers a tools/list handler that returns all tool definitions', async () => {
    const server = createMcpServer(buildDeps());
    const expectedCount = listToolDefinitions().length;
    const response = await callRequestHandler(server, ListToolsRequestSchema, {
      method: 'tools/list',
      params: {},
    });
    const tools = (response as { tools: readonly { name: string; annotations: { readOnlyHint: boolean } }[] }).tools;
    expect(tools).toHaveLength(expectedCount);
    for (const t of tools) {
      expect(t.annotations.readOnlyHint).toBe(true);
    }
  });

  it('registers a tools/call handler that routes to the named operation', async () => {
    const deps = buildDeps({ '/members': { members: [] } });
    const server = createMcpServer(deps);
    const response = await callRequestHandler(server, CallToolRequestSchema, {
      method: 'tools/call',
      params: { name: 'club_search_members', arguments: { query: 'thomas', limit: 1 } },
    });
    const result = response as { isError?: boolean };
    expect(result.isError).toBeUndefined();
    expect(deps.client.get).toHaveBeenCalled();
  });

  it('returns an error envelope when tools/call is invoked with an unknown tool', async () => {
    const server = createMcpServer(buildDeps());
    const response = await callRequestHandler(server, CallToolRequestSchema, {
      method: 'tools/call',
      params: { name: 'club_does_not_exist', arguments: {} },
    });
    const result = response as {
      isError?: boolean;
      structuredContent?: { error?: { code?: string } };
    };
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error?.code).toBe('validation');
  });
});
