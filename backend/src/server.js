import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { FRONTEND_DIST } from './services/paths.js';
import * as store from './services/store.js';
import api from './routes/api.js';

store.init();

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api', api);

if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ message: err.message || 'เกิดข้อผิดพลาด' });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Timetable backend listening on port ${PORT}`);
});
