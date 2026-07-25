import { chmodSync, existsSync, unlinkSync } from 'node:fs';
import net from 'node:net';

/**
 * Direction data is flowing through the proxy
 */
type InterceptDirection = 'request' | 'response';

/**
 * Callback used to inspect and rewrite data as it passes through the proxy
 * @param data - raw data chunk read from the source socket
 * @param direction - direction the data is flowing
 * @returns the data to forward to the destination socket
 */
type Intercept = (
  data: Buffer,
  direction: InterceptDirection,
) => Buffer | Promise<Buffer>;

/**
 * Proxies unix socket data with optional intercept
 */
class SocketProxy {
  upstreamPath: string;
  socket: net.Server;

  /**
   * (Optional) intercept function for data stream
   */
  intercept?: Intercept | undefined;

  /**
   * Create Socket Proxy
   * @param path - local socket path
   * @param upstreamPath - proxy target path
   */
  constructor(path: string, upstreamPath: string) {
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

      // Pass the data through intercept, writing the output
      // Promise.resolve to handle both sync and async
      void Promise.resolve(this.intercept(data, direction)).then(
        (transformed) => {
          target.write(transformed);
          source.resume();
        },
      );
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
export type { Intercept, InterceptDirection };
