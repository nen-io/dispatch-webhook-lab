import type { Delivery } from '../domain/policy';
export function DeliveryLane({ events }: { events: Delivery[] }) {
  const pending = events.filter((e) => e.state === 'pending').length;
  const effects = events.reduce((sum, e) => sum + e.effects, 0);
  return (
    <section className="delivery-lane" aria-label="Delivery flow">
      <div className="lane-intro">
        <span className="eyebrow">THE DELIVERY PATH</span>
        <span>Synthetic events. Real rules.</span>
      </div>
      <div className="lane-flow">
        <div className="lane-node">
          <div className="node-symbol coral-symbol" aria-hidden="true">
            ↗
          </div>
          <div>
            <strong>Producer</strong>
            <span>{events.length} events accepted</span>
          </div>
          <span className="node-label">INTAKE</span>
        </div>
        <div className="connector" aria-hidden="true">
          <i />
          <span>validate + dedupe</span>
          <b>→</b>
        </div>
        <div className="lane-node queue-node">
          <div className="node-symbol" aria-hidden="true">
            ≋
          </div>
          <div>
            <strong>Retry queue</strong>
            <span>{pending} waiting for retry</span>
          </div>
          <span className="node-label">1s / 2s / 4s</span>
        </div>
        <div className="connector" aria-hidden="true">
          <i />
          <span>at least once</span>
          <b>→</b>
        </div>
        <div className="lane-node">
          <div className="node-symbol mint-symbol" aria-hidden="true">
            ✓
          </div>
          <div>
            <strong>Receiver</strong>
            <span>{effects} effects committed</span>
          </div>
          <span className="node-label">IDEMPOTENT</span>
        </div>
      </div>
    </section>
  );
}
