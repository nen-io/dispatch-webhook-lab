import { useEffect, useReducer, useState } from 'react';
import type { Scenario } from './domain/policy';
import { formatTime } from './domain/simulation';
import { initialLab, labReducer } from './domain/lab';
import { Ledger } from './components/Ledger';
import { Inspector } from './components/Inspector';
import { DeliveryLane } from './components/DeliveryLane';
const scenarios: {
  id: Scenario;
  title: string;
  description: string;
  code: string;
  tone: string;
}[] = [
  {
    id: 'success',
    title: 'Clean delivery',
    description: 'First try. One receipt.',
    code: '200 OK',
    tone: 'mint',
  },
  {
    id: 'retry',
    title: 'A little turbulence',
    description: 'Two failures, then recovery.',
    code: '503 → 200',
    tone: 'amber',
  },
  {
    id: 'reject',
    title: 'Hard rejection',
    description: 'Permanent failure. No retry.',
    code: '422 STOP',
    tone: 'coral',
  },
  {
    id: 'exhaust',
    title: 'Retry exhaustion',
    description: 'Four attempts. Dead letter.',
    code: '503 × 4',
    tone: 'purple',
  },
];
export default function App() {
  const [{ simulation, selected, running, message, error }, dispatch] = useReducer(
    labReducer,
    undefined,
    initialLab,
  );
  const [composer, setComposer] = useState(false);
  const [customId, setCustomId] = useState('my_event');
  const [customPayload, setCustomPayload] = useState(
    '{"type":"order.completed","scenario":"success"}',
  );
  const event = simulation.events.find((item) => item.id === selected);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => dispatch({ type: 'advance' }), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  function announce(text: string) {
    dispatch({ type: 'message', text });
  }
  function addScenario(scenario: Scenario) {
    dispatch({ type: 'seed', scenario });
  }
  function submitInput(input: unknown) {
    dispatch({ type: 'submit', input });
  }
  function reset() {
    dispatch({ type: 'reset' });
  }
  function exportLog() {
    const blob = new Blob(
      [JSON.stringify({ schemaVersion: 1, mode: 'simulation', ...simulation }, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dispatch-simulation.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce('Simulation log exported as JSON.');
  }
  function updateClock() {
    dispatch({ type: 'advance', manual: true });
  }
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <a className="brand" href="#main" aria-label="Dispatch workspace">
          <span className="brand-symbol" aria-hidden="true">
            ↗
          </span>
          <strong>
            dispatch<span>.</span>
          </strong>
        </a>
        <div className="sidebar-label">WORKSPACE</div>
        <a className="nav-item active" href="#main">
          <span aria-hidden="true">▥</span> Delivery lab <span className="nav-dot" />
        </a>
        <a className="nav-item" href="#policy">
          <span aria-hidden="true">◇</span> Delivery policy
        </a>
        <div className="sidebar-bottom">
          <div className="small-brand">D</div>
          <div>
            <strong>Local laboratory</strong>
            <small>No credentials required</small>
          </div>
        </div>
      </aside>
      <main id="main">
        <header className="page-header">
          <div>
            <div className="breadcrumb">
              WORKSPACE <span>/</span> DELIVERY LAB
            </div>
            <div className="title-line">
              <h1>Make failure observable.</h1>
              <span className="simulation-badge">
                <span />
                BROWSER SIMULATION
              </span>
            </div>
            <p>Send an event. Break the delivery. See exactly what happens next.</p>
          </div>
          <div className="header-actions">
            <button className="subtle" onClick={reset}>
              Reset session
            </button>
            <button onClick={exportLog}>
              Export log <span aria-hidden="true">↗</span>
            </button>
          </div>
        </header>
        <section className="clock-strip" aria-label="Simulation controls">
          <div className="clock-info">
            <span className={`clock-light ${running ? 'running' : ''}`} />
            <span>VIRTUAL CLOCK</span>
            <strong data-testid="clock">{formatTime(simulation.now)}</strong>
            <small>
              {running ? 'Running · 1 simulated second / tick' : 'Paused · advance at your pace'}
            </small>
          </div>
          <div className="clock-actions">
            <button className="subtle" onClick={() => dispatch({ type: 'toggle' })}>
              {running ? 'Pause' : 'Auto-run'} <span aria-hidden="true">{running ? 'Ⅱ' : '▷'}</span>
            </button>
            <button className="primary" onClick={updateClock}>
              Advance +1s <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
        <section className="scenario-section" aria-labelledby="scenario-heading">
          <div className="section-top">
            <h2 id="scenario-heading">Choose your fault line</h2>
            <button
              className="text-button"
              aria-expanded={composer}
              onClick={() => setComposer(!composer)}
            >
              Custom event <span aria-hidden="true">{composer ? '−' : '+'}</span>
            </button>
          </div>
          <div className="scenario-grid">
            {scenarios.map((scenario) => (
              <button
                className={`scenario-card ${scenario.tone}`}
                key={scenario.id}
                onClick={() => addScenario(scenario.id)}
              >
                <div className="scenario-code">
                  <span className="dot" />
                  {scenario.code}
                  <span className="scenario-arrow" aria-hidden="true">
                    ↗
                  </span>
                </div>
                <h3>{scenario.title}</h3>
                <p>{scenario.description}</p>
              </button>
            ))}
          </div>
          {composer ? (
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  submitInput({ id: customId, payload: JSON.parse(customPayload) });
                } catch {
                  dispatch({ type: 'error', text: 'Payload must be valid JSON.' });
                }
              }}
            >
              <label>
                Event ID
                <input
                  value={customId}
                  maxLength={100}
                  onChange={(e) => setCustomId(e.target.value)}
                />
              </label>
              <label>
                JSON payload
                <textarea
                  value={customPayload}
                  maxLength={32769}
                  onChange={(e) => setCustomPayload(e.target.value)}
                  rows={3}
                />
              </label>
              <button className="primary" type="submit">
                Send custom event
              </button>
              <small>100 events per session · 32 KiB per event · no outbound requests</small>
            </form>
          ) : null}
        </section>
        <div className={`notice ${error ? 'notice-error' : ''}`} role={error ? 'alert' : 'status'}>
          <span aria-hidden="true">{error ? '!' : '↳'}</span>
          {error || message}
        </div>
        <DeliveryLane events={simulation.events} />
        <div className="workspace-grid">
          <Ledger
            events={simulation.events}
            selected={selected}
            onSelect={(id) => dispatch({ type: 'select', id })}
          />
          <Inspector
            event={event}
            duplicate={() => event && submitInput({ id: event.id, payload: event.payload })}
            conflict={() =>
              event &&
              submitInput({
                id: event.id,
                payload: {
                  ...event.payload,
                  changed: event.payload.changed === true ? false : true,
                },
              })
            }
          />
        </div>
        <section id="policy" className="policy">
          <div>
            <span className="eyebrow">SMALL POLICY. EXPLICIT GUARANTEES.</span>
            <h2>Retries are expected. Duplicate effects aren’t.</h2>
          </div>
          <div>
            <strong>4 attempts maximum</strong>
            <p>
              2xx commits a receipt. 408, 429 and 5xx retry after 1s, 2s, then 4s. Other responses
              stop the delivery.
            </p>
          </div>
          <div>
            <strong>One local receiver effect</strong>
            <p>
              Event ID + canonical payload protects the receiver. A changed payload is a 409
              conflict, never a silent overwrite.
            </p>
          </div>
        </section>
        <footer className="page-footer">
          <span>DISPATCH / WEBHOOK DELIVERY LABORATORY</span>
          <span>Static simulation · real Node + SQLite service included in source</span>
        </footer>
      </main>
    </div>
  );
}
