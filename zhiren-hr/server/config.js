import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PORT = Number(process.env.PORT) || 3200;
export const HOST = process.env.HOST || '127.0.0.1';
export const DB_PATH = process.env.ZHIREN_DB_PATH || path.join(ROOT, 'data', 'zhiren.db');
// Demo mode allows "reset demo data" from the UI.
export const DEMO = process.env.ZHIREN_DEMO !== '0';
// Claude model used for the optional AI assistance. Defaults to Claude Opus 5.5.
export const AI_MODEL = process.env.ZHIREN_AI_MODEL || 'claude-opus-5-5';
// Requests per minute allowed to the AI endpoint (protects against runaway cost).
export const AI_RATE_LIMIT = Number(process.env.ZHIREN_AI_RPM) || 20;
