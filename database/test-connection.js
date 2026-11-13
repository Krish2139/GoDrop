import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'rideflow_db',
  user: process.env.POSTGRES_USER || 'rideflow_user',
  password: process.env.POSTGRES_PASSWORD || 'rideflow_secure_password',
  connectionTimeoutMillis: 3000,
});

async function testConnection() {
  console.log('🔍 Testing PostgreSQL connection with parameters:');
  console.log(`   Host:     ${process.env.POSTGRES_HOST || 'localhost'}`);
  console.log(`   Port:     ${process.env.POSTGRES_PORT || '5432'}`);
  console.log(`   Database: ${process.env.POSTGRES_DB || 'rideflow_db'}`);
  console.log(`   User:     ${process.env.POSTGRES_USER || 'rideflow_user'}`);

  try {
    const client = await pool.connect();
    const res = await client.query('SELECT version(), current_database(), current_user;');
    console.log('\n✅ Connection Successful!');
    console.log(`   PostgreSQL Version: ${res.rows[0].version}`);
    console.log(`   Current Database:   ${res.rows[0].current_database}`);
    console.log(`   Current User:       ${res.rows[0].current_user}`);

    // Check tables count
    const tableRes = await client.query(`
      SELECT count(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `);
    console.log(`   Public Tables:      ${tableRes.rows[0].count}`);

    client.release();
  } catch (err) {
    console.error('\n⚠️ PostgreSQL connection could not be established:');
    console.error(`   ${err.message}`);
    console.log('\n💡 Hint: Ensure Docker Desktop or PostgreSQL server is running.');
  } finally {
    await pool.end();
  }
}

testConnection();

