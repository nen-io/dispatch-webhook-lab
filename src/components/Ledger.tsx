import { useState } from 'react';
import type { Delivery } from '../domain/policy';
import { formatTime } from '../domain/simulation';
export function Status({ state }: { state: Delivery['state'] }) {
  return (
    <span className={`status ${state}`}>
      <span aria-hidden="true" />
      {state === 'dead' ? 'Dead letter' : state === 'pending' ? 'Retry queued' : 'Delivered'}
    </span>
  );
}
export function Ledger({
  events,
  selected,
  onSelect,
}: {
  events: Delivery[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [state, setState] = useState('all');
  const query = search.trim().toLocaleLowerCase();
  const filtered = events.filter(
    (event) =>
      (state === 'all' || event.state === state) &&
      [event.id, event.payload.type ?? 'custom.event', event.payload.scenario ?? 'success'].some(
        (value) => String(value).toLocaleLowerCase().includes(query),
      ),
  );
  const filteredSelection =
    selected !== null &&
    events.some((event) => event.id === selected) &&
    !filtered.some((event) => event.id === selected);
  return (
    <section className="panel ledger" aria-labelledby="ledger-heading">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">DELIVERY ACTIVITY</span>
          <h2 id="ledger-heading">Every attempt. Accounted for.</h2>
        </div>
        <span className="count-pill">{events.length} events</span>
      </div>
      <div className="ledger-tools">
        <label>
          Find event
          <input
            type="search"
            value={search}
            maxLength={128}
            placeholder="Event ID, type or scenario"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          Delivery state
          <select value={state} onChange={(event) => setState(event.target.value)}>
            <option value="all">All states</option>
            <option value="pending">Retry queued</option>
            <option value="delivered">Delivered</option>
            <option value="dead">Dead letter</option>
          </select>
        </label>
        <button
          className="subtle"
          disabled={!search && state === 'all'}
          onClick={() => {
            setSearch('');
            setState('all');
          }}
        >
          Clear filters
        </button>
      </div>
      <div className="ledger-filter-summary" aria-live="polite">
        <span>
          {filtered.length} of {events.length} events shown
        </span>
        {filteredSelection && <span>Selected event is outside these filters.</span>}
      </div>
      {events.length === 0 ? (
        <div className="empty">
          <div className="empty-mark">↗</div>
          <h3>Your queue is clear.</h3>
          <p>Choose a scenario above to send your first event.</p>
        </div>
      ) : (
        <>
          <div className="ledger-labels" aria-hidden="true">
            <span>EVENT / SCENARIO</span>
            <span>STATE</span>
            <span>ATTEMPTS</span>
            <span>NEXT RETRY</span>
          </div>
          <div className="event-list">
            {[...filtered].reverse().map((event) => (
              <button
                key={event.id}
                className={`event-row ${selected === event.id ? 'selected' : ''}`}
                onClick={() => onSelect(event.id)}
                aria-pressed={selected === event.id}
                aria-label={`Inspect ${event.id}`}
              >
                <span className="event-name">
                  <strong>{event.id}</strong>
                  <small>
                    {String(event.payload.type ?? 'custom.event')}{' '}
                    <span>· {String(event.payload.scenario ?? 'success')}</span>
                  </small>
                </span>
                <Status state={event.state} />
                <span
                  className="attempt-dots"
                  aria-label={`${event.attempts.length} of 4 attempts`}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <i
                      key={n}
                      className={
                        n <= event.attempts.length
                          ? event.attempts[n - 1].status === 200
                            ? 'ok'
                            : 'fail'
                          : ''
                      }
                    />
                  ))}
                  <small>{event.attempts.length}/4</small>
                </span>
                <span className="mono next-time">
                  {event.nextAttemptAt === null ? '—' : formatTime(event.nextAttemptAt)}
                </span>
              </button>
            ))}
          </div>
          {!filtered.length && <p className="filtered-empty">No events match your filters.</p>}
        </>
      )}
      <footer className="panel-footer">
        <span className="dot mint" />
        Receipts are deduplicated by event ID + canonical payload.
      </footer>
    </section>
  );
}
