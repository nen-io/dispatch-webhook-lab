import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import {
  canonical,
  InputError,
  MAX_BODY_BYTES,
  scenarioStatus,
  validateInput,
} from '../src/domain/policy.ts';
import { Store } from './store.ts';

interface Options {
  path: string;
  port?: number;
  now?: () => number;
  afterDelivery?: () => void;
}
const openPaths = new Set<string>();
function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  });
  res.end(JSON.stringify(data));
}
function readJson(req: IncomingMessage): Promise<unknown> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? ''))
    throw new InputError('Content-Type must be application/json.', 415);
  if (req.headers['content-encoding'])
    throw new InputError('Compressed bodies are not supported.', 415);
  return new Promise((resolve, reject) => {
    let size = 0;
    let failed = false;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        if (!failed) {
          failed = true;
          chunks.length = 0;
          reject(new InputError('Request exceeds 32 KiB.', 413));
        }
        return;
      }
      if (!failed) chunks.push(chunk);
    });
    req.once('end', () => {
      if (failed) return;
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
        resolve(JSON.parse(text));
      } catch {
        reject(new InputError('Request body must be valid UTF-8 JSON.'));
      }
    });
    req.once('error', reject);
    req.once('aborted', () => reject(new InputError('Request aborted.')));
  });
}

/** Start the local lab. Each SQLite file requires one process owner. */
export async function startService(options: Options) {
  if (openPaths.has(options.path)) throw new Error('This process already owns that database.');
  openPaths.add(options.path);
  let store: Store;
  try {
    store = new Store(options.path);
  } catch (error) {
    openPaths.delete(options.path);
    throw error;
  }
  const now = options.now ?? Date.now;
  const token = randomBytes(32).toString('hex');
  let authority = '';
  let processing: Promise<number> | null = null;
  let closing = false;
  async function process() {
    if (processing) return processing;
    processing = (async () => {
      const due = store.due(now());
      for (const event of due) {
        const attempt = store.reserve(event.id, now());
        let status: number;
        try {
          const response = await fetch(`http://${authority}/receiver`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Dispatch-Token': token,
              'X-Dispatch-Attempt': String(attempt.number),
            },
            body: JSON.stringify({ id: event.id, payload: JSON.parse(event.payload) }),
            signal: AbortSignal.timeout(2000),
            redirect: 'error',
          });
          status = response.status;
          await response.text();
        } catch {
          status = 0;
        }
        // Integration-only fault injection demonstrates the acknowledged-but-unrecorded boundary.
        options.afterDelivery?.();
        store.finish(event.id, attempt.number, status, now());
      }
      return due.length;
    })();
    try {
      return await processing;
    } finally {
      processing = null;
    }
  }
  const server = createServer(
    { maxHeaderSize: 8192, requestTimeout: 5000, headersTimeout: 5000 },
    async (req, res) => {
      try {
        if (req.headers.host !== authority || (req.headersDistinct.host?.length ?? 0) !== 1)
          throw new InputError('Unexpected Host.', 403);
        if (req.headers.origin !== undefined || req.headers['sec-fetch-site'] === 'cross-site')
          throw new InputError('Browser-origin requests are not accepted. Use the local CLI.', 403);
        if (closing) throw new InputError('Service is closing.', 503);
        const routes: Record<string, string> = {
          '/health': 'GET',
          '/events': 'GET, POST',
          '/process': 'POST',
          '/receiver': 'POST',
        };
        const allowed = routes[req.url ?? ''];
        if (!allowed) throw new InputError('Route not found.', 404);
        if (!allowed.split(', ').includes(req.method ?? '')) {
          res.setHeader('Allow', allowed);
          throw new InputError('Method not allowed.', 405);
        }
        if (req.url === '/health') {
          send(res, 200, { status: 'ok', scope: 'loopback laboratory' });
          return;
        }
        if (req.url === '/events' && req.method === 'GET') {
          send(res, 200, { events: store.list() });
          return;
        }
        const body = await readJson(req);
        if (req.url === '/events') {
          const result = store.enqueue(body, now());
          send(res, result.duplicate ? 200 : 201, result);
          return;
        }
        if (req.url === '/process') {
          if (
            !body ||
            typeof body !== 'object' ||
            Array.isArray(body) ||
            Object.keys(body).length !== 0
          )
            throw new InputError('Process body must be {}.');
          send(res, 200, { processed: await process(), events: store.list() });
          return;
        }
        if (req.headers['x-dispatch-token'] !== token)
          throw new InputError('Internal receiver token required.', 403);
        const input = validateInput(body);
        const event = store.get(input.id);
        const number = Number(req.headers['x-dispatch-attempt']);
        if (!event || !Number.isInteger(number) || number < 1 || number > 4)
          throw new InputError('Invalid delivery reservation.');
        const attempt = store
          .attempts(input.id)
          .find((item) => item.number === number && item.status === null);
        if (!attempt || event.payload !== canonical(input.payload))
          throw new InputError('Delivery does not match reservation.', 409);
        const status = scenarioStatus(input.payload, number);
        if (status !== 200) {
          send(res, status, { received: false, reason: 'Configured synthetic receiver response' });
          return;
        }
        const applied = store.receive(input.id, input.payload, now());
        send(res, 200, { received: true, applied, effects: store.effectCount(input.id) });
      } catch (error) {
        req.resume();
        if (!res.headersSent)
          send(res, error instanceof InputError ? error.status : 500, {
            error: error instanceof InputError ? error.message : 'Internal processing error.',
          });
      }
    },
  );
  server.maxHeadersCount = 32;
  server.maxConnections = 32;
  server.setTimeout(5000, (socket) => socket.destroy());
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port ?? 0, '127.0.0.1', resolve);
    });
  } catch (error) {
    store.close();
    openPaths.delete(options.path);
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address.');
  authority = `127.0.0.1:${address.port}`;
  return {
    url: `http://${authority}`,
    async close() {
      // Let a running delivery finish while its internal receiver still accepts requests.
      try {
        await processing;
      } catch {
        /* Failed work remains durably pending for restart. */
      }
      closing = true;
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      store.close();
      openPaths.delete(options.path);
    },
  };
}
