import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ok, err, upstreamNotFound, type GetClient } from '@hhc-mcp/core';
import { createLogger } from '../src/logger.js';
import { createMcpServer, type ServerDeps } from '../src/server.js';

const silentLogger = createLogger({ writer: () => undefined });

type Harness = {
  readonly client: Client;
  readonly mockGet: ReturnType<typeof vi.fn>;
  readonly cleanup: () => Promise<void>;
};

const makeHarness = async (
  mockGet: ReturnType<typeof vi.fn>,
): Promise<Harness> => {
  const mockClient = { get: mockGet } as unknown as GetClient;
  const deps: ServerDeps = {
    config: {
      baseUrl: 'https://example.test',
      user: 'u',
      appPass: 'p',
    },
    client: mockClient,
    logger: silentLogger,
  };

  const server = createMcpServer(deps);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client(
    { name: 'hhc-mcp-test-client', version: '0.0.0' },
    { capabilities: {} },
  );

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  const cleanup = async (): Promise<void> => {
    await client.close();
    await server.close();
  };

  return { client, mockGet, cleanup };
};

describe('tools/call e2e smoke (in-memory transport)', () => {
  let harness: Harness | undefined;

  beforeEach(() => {
    harness = undefined;
  });

  afterEach(async () => {
    if (harness !== undefined) {
      await harness.cleanup();
      harness = undefined;
    }
  });

  it('client.callTool(club_search_members) routes to searchMembers and returns parsed result', async () => {
    const mockGet = vi.fn().mockResolvedValue(
      ok({
        members: [
          {
            user_id: 1,
            username: 'alice',
            display_name: 'Alice',
          },
        ],
      }),
    );
    harness = await makeHarness(mockGet);

    const response = await harness.client.callTool({
      name: 'club_search_members',
      arguments: { query: 'alice' },
    });

    expect(response.isError).toBeUndefined();
    expect(mockGet).toHaveBeenCalledTimes(1);
    const firstCall = mockGet.mock.calls[0] as readonly unknown[];
    expect(firstCall[0]).toBe('/members');

    const content = response.content as ReadonlyArray<{ type: string; text: string }>;
    expect(content.length).toBeGreaterThan(0);
    expect(content[0]?.type).toBe('text');

    const structured = response.structuredContent as
      | { result?: { members?: ReadonlyArray<{ username?: string }> } }
      | undefined;
    expect(structured?.result?.members?.[0]?.username).toBe('alice');
  });

  it('client.callTool(unknown_tool) returns isError with validation envelope', async () => {
    const mockGet = vi.fn();
    harness = await makeHarness(mockGet);

    const response = await harness.client.callTool({
      name: 'club_does_not_exist',
      arguments: {},
    });

    expect(response.isError).toBe(true);
    const structured = response.structuredContent as
      | { error?: { code?: string; retryable?: boolean } }
      | undefined;
    expect(structured?.error?.code).toBe('validation');
    expect(structured?.error?.retryable).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('client.callTool with invalid args returns isError (validation)', async () => {
    const mockGet = vi.fn();
    harness = await makeHarness(mockGet);

    const response = await harness.client.callTool({
      name: 'club_search_members',
      arguments: { query: '' },
    });

    expect(response.isError).toBe(true);
    const structured = response.structuredContent as
      | { error?: { code?: string } }
      | undefined;
    expect(structured?.error?.code).toBe('validation');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('client.callTool propagates upstream errors (e.g. 404)', async () => {
    const mockGet = vi
      .fn()
      .mockResolvedValue(err(upstreamNotFound('upstream returned 404')));
    harness = await makeHarness(mockGet);

    const response = await harness.client.callTool({
      name: 'club_get_feed',
      arguments: { feed_id: 999 },
    });

    expect(response.isError).toBe(true);
    const structured = response.structuredContent as
      | { error?: { code?: string; retryable?: boolean } }
      | undefined;
    expect(structured?.error?.code).toBe('upstream_not_found');
    expect(structured?.error?.retryable).toBe(false);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('client.listTools returns 13 tools through the transport', async () => {
    const mockGet = vi.fn();
    harness = await makeHarness(mockGet);

    const response = await harness.client.listTools();

    expect(response.tools).toHaveLength(13);
    for (const tool of response.tools) {
      expect(tool.name.startsWith('club_')).toBe(true);
      expect(tool.description?.length ?? 0).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeTypeOf('object');
    }
    expect(mockGet).not.toHaveBeenCalled();
  });
});
