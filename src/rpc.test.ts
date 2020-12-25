import { assertEquals } from "https://deno.land/std@0.82.0/testing/asserts.ts";
import { RPC } from "./rpc.ts";
import { VSCodeIO } from "./msg.ts";

const prepare = (
  callback: (args: { server: RPC; client: RPC }) => Promise<void> | void,
) => {
  return async () => {
    const pipe1 = new Deno.Buffer();
    const pipe2 = new Deno.Buffer();

    const client = new RPC({
      io: new VSCodeIO({
        reader: pipe1,
        writer: pipe2,
      }),
    });
    const server = new RPC({
      io: new VSCodeIO({
        reader: pipe2,
        writer: pipe1,
      }),
    });
    client.start();
    server.start();
    await callback({ client, server });
    client.stop();
    server.stop();
  };
};

Deno.test(
  "request success",
  prepare(async ({ client, server }) => {
    server.onRequest("test", (params) => {
      return params;
    });
    assertEquals(await client.request("test", 1), 1);
  }),
);

Deno.test(
  "request failure",
  prepare(async ({ client, server }) => {
    server.onRequest("test", (params) => {
      throw params;
    });
    try {
      await client.request("test", 1);
    } catch (e) {
      assertEquals(e, {
        code: -32603,
        message: "Internal error",
        data: 1,
      });
    }
  }),
);

Deno.test(
  "request not-found",
  prepare(async ({ client}) => {
    try {
      await client.request("test", 1);
    } catch (e) {
      assertEquals(e, {
        code: -32601,
        message: "Method not found",
      });
    }
  }),
);

Deno.test(
  "notification",
  prepare(async ({ client, server }) => {
    const wait = new Promise<void>(resolve => {
      server.onNotification('test', params => {
        assertEquals(params, 1);
        resolve();
      });
    });
    client.notify("test", 1);
    await wait;
  }),
);


Deno.test(
  "complex",
  prepare(async ({ client, server }) => {
    const sequence = [] as string[];
    server.onRequest('test1', async params => {
      sequence.push('server:test1');
      return await server.request('test1', params);
    });
    client.onRequest('test1', async params => {
      sequence.push('client:test1');
      return await client.request('test2', params);
    });
    server.onRequest('test2', async params => {
      sequence.push('server:test2');
      return await server.request('test2', params);
    });
    client.onRequest('test2', async params => {
      sequence.push('client:test2');
      return await client.request('test3', params);
    });
    server.onRequest('test3', async params => {
      sequence.push('server:test3');
      return await params;
    });
    assertEquals(await client.request('test1', 1), 1);
    assertEquals(sequence, [
      'server:test1',
      'client:test1',
      'server:test2',
      'client:test2',
      'server:test3',
    ]);
  }),
);
