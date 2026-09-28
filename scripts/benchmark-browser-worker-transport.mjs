import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const results = await page.evaluate(async ({ shapes, repeats }) => {
    const workerCode = `self.onmessage = (event) => { const payload = event.data; if (payload.kind === 'matrix') self.postMessage(payload, [payload.values]); else self.postMessage(payload); };`;
    const workerUrl = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
    const worker = new Worker(workerUrl);
    const roundTrip = (payload, transfers = []) => new Promise((resolve) => {
      const started = performance.now();
      worker.onmessage = () => resolve(performance.now() - started);
      worker.postMessage(payload, transfers);
    });
    const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const reports = [];
    for (const { rows, columns } of shapes) {
      const headers = Array.from({ length: columns }, (_, i) => `v${i}`);
      const times = { objectCloneMs: [], matrixTransferMs: [] };
      for (let repeat = 0; repeat < repeats; repeat++) {
        const data = Array.from({ length: rows }, (_, rowIndex) => {
          const row = {};
          headers.forEach((header, columnIndex) => { row[header] = rowIndex + columnIndex / 10; });
          return row;
        });
        times.objectCloneMs.push(await roundTrip({ kind: 'objects', headers, data }));
        const values = new Float64Array(rows * columns);
        for (let row = 0; row < rows; row++) {
          for (let column = 0; column < columns; column++) values[row * columns + column] = row + column / 10;
        }
        const payload = { kind: 'matrix', headers, rows, columns, values: values.buffer };
        times.matrixTransferMs.push(await roundTrip(payload, [values.buffer]));
      }
      reports.push({ rows, columns, objectCloneMsMedian: median(times.objectCloneMs), matrixTransferMsMedian: median(times.matrixTransferMs) });
    }
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
    return reports;
  }, {
    shapes: [
      { rows: 1000, columns: 8 },
      { rows: 10000, columns: 16 },
      { rows: 50000, columns: 32 },
    ],
    repeats: 5,
  });
  process.stdout.write(`${JSON.stringify({ browser: 'Chromium', repeats: 5, results }, null, 2)}\n`);
} finally {
  await browser.close();
}
