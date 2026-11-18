import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BACKEND_DIR = path.resolve(__dirname, '..', '..');
export const DATA_DIR = path.join(BACKEND_DIR, 'data');
export const OUTPUT_DIR = path.join(BACKEND_DIR, 'output');
export const FONT_DIR = path.join(BACKEND_DIR, 'fonts');
export const ASSET_DIR = path.join(BACKEND_DIR, 'assets');
export const SEED_DIR = path.resolve(BACKEND_DIR, '..', 'CSV');
export const FRONTEND_DIST = path.resolve(BACKEND_DIR, '..', 'frontend', 'dist', 'frontend', 'browser');
