import pkg from 'pg';
const { Pool } = pkg;
import { logger } from './logger.js';

export const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'rideflow_db',
  user: process.env.POSTGRES_USER || 'rideflow_user',
  password: process.env.POSTGRES_PASSWORD || 'rideflow_secure_password',
  max: 10,
  idleTimeoutMillis: 30000,
});

let isConnected = false;

pool.on('connect', () => {
  isConnected = true;
});

pool.on('error', (err) => {
  isConnected = false;
  logger.error(err, 'PostgreSQL Pool error in Dispatch Worker');
});

export const query = (text, params) => pool.query(text, params);
export const isDbConnected = () => isConnected;

