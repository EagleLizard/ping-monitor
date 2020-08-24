const os = require('os');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const {
  logDir,
  CSV_LOG_DIR,
  LOG_TYPES,
} = require('../constants');
const files = require('../files');
const { chunk } = require('../array-util');
const { getCsvWriter } = require('../analyze-data/write-data');
const parsePing = require('./parse-ping');

const NUM_CPUS = os.cpus().length;
const CHUNK_SIZE = Math.round(
  NUM_CPUS,
);

module.exports = {
  convertLogs,
};

async function convertLogs() {
  let startMs, endMs, deltaS, heapTotalMb,
    externalMb, totalMb;
  let filePaths, logInfos, logsToConvert;

  startMs = Date.now();

  await files.mkdirIfNotExist(CSV_LOG_DIR);
  filePaths = await getLogPaths();
  logInfos = getLogInfos(filePaths);
  logsToConvert = await getConvertableLogs(logInfos);

  await logsToCsv(logsToConvert);

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

async function logsToCsv(logInfos) {
  let numLogs, completedCount;
  let infoChunks;
  numLogs = logInfos.length;
  completedCount = 0;
  infoChunks = chunk(logInfos, CHUNK_SIZE);
  for(let i = 0, currChunk; i < infoChunks.length, currChunk = infoChunks[i]; ++i) {
    let logInfoPromises;
    logInfoPromises = currChunk.map(logInfo => {
      return logToCsv(logInfo).then(res => {
        completedCount++;
        if(completedCount === numLogs) {
          process.stdout.write('\n100%');
        } else {
          process.stdout.write(`     ${((completedCount / numLogs) * 100).toFixed(2)}%\r`);
        }
        return res;
      });
    });
    await Promise.all(logInfoPromises);
  }
}

async function logToCsv(logInfo) {
  let csvWriter;

  csvWriter = await getCsvWriter(logInfo.csvPath);
  csvWriter.write([ 'time_stamp', 'uri', 'ping_ms' ]);

  return new Promise((resolve, reject) => {
    let logRs, lineReader;

    logRs = fs.createReadStream(logInfo.filePath);
    logRs.on('error', err => {
      reject(err);
    });

    lineReader = readline.createInterface({
      input: logRs,
    });
    lineReader.on('line', line => {
      let parsedLogLine, uri, time_stamp, ping_ms;
      parsedLogLine = parsePing.parseLogLine(line);
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
    });
    lineReader.on('close', () => {
      csvWriter.end().then(() => {
        resolve();
      });
    });
  });
}

async function getConvertableLogs(logInfos) {
  let convertableLogs;
  convertableLogs = [];
  for(let i = 0, currLogInfo; i < logInfos.length, currLogInfo = logInfos[i]; ++i) {
    if(i === (logInfos.length - 1)) {
      convertableLogs.push(currLogInfo);
      continue;
    }
    if(!(await files.exists(currLogInfo.csvPath))) {
      convertableLogs.push(currLogInfo);
    }
  }
  return convertableLogs;
}

async function getLogPaths() {
  let filePaths;
  filePaths = await files.getDirFilePaths(logDir);
  return filePaths;
}

function getLogInfos(logFilePaths) {
  let logInfos;
  //dedupe
  logFilePaths = [ ...(new Set(logFilePaths)) ];
  logInfos = logFilePaths.map(logFilePath => {
    let parsedPath, fileName, csvPath;
    let datePart, timePart;
    let month, day, year, hours,
      minutes;
    let logDate, logStamp;
    parsedPath = path.parse(logFilePath);
    fileName = parsedPath.name;
    [ datePart, timePart ] = fileName.split('_').slice(0, 2);
    [ month, day, year ] = datePart.split('-').map(val => +val);
    [ hours, minutes ] = timePart.split(':').map(val => +val);
    month = month - 1;
    logDate = new Date(year, month, day, hours, minutes);
    logStamp = logDate.valueOf();
    csvPath = path.join(CSV_LOG_DIR, `${fileName}.csv`);
    return {
      filePath: logFilePath,
      fileName,
      date: logDate,
      time_stamp: logStamp,
      csvPath,
    };
  });
  logInfos.sort((a, b) => {
    let aStamp, bStamp;
    aStamp = a.time_stamp;
    bStamp = b.time_stamp;
    if(aStamp < bStamp) {
      return -1;
    } else if(aStamp > bStamp) {
      return 1;
    }
    return 0;
  });
  return logInfos;
}
