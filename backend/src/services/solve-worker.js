import { parentPort, workerData, Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { solve } from './solver.js';
import { diagnose, bestSeed } from './diagnose.js';

if (parentPort) {
  const { mode, data, config, options = {} } = workerData;
  const onProgress = (message) => parentPort.postMessage({ type: 'progress', message });
  try {
    let result;
    if (mode === 'solve') result = solve(data, config, { onProgress });
    else if (mode === 'diagnose') result = diagnose(data, config, { ...options, onProgress });
    else if (mode === 'best') result = bestSeed(data, config, { ...options, onProgress });
    else throw new Error(`Unknown worker mode: ${mode}`);
    parentPort.postMessage({ type: 'result', result });
  } catch (err) {
    parentPort.postMessage({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในเวิร์กเกอร์' });
  }
}

export function runWorker(data, config, mode, options = {}) {
  return new Promise((resolve, reject) => {
    const log = [];
    const worker = new Worker(fileURLToPath(import.meta.url), {
      workerData: { mode, data, config, options },
    });
    worker.on('message', (msg) => {
      if (msg.type === 'progress') log.push(msg.message);
      else if (msg.type === 'result') resolve({ result: msg.result, log });
      else if (msg.type === 'error') reject(new Error(msg.message));
    });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}
