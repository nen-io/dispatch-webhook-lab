import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { request } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { startService } from '../server/service';
import { MAX_BODY_BYTES } from '../src/domain/policy';
let directory: string;
let service: Awaited<ReturnType<typeof startService>>;
let clock = 0;
const jsonHeaders = { 'Content-Type': 'application/json' };
async function post(route: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(service.url + route, {
    method: 'POST',
    headers: { ...jsonHeaders, ...headers },
    body: JSON.stringify(body),
  });
}
async function events() {
  return (await (await fetch(service.url + '/events')).json()).events;
}
beforeEach(async () => {
  await mkdir('tests/.tmp', { recursive: true });
  directory = await mkdtemp(resolve('tests/.tmp/db-'));
  clock = 0;
  service = await startService({ path: `${directory}/lab.sqlite`, now: () => clock });
});
afterEach(async () => {
  await service.close();
  await rm(directory, { recursive: true, force: true });
});
describe('actual loopback HTTP + SQLite', () => {
  it('persists retries across restart, observes exact due boundaries and commits once', async () => {
    expect((await post('/events', { id: 'retry', payload: { scenario: 'retry' } })).status).toBe(
      201,
    );
    await post('/process', {});
    clock = 999;
    await post('/process', {});
    expect((await events())[0].attempts).toHaveLength(1);
    await service.close();
    service = await startService({ path: `${directory}/lab.sqlite`, now: () => clock });
    clock = 1000;
    await post('/process', {});
    expect((await events())[0].nextAttemptAt).toBe(3000);
    clock = 3000;
    await post('/process', {});
    expect((await events())[0]).toMatchObject({ state: 'delivered', effects: 1 });
    await service.close();
    service = await startService({ path: `${directory}/lab.sqlite`, now: () => clock });
    expect((await events())[0]).toMatchObject({ state: 'delivered', effects: 1 });
    expect((await post('/events', { id: 'retry', payload: { scenario: 'retry' } })).status).toBe(
      200,
    );
    await post('/process', {});
    expect((await events())[0].attempts).toHaveLength(3);
  });
  it('deduplicates concurrent process requests and canonical numeric-key payloads', async () => {
    const payload = { '10': 'ten', '2': 'two', nested: { z: 2, a: 1 } };
    const first = await (await post('/events', { id: 'one', payload })).json();
    const duplicate = await (
      await post('/events', {
        id: 'one',
        payload: { nested: { a: 1, z: 2 }, '2': 'two', '10': 'ten' },
      })
    ).json();
    expect(duplicate.receipt).toEqual(first.receipt);
    expect(duplicate.duplicate).toBe(true);
    const results = await Promise.all(Array.from({ length: 10 }, () => post('/process', {})));
    expect(results.every((response) => response.status === 200)).toBe(true);
    expect((await events())[0]).toMatchObject({ state: 'delivered', effects: 1 });
    expect((await events())[0].attempts).toHaveLength(1);
    expect((await post('/events', { id: 'one', payload: { changed: true } })).status).toBe(409);
  });
  it('replays an interrupted recorded attempt without applying a second receiver effect', async () => {
    await service.close();
    service = await startService({
      path: `${directory}/lab.sqlite`,
      now: () => clock,
      afterDelivery: () => {
        throw new Error('simulated process loss after receiver commit');
      },
    });
    await post('/events', { id: 'crash', payload: { scenario: 'success' } });
    expect((await post('/process', {})).status).toBe(500);
    expect((await events())[0]).toMatchObject({
      state: 'pending',
      effects: 1,
      attempts: [{ status: null, number: 1 }],
    });
    await service.close();
    service = await startService({ path: `${directory}/lab.sqlite`, now: () => clock });
    expect((await post('/process', {})).status).toBe(200);
    expect((await events())[0]).toMatchObject({
      state: 'delivered',
      effects: 1,
      attempts: [{ status: 200, number: 1 }],
    });
  });
  it('implements permanent rejection and four-attempt exhaustion over HTTP', async () => {
    await post('/events', { id: 'hard', payload: { scenario: 'reject' } });
    await post('/events', { id: 'exhaust', payload: { scenario: 'exhaust' } });
    for (const at of [0, 1000, 3000, 7000, 99999]) {
      clock = at;
      await post('/process', {});
    }
    const items = await events();
    expect(items.find((e: { id: string }) => e.id === 'hard')).toMatchObject({
      state: 'dead',
      effects: 0,
      attempts: [{ status: 422 }],
    });
    expect(items.find((e: { id: string }) => e.id === 'exhaust').attempts).toHaveLength(4);
  });
  it('rejects malformed JSON, unsupported methods/routes and oversized envelopes', async () => {
    const malformed = await fetch(service.url + '/events', {
      method: 'POST',
      headers: jsonHeaders,
      body: '{broken',
    });
    expect(malformed.status).toBe(400);
    expect((await post('/events', { id: 'empty', payload: {} })).status).toBe(400);
    expect(
      (await post('/events', { id: 'coerced', payload: { scenario: ['retry'] } })).status,
    ).toBe(400);
    expect(
      (await post('/events', { id: 'big', payload: { text: 'x'.repeat(MAX_BODY_BYTES) } })).status,
    ).toBe(413);
    expect((await fetch(service.url + '/events', { method: 'DELETE' })).status).toBe(405);
    expect((await fetch(service.url + '/unknown')).status).toBe(404);
    expect((await post('/process', { now: -1 })).status).toBe(400);
    expect((await fetch(service.url + '/health')).status).toBe(200);
    expect(await events()).toHaveLength(0);
  });
  it('rejects hostile origins, hostnames, content types, encodings and receiver access', async () => {
    const body = { id: 'ok', payload: { text: '<img src=x onerror=alert(1)>' } };
    expect((await post('/events', body, { Origin: 'https://attacker.invalid' })).status).toBe(403);
    expect((await post('/events', body, { Origin: 'null' })).status).toBe(403);
    expect((await post('/events', body, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await post('/events', body, { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await post('/events', body, { 'Content-Encoding': 'gzip' })).status).toBe(415);
    expect((await post('/receiver', body)).status).toBe(403);
    const badHost = await new Promise<number>((resolveStatus) => {
      const req = request(
        service.url + '/health',
        { headers: { Host: 'attacker.invalid' } },
        (response) => {
          response.resume();
          resolveStatus(response.statusCode!);
        },
      );
      req.end();
    });
    expect(badHost).toBe(403);
    expect((await post('/events', body)).status).toBe(201);
    expect((await events())[0].payload.text).toBe(body.payload.text);
  });
  it('rejects a streamed oversized body without creating any event', async () => {
    const status = await new Promise<number>((resolveStatus, reject) => {
      const req = request(
        service.url + '/events',
        { method: 'POST', headers: jsonHeaders },
        (response) => {
          response.resume();
          resolveStatus(response.statusCode!);
        },
      );
      req.on('error', reject);
      req.write('{"id":"large","payload":{"data":"');
      req.write('a'.repeat(MAX_BODY_BYTES));
      req.end('"}}');
    });
    expect(status).toBe(413);
    expect(await events()).toHaveLength(0);
  });
  it('enforces the durable 100-event limit but accepts duplicates at capacity', async () => {
    for (let i = 0; i < 100; i++)
      expect((await post('/events', { id: `id${i}`, payload: { a: 1 } })).status).toBe(201);
    expect((await post('/events', { id: 'overflow', payload: { a: 1 } })).status).toBe(429);
    expect((await post('/events', { id: 'id0', payload: { a: 1 } })).status).toBe(200);
    expect(await events()).toHaveLength(100);
  });
});

it('refuses an unknown persisted schema version', async () => {
  const futurePath = `${directory}/future.sqlite`;
  const future = new DatabaseSync(futurePath);
  future.exec('PRAGMA user_version=999');
  future.close();
  await expect(startService({ path: futurePath })).rejects.toThrow(
    'Unsupported database schema version',
  );
});
