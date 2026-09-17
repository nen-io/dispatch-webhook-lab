import { describe, expect, it } from 'vitest';
import {
  canonical,
  enqueue,
  MAX_BODY_BYTES,
  outcome,
  processDue,
  samplePayload,
  validateInput,
} from '../src/domain/policy';
import { advance, seed } from '../src/domain/simulation';
describe('shared delivery policy', () => {
  it('retries at exact due boundaries and succeeds on third attempt', () => {
    const state = seed({ now: 0, events: [] }, 'retry').state;
    expect(state.events[0].nextAttemptAt).toBe(1000);
    expect(advance(state, 999).events[0].attempts).toHaveLength(1);
    const second = advance(state, 1000);
    expect(second.events[0].nextAttemptAt).toBe(3000);
    const third = advance(second, 2000);
    expect(third.events[0]).toMatchObject({ state: 'delivered', effects: 1, nextAttemptAt: null });
    expect(third.events[0].attempts.map((a) => a.status)).toEqual([503, 503, 200]);
  });
  it('stops permanent rejections and exhausts four attempts', () => {
    expect(seed({ now: 0, events: [] }, 'reject').state.events[0]).toMatchObject({
      state: 'dead',
      effects: 0,
    });
    let state = seed({ now: 0, events: [] }, 'exhaust').state;
    for (const ms of [1000, 2000, 4000]) state = advance(state, ms);
    expect(state.events[0]).toMatchObject({ state: 'dead', nextAttemptAt: null, effects: 0 });
    expect(processDue(state.events, 100000)[0].attempts).toHaveLength(4);
    for (const status of [0, 408, 429, 500, 599])
      expect(outcome(status, 1, 10).nextAttemptAt).toBe(1010);
    for (const status of [300, 400, 401, 422]) expect(outcome(status, 1, 10).state).toBe('dead');
    expect(outcome(204, 1, 0).state).toBe('delivered');
  });
  it('deduplicates canonical nested payloads, including numeric and prototype-like keys', () => {
    const input = {
      id: 'x',
      payload: JSON.parse('{"10":"ten","2":"two","__proto__":{"safe":true},"a":{"z":1,"b":2}}'),
    };
    const first = enqueue([], input, 0);
    const delivered = processDue(first.events, 0);
    const duplicate = enqueue(
      delivered,
      {
        id: 'x',
        payload: JSON.parse('{"a":{"b":2,"z":1},"__proto__":{"safe":true},"2":"two","10":"ten"}'),
      },
      500,
    );
    expect(duplicate).toMatchObject({ duplicate: true, event: { createdAt: 0, effects: 1 } });
    expect(duplicate.events).toBe(delivered);
    expect(() => enqueue(delivered, { id: 'x', payload: { changed: true } }, 0)).toThrow(
      '409 Conflict',
    );
    expect(canonical({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
  it('rejects invalid ids, payloads, bounds and unsafe nesting', () => {
    for (const input of [
      null,
      [],
      { id: '', payload: {} },
      { id: '<x>', payload: { ok: true } },
      { id: 'ok', payload: [] },
      { id: 'ok', payload: {} },
      { id: 'ok', payload: { n: Infinity } },
      { id: 'ok', payload: { scenario: 'other' } },
      { id: 'ok', payload: { scenario: ['retry'] } },
      { id: 'ok', payload: { scenario: null } },
      { id: 'ok', payload: { ok: true }, url: 'https://example.com' },
    ])
      expect(() => validateInput(input)).toThrow();
    expect(() => validateInput({ id: 'x', payload: { data: 'a'.repeat(MAX_BODY_BYTES) } })).toThrow(
      '32 KiB',
    );
    let nested: unknown = true;
    for (let i = 0; i < 20; i++) nested = { nested };
    expect(() => validateInput({ id: 'x', payload: nested })).toThrow('nesting');
  });
  it('bounds session resources while still allowing existing receipts', () => {
    let events = [] as ReturnType<typeof enqueue>['events'];
    for (let i = 0; i < 100; i++)
      events = enqueue(events, { id: `e${i}`, payload: samplePayload('success') }, 0).events;
    expect(() => enqueue(events, { id: 'new', payload: samplePayload('success') }, 0)).toThrow(
      '100 events',
    );
    expect(enqueue(events, { id: 'e0', payload: samplePayload('success') }, 1).duplicate).toBe(
      true,
    );
  });
  it('avoids generated IDs colliding with custom IDs', () => {
    const events = enqueue([], { id: 'evt_0002', payload: { x: 1 } }, 0).events;
    expect(seed({ now: 0, events }, 'success').id).toBe('evt_0003');
  });
});

import { initialLab, labReducer } from '../src/domain/lab';
it('serializes ticks and input without dropping time or events', () => {
  let state = initialLab();
  state = labReducer(state, { type: 'advance' });
  state = labReducer(state, {
    type: 'submit',
    input: { id: 'evt_0006', payload: { custom: true } },
  });
  state = labReducer(state, { type: 'seed', scenario: 'success' });
  expect(state.simulation.now).toBe(1000);
  expect(state.simulation.events).toHaveLength(6);
  expect(state.selected).toBe('evt_0007');
  expect(state.simulation.events.at(-1)?.createdAt).toBe(1000);
});
