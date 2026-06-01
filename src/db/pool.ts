import type { Pool, PoolConfig } from "pg";
import { Pool as PgPool } from "pg";

export function createPool(connection: string | Pool): Pool {
	if (typeof connection === "string") {
		return new PgPool({ connectionString: connection });
	}
	return connection;
}

export function isPoolOwned(connection: string | Pool): boolean {
	return typeof connection === "string";
}

export type { Pool, PoolConfig };
