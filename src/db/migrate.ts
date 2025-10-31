import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getMigrationClient } from './index';

async function runMigrations() {
  console.log('Running migrations...');
  
  const migrationClient = getMigrationClient();
  const db = drizzle(migrationClient);
  
  await migrate(db, { migrationsFolder: './drizzle' });
  
  console.log('Migrations complete!');
  await migrationClient.end();
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

