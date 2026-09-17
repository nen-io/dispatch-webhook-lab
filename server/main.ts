import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startService } from './service.ts';
await mkdir('data', { recursive: true });
const service = await startService({ path: resolve('data/dispatch.sqlite'), port: 4403 });
console.log(
  `Dispatch laboratory listening at ${service.url}. Browser UI is a separate simulation.`,
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await service.close();
}
process.once('SIGINT', () => {
  void stop();
});
process.once('SIGTERM', () => {
  void stop();
});
