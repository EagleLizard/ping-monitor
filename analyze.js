
const fs = require('fs');
const readline = require('readline');
const os = require('os');

const { getCsvWriter } = require('./analyze-data/write-data');
const {
  LOG_TYPES,
  BASE_PATH,
} = require('./constants');
const { scaleTo } = require('./math-util');
const { chunk } = require('./array-util');
const parsePing = require('./parse-data/parse-ping');

const NUM_CPUS = os.cpus().length;

let logFilesParsed, logFileCount;

(async () => {
  try {
    await main();
  } catch(e) {
    console.error(e);
  }
})();

async function main() {
  let logFilePaths, chunkedPaths;
  let csvWriter;
  let startMs, endMs, deltaS, heapTotalMb,
    externalMb, totalMb;
  let throttleMs, chunkSize;

  throttleMs = 500;
  chunkSize = Math.round(
    NUM_CPUS / 2
  );

  logFilePaths = await parsePing.getLogLedgerEntries();
  // console.log('logFilePaths');
  // console.log(logFilePaths);
  logFileCount = logFilePaths.length;
  logFilesParsed = 0;
  csvWriter = await getCsvWriter(`${BASE_PATH}/log.csv`);
  csvWriter.write([ 'time_stamp', 'uri', 'ping_ms' ]);

  startMs = Date.now();

  chunkedPaths = chunk(logFilePaths, chunkSize);
  console.log(chunkedPaths);
  console.log('');
  for(let i = 0; i < chunkedPaths.length; ++i) {
    await readLogFiles(chunkedPaths[i], parsedLogLine => {
      writeCsvRow(csvWriter, parsedLogLine);
    });
    await sleep(throttleMs); // sleep to allow GC steps
  }

  await csvWriter.end();
  endMs = Date.now();
  deltaS = +((endMs - startMs) / 1000).toFixed(3);
  heapTotalMb = Math.round(process.memoryUsage().heapTotal / 1024 / 1024);
  externalMb = Math.round(process.memoryUsage().external / 1024 / 1024);
  totalMb = heapTotalMb + externalMb;

  console.log('Aggregator Totals:');
  console.log(`Aggregation took ${deltaS}s`);
  console.log(`Process used ${heapTotalMb}mb of heap memory`);
  console.log(`Process used ${externalMb}mb of heap memory`);
  console.log(`Process used ${totalMb}mb of total memory`);
}

function writeProgress() {
  let doOverwrite, prefix, progressOut, postfix, scaledFilesParsed, scaledFileCountDiff;
  doOverwrite = (logFilesParsed < logFileCount);
  prefix = doOverwrite ? '  ' : '';
  postfix = doOverwrite ? '\r' : '       \n';
  scaledFilesParsed = scaleTo(logFilesParsed, [ 0, logFileCount ], [ 0, 100 ]);
  scaledFileCountDiff = scaleTo(logFileCount - logFilesParsed, [ 0, logFileCount ], [ 0, 100 ]);
  progressOut = `[${'-'.repeat(scaledFilesParsed)}${' '.repeat(scaledFileCountDiff)}] ${Math.round((logFilesParsed / logFileCount) * 100).toFixed(1)}%`;
  process.stdout.write(`${prefix}${progressOut}${postfix}`);
}

function writeCsvRow(csvWriter, parsedLogLine) {
  let uri, ping_ms, time_stamp;
  if(parsedLogLine !== undefined) {
    uri = parsedLogLine.uri;
    time_stamp = parsedLogLine.time_stamp;
    switch(parsedLogLine.type) {
      case LOG_TYPES.SUCCESS:
        ping_ms = parsedLogLine.ping_ms;
        break;
      case LOG_TYPES.FAIL:
        ping_ms = LOG_TYPES.FAIL;
        break;
    }
    csvWriter.write([ time_stamp, uri, ping_ms ]);
  }
}

function readLogFiles(logFilePaths, lineCb) {
  return Promise.all(logFilePaths.map(logFilePath => {
    let logRs, lineReader;
    logRs = fs.createReadStream(logFilePath);
    lineReader = readline.createInterface({
      input: logRs,
    });
    return readLogFile(logRs, lineReader, logLine => {
      let parsedLogLine;
      parsedLogLine = parsePing.parseLogLine(logLine);
      lineCb(parsedLogLine);
    }).then(() => {
      logFilesParsed++;
      writeProgress();
      return logFilePath;
    });
  }));
}

async function readLogFile(logRs, lineReader, lineCb) {
  return new Promise((resolve, reject) => {
    logRs.on('error', err => {
      reject(err);
    });

    lineReader.on('line', (line) => {
      lineCb(line);
    });

    lineReader.on('close', () => {
      resolve();
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

