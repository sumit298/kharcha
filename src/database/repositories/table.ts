import type { SqlExecutor, SqlValue } from '../sql';

type Codec = 'bool' | 'json';
type Row = Record<string, SqlValue>;

const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * Maps one entity type to one table: camelCase fields ↔ snake_case columns, booleans ↔ 0/1,
 * arrays/objects ↔ JSON text. Repositories add their own queries on top.
 */
export class Table<T extends { id: string }> {
  readonly columns: string[];

  constructor(
    readonly name: string,
    private readonly fields: readonly (keyof T & string)[],
    private readonly codecs: Partial<Record<keyof T & string, Codec>> = {},
  ) {
    this.columns = fields.map(snake);
  }

  toRow(entity: T): SqlValue[] {
    return this.fields.map((field) => {
      const value = entity[field] as unknown;
      const codec = this.codecs[field];
      if (codec === 'bool') return value ? 1 : 0;
      if (codec === 'json') return value === null || value === undefined ? null : JSON.stringify(value);
      return (value ?? null) as SqlValue;
    });
  }

  fromRow(row: Row): T {
    const entity: Record<string, unknown> = {};
    this.fields.forEach((field, i) => {
      const value = row[this.columns[i] as string] ?? null;
      const codec = this.codecs[field];
      entity[field] = codec === 'bool' ? value === 1 : codec === 'json' && typeof value === 'string' ? JSON.parse(value) : value;
    });
    return entity as T;
  }

  async insert(db: SqlExecutor, entity: T): Promise<void> {
    const marks = this.columns.map(() => '?').join(', ');
    await db.runAsync(`INSERT INTO ${this.name} (${this.columns.join(', ')}) VALUES (${marks})`, this.toRow(entity));
  }

  async upsert(db: SqlExecutor, entity: T): Promise<void> {
    const marks = this.columns.map(() => '?').join(', ');
    const updates = this.columns.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
    await db.runAsync(
      `INSERT INTO ${this.name} (${this.columns.join(', ')}) VALUES (${marks}) ON CONFLICT(id) DO UPDATE SET ${updates}`,
      this.toRow(entity),
    );
  }

  async get(db: SqlExecutor, id: string): Promise<T | null> {
    const row = await db.getFirstAsync<Row>(`SELECT * FROM ${this.name} WHERE id = ?`, [id]);
    return row ? this.fromRow(row) : null;
  }

  async where(db: SqlExecutor, clause: string, params: SqlValue[] = []): Promise<T[]> {
    const rows = await db.getAllAsync<Row>(`SELECT * FROM ${this.name} ${clause}`, params);
    return rows.map((row) => this.fromRow(row));
  }
}
