import { chmodSync, existsSync, unlinkSync } from 'node:fs';
import net from 'node:net';
/**
 * Proxies unix socket data with optional intercept
 */
class SocketProxy {
    upstreamPath;
    socket;
    /**
     * (Optional) intercept function for data stream
     */
    intercept;
    /**
     * Create Socket Proxy
     * @param path - local socket path
     * @param upstreamPath - proxy target path; omit to run standalone with no
     * upstream agent, relying entirely on the intercept to answer every message
     */
    constructor(path, upstreamPath) {
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
    onConnect(client) {
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
    forwardStandalone(client) {
        client.on('data', (data) => {
            if (!this.intercept) {
                client.destroy();
                return;
            }
            client.pause();
            const context = {
                respond: (response) => {
                    client.write(response);
                },
            };
            void Promise.resolve(this.intercept(data, 'request', context))
                .then(() => {
                client.resume();
            })
                .catch((error) => {
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
    forward(source, target, direction) {
        source.on('data', (data) => {
            // If no intercept, just pass data through
            if (!this.intercept) {
                target.write(data);
                return;
            }
            // Pause source to avoid race condition data ordering issues
            source.pause();
            // Allow interceptor to respond directly to requests
            const context = {
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
                .catch((error) => {
                console.error('intercept error:', error);
                source.destroy();
                target.destroy();
            });
        });
    }
    /**
     * Wind down the proxy
     */
    close() {
        this.socket.close();
    }
}
export { SocketProxy };
