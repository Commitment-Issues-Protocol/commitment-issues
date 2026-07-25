import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import type { Intercept } from '../../src/agent/socket.ts';
import { SocketProxy } from '../../src/agent/socket.ts';

/**
 * Wait for a single emission of an event on an emitter
 * @param emitter - event emitter to listen on
 * @param event - event name to wait for
 * @returns promise that resolves once the event fires
 */
function waitForEvent(
  emitter: net.Server | net.Socket,
  event: string,
): Promise<void> {
  return new Promise((resolve) => {
    emitter.once(event, () => {
      resolve();
    });
  });
}

/**
 * Wait for a single 'data' event on a socket and return its payload
 * @param socket - socket to read from
 * @returns promise that resolves with the received data
 */
function waitForData(socket: net.Socket): Promise<Buffer> {
  return new Promise((resolve) => {
    socket.once('data', (data: Buffer) => {
      resolve(data);
    });
  });
}

void describe('agent/socket', () => {
  let dir: string;
  let proxyPath: string;
  let upstreamPath: string;
  let upstreamServer: net.Server;
  let upstreamReceived: string[];
  let socketProxy: SocketProxy;
  let client: net.Socket;

  beforeEach(async () => {
    // Create tmp dir and socket paths for testing
    dir = mkdtempSync(path.join('/tmp', tmpdir()));
    proxyPath = path.join(dir, 'proxy.sock');
    upstreamPath = path.join(dir, 'upstream.sock');

    // Create upstream socket that doubles the number it receives
    upstreamReceived = [];
    upstreamServer = net.createServer((connection) => {
      connection.on('data', (data: Buffer) => {
        upstreamReceived.push(data.toString('ascii'));
        connection.write((parseInt(data.toString('ascii')) * 2).toString(10));
      });
    });
    upstreamServer.listen(upstreamPath);
    await waitForEvent(upstreamServer, 'listening');

    // Create proxy to upstream
    socketProxy = new SocketProxy(proxyPath, upstreamPath);
    await waitForEvent(socketProxy.socket, 'listening');

    // Create client
    client = net.createConnection(proxyPath);
    await waitForEvent(client, 'connect');
  });

  afterEach(() => {
    // Cleanup client, proxy, upstream server, and delete tmp dir
    client.destroy();
    upstreamServer.close();
    socketProxy.close();
    rmSync(dir, { recursive: true, force: true });
  });

  void it('forwards data unchanged between client and upstream', async () => {
    // Write ping
    client.write('1');

    // Check response
    assert.equal((await waitForData(client)).toString(), '2');
  });

  void it('runs data through the intercept callback in each direction', async () => {
    // Add 1 to the number in the request direction
    const interceptDoubleRequest: Intercept = (data, direction) => {
      if (direction === 'request') {
        return Buffer.from((parseInt(data.toString('ascii')) + 1).toString(10));
      }
      return data;
    };

    // Check request intercept
    socketProxy.intercept = interceptDoubleRequest;
    client.write('10');
    assert.equal((await waitForData(client)).toString(), '22');

    // Add 1 to the number in the response direction
    const interceptDoubleResponse: Intercept = (data, direction) => {
      if (direction === 'response') {
        return Buffer.from((parseInt(data.toString('ascii')) + 1).toString(10));
      }
      return data;
    };

    // Check response intercept
    socketProxy.intercept = interceptDoubleResponse;
    client.write('10');
    assert.equal((await waitForData(client)).toString(), '21');
  });

  void it('allows the intercept to respond directly and swallow the request', async () => {
    // Answer request-direction data directly, never forwarding it upstream
    const interceptRespondDirectly: Intercept = (data, direction, context) => {
      if (direction === 'request') {
        context.respond(Buffer.from('42'));
        return null;
      }
      return data;
    };

    socketProxy.intercept = interceptRespondDirectly;
    client.write('10');
    assert.equal((await waitForData(client)).toString(), '42');

    // Upstream should never have seen the swallowed request
    assert.deepEqual(upstreamReceived, []);
  });
});
