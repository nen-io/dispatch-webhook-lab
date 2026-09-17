import { DatabaseSync } from 'node:sqlite';
import {
  canonical,
  InputError,
  MAX_EVENTS,
  outcome,
  validateInput,
  type Payload,
  type State,
} from '../src/domain/policy.ts';
export interface EventRow {
  id: string;
  payload: string;
  createdAt: number;
  state: State;
  nextAttemptAt: number | null;
}
export interface AttemptRow {
  eventId: string;
  number: number;
  startedAt: number;
  status: number | null;
  nextAttemptAt: number | null;
}

/** Single process owns each database. Transactions contain no asynchronous work. */
export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    const version = this.db.prepare('PRAGMA user_version').get()!.user_version;
    if (version !== 0 && version !== 1) {
      this.db.close();
      throw new Error('Unsupported database schema version.');
    }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, payload TEXT NOT NULL, createdAt INTEGER NOT NULL, state TEXT NOT NULL, nextAttemptAt INTEGER);
      CREATE TABLE IF NOT EXISTS attempts (eventId TEXT NOT NULL REFERENCES events(id), number INTEGER NOT NULL, startedAt INTEGER NOT NULL, status INTEGER, nextAttemptAt INTEGER, PRIMARY KEY(eventId,number));
      CREATE TABLE IF NOT EXISTS receipts (eventId TEXT PRIMARY KEY REFERENCES events(id), payload TEXT NOT NULL, receivedAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS effects (eventId TEXT PRIMARY KEY REFERENCES receipts(eventId), appliedAt INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS due_events ON events(state,nextAttemptAt);
      PRAGMA user_version=1;`);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  get(id: string): EventRow | undefined {
    return this.db.prepare('SELECT * FROM events WHERE id=?').get(id) as unknown as
      EventRow | undefined;
  }
  enqueue(input: unknown, now: number) {
    const { id, payload } = validateInput(input);
    const encoded = canonical(payload);
    return this.transaction(() => {
      const existing = this.get(id);
      if (existing) {
        if (existing.payload !== encoded)
          throw new InputError('ID already exists with another payload.', 409);
        return { receipt: { id, createdAt: existing.createdAt }, duplicate: true };
      }
      const count = this.db.prepare('SELECT COUNT(*) AS count FROM events').get()!.count as number;
      if (count >= MAX_EVENTS)
        throw new InputError('Database event limit reached (100). Use a new database.', 429);
      this.db.prepare("INSERT INTO events VALUES (?,?,?,'pending',?)").run(id, encoded, now, now);
      return { receipt: { id, createdAt: now }, duplicate: false };
    });
  }
  list() {
    const events = this.db
      .prepare('SELECT * FROM events ORDER BY createdAt,id')
      .all() as unknown as EventRow[];
    return events.map((event) => ({
      ...event,
      payload: JSON.parse(event.payload) as Payload,
      attempts: this.attempts(event.id),
      effects: this.effectCount(event.id),
    }));
  }
  attempts(id: string): AttemptRow[] {
    return this.db
      .prepare('SELECT * FROM attempts WHERE eventId=? ORDER BY number')
      .all(id) as unknown as AttemptRow[];
  }
  effectCount(id: string): number {
    return this.db.prepare('SELECT COUNT(*) AS count FROM effects WHERE eventId=?').get(id)!
      .count as number;
  }
  due(now: number): EventRow[] {
    return this.db
      .prepare(
        "SELECT * FROM events WHERE state='pending' AND nextAttemptAt<=? ORDER BY nextAttemptAt,id",
      )
      .all(now) as unknown as EventRow[];
  }
  reserve(id: string, now: number): AttemptRow {
    return this.transaction(() => {
      const rows = this.attempts(id);
      // A crash after reservation replays the SAME logical attempt, never a new effect.
      const unfinished = rows.find((row) => row.status === null);
      if (unfinished) return unfinished;
      const number = rows.length + 1;
      if (number > 4) throw new Error('Attempt invariant violated');
      this.db.prepare('INSERT INTO attempts VALUES (?,?,?,NULL,NULL)').run(id, number, now);
      return { eventId: id, number, startedAt: now, status: null, nextAttemptAt: null };
    });
  }
  finish(id: string, number: number, status: number, now: number) {
    const result = outcome(status, number, now);
    this.transaction(() => {
      this.db
        .prepare('UPDATE attempts SET status=?,nextAttemptAt=? WHERE eventId=? AND number=?')
        .run(status, result.nextAttemptAt, id, number);
      this.db
        .prepare('UPDATE events SET state=?,nextAttemptAt=? WHERE id=?')
        .run(result.state, result.nextAttemptAt, id);
    });
  }
  receive(id: string, payload: Payload, now: number): boolean {
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT payload FROM receipts WHERE eventId=?').get(id);
      if (existing) {
        if (existing.payload !== canonical(payload))
          throw new InputError('Receiver payload conflict.', 409);
        return false;
      }
      this.db.prepare('INSERT INTO receipts VALUES (?,?,?)').run(id, canonical(payload), now);
      this.db.prepare('INSERT INTO effects VALUES (?,?)').run(id, now);
      return true;
    });
  }
  close() {
    this.db.close();
  }
}
