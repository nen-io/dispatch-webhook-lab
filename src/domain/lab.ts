import { enqueue, processDue, type Scenario } from './policy';
import {
  advance,
  advanceToNextDue,
  formatTime,
  initialSimulation,
  seed,
  type Simulation,
} from './simulation';
export interface LabState {
  simulation: Simulation;
  selected: string | null;
  running: boolean;
  message: string;
  error: string;
}
export type Action =
  | { type: 'seed'; scenario: Scenario }
  | { type: 'submit'; input: unknown }
  | { type: 'advance'; manual?: boolean }
  | { type: 'next-due' }
  | { type: 'toggle' }
  | { type: 'reset' }
  | { type: 'select'; id: string }
  | { type: 'message'; text: string }
  | { type: 'error'; text: string };
export function initialLab(): LabState {
  return {
    simulation: initialSimulation(),
    selected: 'evt_0002',
    running: false,
    message: 'Four sample events are ready. Advance time to follow the retries.',
    error: '',
  };
}
/** One reducer orders clock ticks and user actions against the latest committed model. */
export function labReducer(state: LabState, action: Action): LabState {
  try {
    switch (action.type) {
      case 'seed': {
        const result = seed(state.simulation, action.scenario);
        return {
          ...state,
          simulation: result.state,
          selected: result.id,
          error: '',
          message: `${result.id} created. First attempt processed at ${formatTime(state.simulation.now)}.`,
        };
      }
      case 'submit': {
        const result = enqueue(state.simulation.events, action.input, state.simulation.now);
        return {
          ...state,
          simulation: {
            ...state.simulation,
            events: processDue(result.events, state.simulation.now),
          },
          selected: result.event.id,
          error: '',
          message: result.duplicate
            ? result.event.effects === 1
              ? `Duplicate accepted. Original receipt ${result.event.id} reused; no new delivery or receiver effect.`
              : `Duplicate accepted. Existing ${result.event.state} delivery ${result.event.id} reused. No receiver receipt exists yet; no new delivery was created.`
            : `${result.event.id} accepted and processed.`,
        };
      }
      case 'advance':
        return {
          ...state,
          simulation: advance(state.simulation),
          ...(action.manual
            ? { error: '', message: 'Virtual clock advanced by one second. Due events processed.' }
            : {}),
        };
      case 'toggle':
        return { ...state, running: !state.running };
      case 'next-due': {
        const simulation = advanceToNextDue(state.simulation);
        return {
          ...state,
          simulation,
          running: false,
          error: '',
          message:
            simulation === state.simulation
              ? 'No pending attempts. Virtual clock is unchanged.'
              : `Advanced to ${formatTime(simulation.now)}. Due batch processed; auto-run paused for inspection.`,
        };
      }
      case 'reset':
        return {
          simulation: { now: 0, events: [] },
          selected: null,
          running: false,
          message: 'Session reset. Clock and queue are empty.',
          error: '',
        };
      case 'select':
        return { ...state, selected: action.id };
      case 'message':
        return { ...state, message: action.text, error: '' };
      case 'error':
        return { ...state, error: action.text };
    }
  } catch (error) {
    return { ...state, error: error instanceof Error ? error.message : 'Could not process event.' };
  }
}
