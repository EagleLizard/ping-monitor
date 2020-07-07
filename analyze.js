
const { promisify } = require('util');
const fs = require('fs');
const readFile = promisify(fs.readFile);
const readline = require('readline');

const {
  LOG_LEDGER_PATH,
  LOG_TYPES,
  PERIOD_TYPES,
} = require('./constants');
const {
  getPeriodAggregator,
  writePeriodStats,
} = require('./analyze-data/period-aggregate');
const {
  getLogAggregator,
} = require('./analyze-data/log-aggregate');

const OMIT_MS_LIMIT = 10000;
const MINUTE_PERIOD_GROUP_BY = 5;

(async () => {
  try {
    await main();
  } catch(e) {
    console.error(e);
  }
})();

async function main() {
  let logFileData, logFilePaths;
  let statAggregator, periodAggregator;
  let logStats;
  let startMs, endMs;
  let fileReadTotalMs, aggregateTotalMs;
  fileReadTotalMs = 0;
  aggregateTotalMs = 0;

  logFilePaths = (await readFile(LOG_LEDGER_PATH))
    .toString()
    .split('\n')
    .map(str => str.trim())
    .filter(str => {
      return (str.length > 0)
        && (!str.startsWith('#'))
    });
  //dedupe
  logFilePaths = [ ...(new Set(logFilePaths)) ];
  console.log('logFilePaths');
  console.log(logFilePaths);
  statAggregator = getLogAggregator();
  periodAggregator = getPeriodAggregator(PERIOD_TYPES.MINUTE, MINUTE_PERIOD_GROUP_BY);
  startMs = Date.now();
  logFileData = await Promise.all(readLogFiles(logFilePaths, parsedLogLine => {
    statAggregator.aggregate(parsedLogLine);
    periodAggregator.aggregate(parsedLogLine);
  }));

  // logFileData = readLogFilesSync(logFilePaths, parsedLogLine => {
  //   statAggregator.aggregate(parsedLogLine);
  //   periodAggregator.aggregate(parsedLogLine);
  // });

  endMs = Date.now();
  for(
    let i = 0, currLogStat, logFilePath;
    i < logFileData.length;
    ++i
  ) {
    logFilePath = logFileData[i][0];
    currLogStat = logFileData[i][1];
    if(currLogStat !== undefined) { 
      console.log(`${logFilePath}: ${currLogStat.perf_ms}ms`);
    }
  }
  logStats = statAggregator.getStats();
  periodStats = periodAggregator.getStats();
  console.log('Aggregator Totals:');
  console.log(logStats);
  console.log(`Aggregation took ${endMs - startMs}ms`);
  writePeriodStats(periodAggregator);
}

function readLogFiles(logFilePaths, lineCb) {
  return logFilePaths.map(logFilePath => {
    let singleLogFileAggregator;
    let logRs, lineReader;
    logRs = fs.createReadStream(logFilePath);
    lineReader = readline.createInterface({
      input: logRs,
    });
    singleLogFileAggregator = getLogAggregator();
    return readLogFile(logRs, lineReader, logLine => {
      let parsedLogLine;
      parsedLogLine = parseLogLine(logLine);
      singleLogFileAggregator.aggregate(parsedLogLine);
      lineCb(parsedLogLine);
    }).then(() => {
      return [logFilePath, singleLogFileAggregator.getStats()];
    });
  });
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

function readLogFilesSync(logFilePaths, lineCb) {
  let logFileStatTuples;
  logFileStatTuples = [];
  for(let i = 0, currPath; i < logFilePaths.length, currPath = logFilePaths[i]; ++i) {
    logFileStatTuples.push(readLogFileSync(currPath, lineCb));
  }
  return logFileStatTuples;
}

function readLogFileSync(logFilePath, lineCb) {
  let logFileData, singleLogFileAggregator;
  logFileData = fs.readFileSync(logFilePath).toString().split('\n');
  singleLogFileAggregator = getLogAggregator();
  for(let i = 0, logLine; i < logFileData.length, logLine = logFileData[i]; ++i) {
    let parsedLogLine;
    parsedLogLine = parseLogLine(logLine);
    singleLogFileAggregator.aggregate(parsedLogLine);
    lineCb(parsedLogLine);
  }
  return [logFilePath, singleLogFileAggregator.getStats()];
}

function parseLogLine(logLine) {
  let logType, splat;
  let dateStamp;
  if(!logLine || logLine.trim().length === 0) {
    return;
  }
  dateStamp = logLine.substring(0, 10);
  if(!/[0-9]{4}-[0-9]{2}-[0-9]{2}/g.test(dateStamp)) {
    return;
  }
  logType = (logLine.includes('Unreachable') || logLine.includes('timeout'))
    ? LOG_TYPES.FAIL
    : LOG_TYPES.SUCCESS;
  switch(logType) {
    case LOG_TYPES.SUCCESS:
      return parseSuccessLogLine(logLine);
    case LOG_TYPES.FAIL:
      return parseFailLogLine(logLine);
  }
}

function parseSuccessLogLine(logLine) {
  let splat, time_stamp, uri, timePart, ping_ms;
  splat = logLine.split(' ');
  time_stamp = splat[0];
  uri = splat[1];
  timePart = splat[splat.length - 2];
  ping_ms = +timePart.split('=')[1];
  if(Number.isNaN(ping_ms) || ping_ms >= OMIT_MS_LIMIT) {
    return;
  }
  return {
    type: LOG_TYPES.SUCCESS,
    time_stamp,
    logLine,
    uri,
    ping_ms,
  }
}

function parseFailLogLine(logLine) {
  let splat, time_stamp, uri;
  splat = logLine.split(' ');
  time_stamp = splat[0];
  uri = splat[1];
  return {
    type: LOG_TYPES.FAIL,
    time_stamp,
    uri,
  };
}
