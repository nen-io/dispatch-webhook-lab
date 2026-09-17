import type { Delivery } from '../domain/policy';
import { formatTime } from '../domain/simulation';
import { Status } from './Ledger';
export function Inspector({
  event,
  duplicate,
  conflict,
}: {
  event?: Delivery;
  duplicate: () => void;
  conflict: () => void;
}) {
  return (
    <aside className="panel inspector" aria-labelledby="inspect-heading">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">EVENT INSPECTOR</span>
          <h2 id="inspect-heading">{event?.id ?? 'Select an event'}</h2>
        </div>
        <span className="inspector-mark" aria-hidden="true">{`{ }`}</span>
      </div>
      {!event ? (
        <p className="inspector-empty">
          Select an event to see its payload, response history and receiver effects.
        </p>
      ) : (
        <>
          <div className="inspector-summary">
            <Status state={event.state} />
            <span>
              <strong>{event.effects}</strong> receiver effect{event.effects === 1 ? '' : 's'}
            </span>
          </div>
          <div className="inspector-section">
            <h3>Attempt timeline</h3>
            <ol className="timeline">
              {event.attempts.map((attempt) => (
                <li
                  key={attempt.number}
                  className={attempt.status === 200 ? 'timeline-success' : ''}
                >
                  <div>
                    <strong>Attempt {attempt.number}</strong>
                    <span className={attempt.status === 200 ? 'response ok-text' : 'response'}>
                      HTTP {attempt.status}
                    </span>
                  </div>
                  <small>
                    {formatTime(attempt.at)}
                    {attempt.nextAttemptAt !== null
                      ? ` → retry at ${formatTime(attempt.nextAttemptAt)}`
                      : attempt.status === 200
                        ? ' · receipt committed'
                        : ' · no further retries'}
                  </small>
                </li>
              ))}
            </ol>
            {!event.attempts.length ? (
              <p className="muted">Waiting for its first attempt.</p>
            ) : null}
          </div>
          <div className="inspector-section">
            <div className="section-label">
              <h3>Payload</h3>
              <span>JSON</span>
            </div>
            <pre>{JSON.stringify(event.payload, null, 2)}</pre>
          </div>
          <div className="inspector-actions">
            <button onClick={duplicate}>
              Replay duplicate <span aria-hidden="true">↻</span>
            </button>
            <button className="subtle" onClick={conflict}>
              Try changed payload
            </button>
            <small>Same ID + same payload returns the original receipt.</small>
          </div>
        </>
      )}
    </aside>
  );
}
