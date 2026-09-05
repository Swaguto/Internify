declare module "pg" {
  export class Pool {
    constructor(config?: { connectionString?: string; ssl?: { rejectUnauthorized?: boolean } });
    query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }
  export class PoolClient {
    query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
    release(): void;
  }
}
