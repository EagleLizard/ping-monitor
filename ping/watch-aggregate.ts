
import child_process from 'child_process';

export async function watchLogs() {
  for(;;) {
    await doWatch();
    await sleep(1000 * 5);
  }
}

function doWatch() {
  return new Promise((resolve, reject) => {
    (async () => {
      let csvProcess: child_process.ChildProcessWithoutNullStreams,
        coalesceProcess: child_process.ChildProcessWithoutNullStreams,
        csvAnalyzeProcess: child_process.ChildProcessWithoutNullStreams;
      csvProcess = child_process.spawn('node', [ 'dist/main.js', 'csv' ], {
        stdio: 'inherit',
      });
      await new Promise((_resolve) => {
        csvProcess.on('exit', code => {
          _resolve(code);
        });
        csvProcess.on('error', err => {
          reject(err);
        });
      });
      coalesceProcess = child_process.spawn('node', [ 'dist/csv-coalesce.js' ], {
        stdio: 'inherit',
      });
      await new Promise((_resolve) => {
        coalesceProcess.on('exit', code => {
          _resolve(code);
        });
        coalesceProcess.on('error', err => {
          reject(err);
        });
      });
      csvAnalyzeProcess = child_process.spawn('node', [ 'dist/csv-analyze.js' ], {
        stdio: 'inherit',
      });
      await new Promise((_resolve) => {
        csvAnalyzeProcess.on('exit', code => {
          _resolve(code);
        });
        coalesceProcess.on('error', err => {
          reject(err);
        });
      });
      resolve();
    })();
  });
}

async function sleep(ms: number) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}
