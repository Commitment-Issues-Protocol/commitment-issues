import { chmodSync, existsSync, unlinkSync } from 'node:fs';
import net from 'node:net';

/**
 * Direction data is flowing through the proxy
 */
type InterceptDirection = 'request' | 'response';

/**
 * Context passed to an intercept callback for the current chunk
 */
type InterceptContext = {
  /**
   * Write data directly back to whichever side sent the current chunk,
   * bypassing the other side of the proxied connection entirely
   * @param data - data to write back to the sender
   */
  respond: (data: Buffer) => void;
};

/**
 * Callback used to inspect and rewrite data as it passes through the proxy.
 * Returning null swallows the chunk (nothing is forwarded to the other
 * side) -- typically paired with context.respond to answer the sender directly.
 * @param data - raw data chunk read from the source socket
 * @param direction - direction the data is flowing
 * @param context - helpers for the current chunk, e.g. responding directly to the sender
 * @returns the data to forward to the destination socket, or null to forward nothing
 */
type Intercept = (
  data: Buffer,
  direction: InterceptDirection,
  context: InterceptContext,
) => Buffer | null | Promise<Buffer | null>;

/**
 * Proxies unix socket data with optional intercept
 */
class SocketProxy {
  upstreamPath: string | undefined;
  socket: net.Server;

  /**
   * (Optional) intercept function for data stream
   */
  intercept?: Intercept | undefined;

  /**
   * Create Socket Proxy
   * @param path - local socket path
   * @param upstreamPath - proxy target path; omit to run standalone with no
   * upstream agent, relying entirely on the intercept to answer every message
   */
  constructor(path: string, upstreamPath?: string) {
    // Override target path if exists
    if (existsSync(path)) {
      unlinkSync(path);
    }

    this.upstreamPath = upstreamPath;

    // Handler for new client connections
    this.socket = net.createServer(this.onConnect.bind(this));

    // Listen with 600 permissions (only owner can read/write)
    this.socket.listen(path, () => {
      chmodSync(path, 0o600);
    });
  }

  /**
   * Handle new client connection
   * @param client - client connection socket
   */
  private onConnect(client: net.Socket) {
    // With no upstream, the intercept must answer every message itself
    if (!this.upstreamPath) {
      this.forwardStandalone(client);
      return;
    }

    // Connect to upstream (seperate connection per client)
    const upstream = net.createConnection(this.upstreamPath);

    // Pass data in both directions through forward
    this.forward(client, upstream, 'request');
    this.forward(upstream, client, 'response');

    // Ensure the other side is cleaned up if client/upstream errors/closes
    client.on('error', () => {
      upstream.destroy();
    });
    client.on('close', () => {
      upstream.destroy();
    });
    upstream.on('error', () => {
      client.destroy();
    });
    upstream.on('close', () => {
      client.destroy();
    });
  }

  /**
   * Handle a client connection with no upstream agent to forward to; the
   * intercept is responsible for answering every message via context.respond
   * @param client - client connection socket
   */
  private forwardStandalone(client: net.Socket): void {
    client.on('data', (data: Buffer) => {
      if (!this.intercept) {
        client.destroy();
        return;
      }

      client.pause();

      const context: InterceptContext = {
        respond: (response) => {
          client.write(response);
        },
      };

      void Promise.resolve(this.intercept(data, 'request', context))
        .then(() => {
          client.resume();
        })
        .catch((error: unknown) => {
          console.error('intercept error:', error);
          client.destroy();
        });
    });
  }

  /**
   * Forward data from source to target, running it through the intercept callback if set
   * @param source - socket to read data from
   * @param target - socket to write data to
   * @param direction - direction data is flowing, passed to the intercept callback
   */
  private forward(
    source: net.Socket,
    target: net.Socket,
    direction: InterceptDirection,
  ): void {
    source.on('data', (data: Buffer) => {
      // If no intercept, just pass data through
      if (!this.intercept) {
        target.write(data);
        return;
      }

      // Pause source to avoid race condition data ordering issues
      source.pause();

      // Allow interceptor to respond directly to requests
      const context: InterceptContext = {
        respond: (response) => {
          source.write(response);
        },
      };

      // Pass the data through intercept, writing the output
      // Promise.resolve to handle both sync and async
      void Promise.resolve(this.intercept(data, direction, context))
        .then((transformed) => {
          if (transformed) {
            target.write(transformed);
          }
          source.resume();
        })
        .catch((error: unknown) => {
          console.error('intercept error:', error);
          source.destroy();
          target.destroy();
        });
    });
  }

  /**
   * Wind down the proxy
   */
  close(): void {
    this.socket.close();
  }
}

export { SocketProxy };
export type { Intercept, InterceptContext, InterceptDirection };
