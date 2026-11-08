// tests/harness/fakeSupabase.ts
// Servidor de Supabase simulado en memoria. Reproduce lo que el diseño necesita del real:
// - tabla photos con identity id, client_id único y RLS (cada usuario solo ve sus filas)
// - upsert por client_id que, como PostgREST, solo actualiza las columnas enviadas
// - trigger de borrados.sql: server_updated_at = now() y deleted_at no se puede "deshacer"
// - bucket privado: upload ("already exists" si se repite), remove y createSignedUrls
// - inyección de fallas y ganchos para simular ediciones a mitad de una subida

export interface ServerRow {
  id: number;
  user_id: string;
  client_id: string;
  storage_path: string;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  favorite: boolean;
  source: 'camera' | 'gallery';
  taken_at: string;
  updated_at: string;
  server_updated_at: string;
  deleted_at: string | null;
}

type Filter = (row: ServerRow) => boolean;
type Result = { data: any; error: { message: string } | null };

export class FakeSupabase {
  rows: ServerRow[] = [];
  files = new Set<string>();
  currentUser = 'user-1';
  private nextId = 1;
  // Reloj del servidor: siempre avanza, aunque el reloj de la prueba esté congelado
  private clock = Date.parse('2026-01-01T00:00:00Z');
  /** Próximas operaciones que deben fallar, por nombre: 'select' | 'upsert' | 'upload' | 'sign'. */
  failures: string[] = [];
  /** Se ejecuta antes de aplicar cada upsert (para simular al usuario editando durante la subida). */
  beforeUpsert: ((row: Record<string, unknown>) => Promise<void> | void) | null = null;
  requests = { select: 0, upsert: 0, upload: 0, remove: 0, sign: 0 };

  private now() {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  private shouldFail(op: string) {
    const i = this.failures.indexOf(op);
    if (i === -1) return false;
    this.failures.splice(i, 1);
    return true;
  }

  /** Inserta filas directamente (como si las hubiera subido otro teléfono). */
  seed(row: Partial<ServerRow> & { client_id: string }) {
    const full: ServerRow = {
      id: this.nextId++,
      user_id: this.currentUser,
      storage_path: `${row.user_id ?? this.currentUser}/${row.client_id}.jpg`,
      latitude: null,
      longitude: null,
      note: null,
      favorite: false,
      source: 'camera',
      taken_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null,
      ...row,
      server_updated_at: this.now(),
    };
    this.rows.push(full);
    this.files.add(full.storage_path);
    return full;
  }

  /** Filas que el usuario actual puede ver (RLS). */
  visible() {
    return this.rows.filter((r) => r.user_id === this.currentUser);
  }

  byClientId(clientId: string) {
    return this.rows.find((r) => r.client_id === clientId);
  }

  // ---------- API compatible con supabase-js (solo lo que usa la app) ----------

  from(table: string) {
    if (table !== 'photos') throw new Error(`tabla desconocida: ${table}`);
    return {
      select: (_columns?: string) => this.selectBuilder(),
      upsert: (row: Record<string, unknown>, _opts?: { onConflict: string }) =>
        this.thenable(() => this.upsert(row)),
    };
  }

  storage = {
    from: (_bucket: string) => ({
      upload: async (path: string, _body: ArrayBuffer, _opts?: unknown): Promise<Result> => {
        this.requests.upload++;
        if (this.shouldFail('upload')) return { data: null, error: { message: 'network error' } };
        if (this.files.has(path)) return { data: null, error: { message: 'The resource already exists' } };
        this.files.add(path);
        return { data: { path }, error: null };
      },
      remove: async (paths: string[]): Promise<Result> => {
        this.requests.remove++;
        paths.forEach((p) => this.files.delete(p));
        return { data: paths.map((name) => ({ name })), error: null };
      },
      createSignedUrls: async (paths: string[], _expires: number): Promise<Result> => {
        this.requests.sign++;
        if (this.shouldFail('sign')) return { data: null, error: { message: 'network error' } };
        return {
          data: paths.map((path) =>
            this.files.has(path)
              ? { path, signedUrl: `https://fake.storage/${path}?token=t`, error: null }
              : { path, signedUrl: '', error: 'Object not found' }
          ),
          error: null,
        };
      },
      createSignedUrl: async (path: string, _expires: number): Promise<Result> =>
        this.files.has(path)
          ? { data: { signedUrl: `https://fake.storage/${path}?token=t` }, error: null }
          : { data: null, error: { message: 'Object not found' } },
    }),
  };

  // ---------- internos ----------

  private thenable(run: () => Promise<Result>) {
    return { then: (ok: (r: Result) => unknown, ko?: (e: unknown) => unknown) => run().then(ok, ko) };
  }

  private selectBuilder() {
    const filters: Filter[] = [];
    let orderBy: { column: keyof ServerRow; ascending: boolean } | null = null;
    let limit = Infinity;
    const cmp = (a: unknown, b: unknown) => {
      // Las fechas ISO y los números se comparan por valor
      const x = typeof a === 'string' && !Number.isNaN(Date.parse(a)) ? Date.parse(a) : (a as number);
      const y = typeof b === 'string' && !Number.isNaN(Date.parse(b)) ? Date.parse(b) : (b as number);
      return x < y ? -1 : x > y ? 1 : 0;
    };
    const builder: any = {
      gt: (c: keyof ServerRow, v: unknown) => (filters.push((r) => cmp(r[c], v) > 0), builder),
      lt: (c: keyof ServerRow, v: unknown) => (filters.push((r) => cmp(r[c], v) < 0), builder),
      eq: (c: keyof ServerRow, v: unknown) => (filters.push((r) => r[c] === v), builder),
      is: (c: keyof ServerRow, v: null) => (filters.push((r) => r[c] === v), builder),
      ilike: (c: keyof ServerRow, pattern: string) => {
        const term = pattern.replace(/^%|%$/g, '').toLowerCase();
        filters.push((r) => String(r[c] ?? '').toLowerCase().includes(term) && r[c] !== null);
        return builder;
      },
      order: (column: keyof ServerRow, opts: { ascending: boolean }) => (
        (orderBy = { column, ascending: opts.ascending }), builder
      ),
      limit: (n: number) => ((limit = n), builder),
      then: (ok: (r: Result) => unknown, ko?: (e: unknown) => unknown) =>
        Promise.resolve()
          .then((): Result => {
            this.requests.select++;
            if (this.shouldFail('select')) return { data: null, error: { message: 'network error' } };
            let rows = this.visible().filter((r) => filters.every((f) => f(r)));
            if (orderBy) {
              const { column, ascending } = orderBy;
              rows = [...rows].sort((a, b) => cmp(a[column], b[column]) * (ascending ? 1 : -1));
            }
            return { data: rows.slice(0, limit).map((r) => ({ ...r })), error: null };
          })
          .then(ok, ko),
    };
    return builder;
  }

  private async upsert(input: Record<string, unknown>): Promise<Result> {
    this.requests.upsert++;
    if (this.beforeUpsert) await this.beforeUpsert(input);
    if (this.shouldFail('upsert')) return { data: null, error: { message: 'network error' } };

    const existing = this.byClientId(input.client_id as string);
    if (existing) {
      if (existing.user_id !== this.currentUser) {
        return { data: null, error: { message: 'new row violates row-level security policy' } };
      }
      const keepDeleted = existing.deleted_at; // trigger: el borrado gana
      Object.assign(existing, input);
      if (keepDeleted) existing.deleted_at = keepDeleted;
      existing.server_updated_at = this.now();
    } else {
      this.rows.push({
        id: this.nextId++,
        user_id: this.currentUser,
        latitude: null,
        longitude: null,
        note: null,
        favorite: false,
        deleted_at: null,
        ...(input as Partial<ServerRow>),
        server_updated_at: this.now(),
      } as ServerRow);
    }
    return { data: null, error: null };
  }
}
