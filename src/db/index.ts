import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// For queries
const queryClient = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
});

export const db = drizzle(queryClient, { schema });

// For migrations (separate connection)
export function getMigrationClient() {
  return postgres(process.env.DATABASE_URL!, { max: 1 });
}

