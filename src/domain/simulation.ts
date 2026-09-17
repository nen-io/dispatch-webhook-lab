import { enqueue, processDue, samplePayload, type Delivery, type Scenario } from './policy';
export interface Simulation {
  now: number;
  events: Delivery[];
}
/** The earliest pending deadline; terminal deliveries never keep the clock busy. */
export function nextDueAt(state: Simulation): number | null {
  let next: number | null = null;
  for (const event of state.events) {
    if (event.state === 'pending' && event.nextAttemptAt !== null)
      next = next === null ? event.nextAttemptAt : Math.min(next, event.nextAttemptAt);
  }
  return next;
}
export function advanceToNextDue(state: Simulation): Simulation {
  const due = nextDueAt(state);
  if (due === null) return state;
  // Already-due work is processed now; never turn the virtual clock backwards.
  return advance(state, Math.max(0, due - state.now));
}
export function advance(state: Simulation, milliseconds = 1000): Simulation {
  const now = state.now + milliseconds;
  return { now, events: processDue(state.events, now) };
}
export function seed(state: Simulation, scenario: Scenario): { state: Simulation; id: string } {
  let sequence = state.events.length + 1;
  let id = `evt_${String(sequence).padStart(4, '0')}`;
  while (state.events.some((event) => event.id === id))
    id = `evt_${String(++sequence).padStart(4, '0')}`;
  const { events } = enqueue(state.events, { id, payload: samplePayload(scenario) }, state.now);
  return { state: { ...state, events: processDue(events, state.now) }, id };
}
export function initialSimulation(): Simulation {
  let state: Simulation = { now: 0, events: [] };
  for (const scenario of ['success', 'retry', 'reject', 'exhaust'] as Scenario[])
    state = seed(state, scenario).state;
  return state;
}
export function formatTime(ms: number): string {
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
