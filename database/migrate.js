import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root or local .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'rideflow_db',
  user: process.env.POSTGRES_USER || 'rideflow_user',
  password: process.env.POSTGRES_PASSWORD || 'rideflow_secure_password',
  connectionTimeoutMillis: 5000,
});

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function runMigrations() {
  console.log('🚀 Connecting to PostgreSQL...');
  let client;
  try {
    client = await pool.connect();
    console.log(`✅ Connected to database: ${process.env.POSTGRES_DB || 'rideflow_db'}`);

    await ensureMigrationTable(client);

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const executed = new Set(rows.map(r => r.filename));

    let executedCount = 0;
    for (const file of files) {
      if (executed.has(file)) {
        console.log(`⏩ Skipping already executed migration: ${file}`);
        continue;
      }

      console.log(`⚡ Running migration: ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  ✓ Successfully executed: ${file}`);
        executedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ❌ Failed executing migration ${file}:`, err.message);
        throw err;
      }
    }

    console.log(`\n🎉 Migrations complete! (${executedCount} newly applied)`);
  } catch (err) {
    console.error('❌ Database migration error:', err.message);
    throw err;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

export async function runSeeds() {
  console.log('🌱 Connecting to PostgreSQL for seeding...');
  let client;
  try {
    client = await pool.connect();
    const seedsDir = path.join(__dirname, 'seeds');
    const files = fs.readdirSync(seedsDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
      console.log(`⚡ Applying seed: ${file}...`);
      const sql = fs.readFileSync(path.join(seedsDir, file), 'utf8');
      await client.query(sql);
      console.log(`  ✓ Seed applied: ${file}`);
    }

    console.log('\n🎉 Database seeding completed successfully!');
  } catch (err) {
    console.error('❌ Database seeding error:', err.message);
    throw err;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

// CLI Execution Handler
const command = process.argv[2] || 'up';
if (command === 'up') {
  runMigrations().catch(() => process.exit(1));
} else if (command === 'seed') {
  runSeeds().catch(() => process.exit(1));
}
