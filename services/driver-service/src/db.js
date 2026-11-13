import pg from 'pg';
import { logger } from './logger.js';

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'rideflow_db',
  user: process.env.POSTGRES_USER || 'rideflow_user',
  password: process.env.POSTGRES_PASSWORD || 'rideflow_secure_password',
  connectionTimeoutMillis: 2000,
  max: 20,
  idleTimeoutMillis: 30000,
});

let isConnected = false;

pool.connect()
  .then((client) => {
    isConnected = true;
    logger.info('🐘 PostgreSQL connected successfully in Driver Service');
    client.release();
  })
  .catch((err) => {
    isConnected = false;
    logger.warn(`⚠️ PostgreSQL unavailable in Driver Service (${err.message}). Using resilient in-memory data store.`);
  });

export function isDbConnected() {
  return isConnected;
}

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  logger.debug({ text, duration, rows: res.rowCount }, 'Executed PostgreSQL query');
  return res;
}
