import os from 'os';
import path from 'path';
import fs from 'fs';
import readline from 'readline';

import {
  logDir,
  CSV_LOG_DIR,
  LOG_TYPES,
} from '../constants';
import * as files from '../files';
import { chunk } from '../array-util';
import { getCsvWriter, CsvWriter } from '../analyze-data/write-data';
import * as parsePing from './parse-ping';

const NUM_CPUS = os.cpus().length;
const CHUNK_SIZE = Math.round(
  NUM_CPUS,
);

type LogInfo = {
  filePath: string;
  fileName: string;
  date: Date;
  time_stamp: number;
  csvPath: string;
}

export {
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

async function logsToCsv(logInfos: LogInfo[]) {
  let numLogs: number, completedCount: number;
  let infoChunks: LogInfo[][];
  numLogs = logInfos.length;
  completedCount = 0;
  infoChunks = chunk(logInfos, CHUNK_SIZE);
  for(let i = 0, currChunk; i < infoChunks.length, currChunk = infoChunks[i]; ++i) {
    let logInfoPromises;
    logInfoPromises = currChunk.map(logInfo => {
      return logToCsv(logInfo).then(res => {
        completedCount++;
        if(completedCount === numLogs) {
          process.stdout.write('100%\n');
        } else {
          process.stdout.write(`     ${((completedCount / numLogs) * 100).toFixed(2)}%\r`);
        }
        return res;
      });
    });
    await Promise.all(logInfoPromises);
  }
}

async function logToCsv(logInfo: LogInfo) {
  let csvWriter: CsvWriter;

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
      let tryParsed: parsePing.ParsedLogLine | void, parsedLogLine: parsePing.ParsedLogLine
      let uri, time_stamp, ping_ms;
      tryParsed = parsePing.parseLogLine(line);
      if(tryParsed !== undefined) {
        parsedLogLine = (tryParsed as parsePing.ParsedLogLine);
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

async function getConvertableLogs(logInfos: LogInfo[]) {
  let convertableLogs: LogInfo[];
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

function getLogInfos(logFilePaths: string[]) {
  let logInfos: LogInfo[];
  //dedupe
  logFilePaths = [ ...(new Set(logFilePaths)) ];
  logInfos = logFilePaths.map(logFilePath => {
    let parsedPath, fileName, csvPath;
    let datePart, timePart;
    let month, day, year, hours,
      minutes;
    let logDate, logStamp;
    let logInfo: LogInfo;
    parsedPath = path.parse(logFilePath);
    fileName = parsedPath.name;
    [ datePart, timePart ] = fileName.split('_').slice(0, 2);
    [ month, day, year ] = datePart.split('-').map(val => +val);
    [ hours, minutes ] = timePart.split(':').map(val => +val);
    month = month - 1;
    logDate = new Date(year, month, day, hours, minutes);
    logStamp = logDate.valueOf();
    csvPath = path.join(CSV_LOG_DIR, `${fileName}.csv`);
    logInfo = {
      filePath: logFilePath,
      fileName,
      date: logDate,
      time_stamp: logStamp,
      csvPath,
    };
    return logInfo;
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
