/** Shared, deterministic delivery policy. No clocks, I/O or React. */
export const MAX_BODY_BYTES = 32 * 1024;
export const MAX_EVENTS = 100;
export type Scenario = 'success' | 'retry' | 'reject' | 'exhaust';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Payload = { [key: string]: Json };
export type State = 'pending' | 'delivered' | 'dead';
export interface Attempt {
  number: number;
  at: number;
  status: number;
  nextAttemptAt: number | null;
}
export interface Delivery {
  id: string;
  payload: Payload;
  createdAt: number;
  state: State;
  nextAttemptAt: number | null;
  attempts: Attempt[];
  effects: number;
}
export class InputError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function validateJson(value: unknown, depth = 0): asserts value is Json {
  if (depth > 16) throw new InputError('JSON nesting exceeds 16 levels.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    for (const item of value) validateJson(item, depth + 1);
    return;
  }
  if (typeof value === 'object' && value && Object.getPrototypeOf(value) === Object.prototype) {
    for (const item of Object.values(value)) validateJson(item, depth + 1);
    return;
  }
  throw new InputError('Payload must contain valid JSON values.');
}
export function canonical(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function validateInput(input: unknown): { id: string; payload: Payload } {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new InputError('Expected an event object.');
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some((key) => key !== 'id' && key !== 'payload'))
    throw new InputError('Only id and payload are accepted.');
  if (typeof data.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(data.id))
    throw new InputError(
      'ID must be 1–64 letters, digits, dots, dashes or underscores; start with a letter or digit.',
    );
  if (
    !data.payload ||
    typeof data.payload !== 'object' ||
    Array.isArray(data.payload) ||
    Object.keys(data.payload).length === 0
  )
    throw new InputError('Payload must be a nonempty JSON object.');
  validateJson(data.payload);
  const payload = data.payload as Payload;
  if (
    payload.scenario !== undefined &&
    (typeof payload.scenario !== 'string' ||
      !['success', 'retry', 'reject', 'exhaust'].includes(payload.scenario))
  )
    throw new InputError('Unknown scenario. Use success, retry, reject or exhaust.');
  if (new TextEncoder().encode(JSON.stringify(data)).length > MAX_BODY_BYTES)
    throw new InputError('Event exceeds 32 KiB.', 413);
  return { id: data.id, payload: JSON.parse(canonical(payload)) as Payload };
}
export function outcome(
  status: number,
  attempt: number,
  now: number,
): { state: State; nextAttemptAt: number | null } {
  if (status >= 200 && status < 300) return { state: 'delivered', nextAttemptAt: null };
  const retryable =
    status === 0 || status === 408 || status === 429 || (status >= 500 && status <= 599);
  if (!retryable || attempt >= 4) return { state: 'dead', nextAttemptAt: null };
  return { state: 'pending', nextAttemptAt: now + 1000 * 2 ** (attempt - 1) };
}
export function scenarioStatus(payload: Payload, attempt: number): number {
  switch (payload.scenario) {
    case 'retry':
      return attempt < 3 ? 503 : 200;
    case 'reject':
      return 422;
    case 'exhaust':
      return 503;
    default:
      return 200;
  }
}
export function enqueue(
  events: Delivery[],
  input: unknown,
  now: number,
): { events: Delivery[]; event: Delivery; duplicate: boolean } {
  const { id, payload } = validateInput(input);
  const existing = events.find((event) => event.id === id);
  if (existing) {
    if (canonical(existing.payload) !== canonical(payload))
      throw new InputError('409 Conflict: this ID already belongs to a different payload.', 409);
    return { events, event: existing, duplicate: true };
  }
  if (events.length >= MAX_EVENTS)
    throw new InputError('Session limit reached: reset or export the 100 events.', 429);
  const event: Delivery = {
    id,
    payload,
    createdAt: now,
    state: 'pending',
    nextAttemptAt: now,
    attempts: [],
    effects: 0,
  };
  return { events: [...events, event], event, duplicate: false };
}
export function processDue(events: Delivery[], now: number): Delivery[] {
  return events.map((event) => {
    if (event.state !== 'pending' || event.nextAttemptAt === null || event.nextAttemptAt > now)
      return event;
    const number = event.attempts.length + 1;
    const status = scenarioStatus(event.payload, number);
    const result = outcome(status, number, now);
    return {
      ...event,
      ...result,
      effects: result.state === 'delivered' ? 1 : 0,
      attempts: [
        ...event.attempts,
        { number, at: now, status, nextAttemptAt: result.nextAttemptAt },
      ],
    };
  });
}
export function samplePayload(scenario: Scenario): Payload {
  return { type: 'order.completed', order: 'ORD-2048', amount: 12900, currency: 'GBP', scenario };
}
