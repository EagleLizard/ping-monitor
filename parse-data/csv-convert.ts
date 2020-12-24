import os from 'os';
import path, { ParsedPath } from 'path';
import fs, { ReadStream } from 'fs';
import readline from 'readline';

import {
  logDir,
  CSV_LOG_DIR,
  LOG_TYPES,
  COALESCED_LOG_DIR,
} from '../constants';
import * as files from '../files';
import { chunk } from '../array-util';
import { getCsvWriter, CsvWriter } from '../analyze-data/write-data';
import * as parsePing from './parse-ping';
import { writeProgress } from '../print';

const NUM_CPUS = os.cpus().length;
const CHUNK_SIZE = Math.round(
  // 1
  // NUM_CPUS * Math.LOG2E,
  // NUM_CPUS - 1
  // NUM_CPUS / 2
  NUM_CPUS / 4
  // 1
);
let totalLines = 0;

export type LogInfo = {
  filePath: string;
  fileName: string;
  date: Date;
  time_stamp: number;
  csvPath: string;
  coalescedCsvPath: string;
}

type RecordTuple = [ string, string, string | number ];

export {
  convertLogs,
  getLogInfos,
};

async function convertLogs() {
  let startMs: number, endMs: number, deltaS: number, heapTotalMb: number,
    externalMb: number, totalMb: number;
  let filePaths: string[], logInfos: LogInfo[], logsToConvert: LogInfo[];

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
  console.log(`\ncsv CHUNK_SIZE: ${CHUNK_SIZE}`);
  console.log('Aggregator Totals:');
  console.log(`Aggregation took ${deltaS}s`);
  console.log(`Process used ${heapTotalMb}mb of heap memory`);
  console.log(`Process used ${externalMb}mb of heap memory`);
  console.log(`Process used ${totalMb}mb of total memory`);
  console.log(`total rows: ${totalLines}`);
}

async function logsToCsv(logInfos: LogInfo[]) {
  let numLogs: number, completedCount: number;
  let infoChunks: LogInfo[][];
  numLogs = logInfos.length;
  completedCount = 0;
  infoChunks = chunk(logInfos, CHUNK_SIZE);
  for(let i = 0, currChunk; i < infoChunks.length, currChunk = infoChunks[i]; ++i) {
    let logInfoPromises: Promise<unknown>[];

    logInfoPromises = currChunk.map(logInfo => {
      return logToCsv(logInfo).then(res => {
        completedCount++;
        writeProgress(completedCount, numLogs);
        return res;
      });
    });
    await Promise.all(logInfoPromises);
  }
}

async function logToCsv(logInfo: LogInfo) {
  let csvWriter: CsvWriter, records: RecordTuple[];

  csvWriter = await getCsvWriter(logInfo.csvPath);
  csvWriter.write([ 'time_stamp', 'uri', 'ping_ms' ]);

  // return parseLogFileLineReader(logInfo, csvWriter);

  // records = await parseLogFileLineReader(logInfo);
  records = await parseLogFile(logInfo);

  // for(let i = 0, currRecord: RecordTuple; currRecord = records[i], i < records.length; ++i) {
  while(records.length > 0) {
    const currRecord = records.pop();
    csvWriter.write(currRecord);
  }
  return csvWriter.end();
}

function parseLogFileLineReader(logInfo: LogInfo, csvWriter: CsvWriter): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let logRs: ReadStream, lineReader: readline.Interface;

    logRs = fs.createReadStream(logInfo.filePath);
    logRs.on('error', err => {
      reject(err);
    });

    lineReader = readline.createInterface({
      input: logRs,
    });
    lineReader.on('line', logLine => {
      totalLines++;
      let tryParsed: parsePing.ParsedLogLine | void, parsedLogLine: parsePing.ParsedLogLine;
      let uri: string, time_stamp: string, ping_ms: string | number;
      tryParsed = parsePing.parseLogLine(logLine);
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

async function parseLogFile(logInfo: LogInfo): Promise<RecordTuple[]> {
  let records: RecordTuple[];
  let logFileData: string, logLines: string[];

  records = [];

  logFileData = (await files.readFile(logInfo.filePath)).toString();
  logLines = logFileData.split('\n');
  // logLines.reverse();

  // for(let i = 0, logLine: string; logLine = logLines[i], i < logLines.length; ++i) {
  while(logLines.length > 0) {
    const logLine = logLines.pop();
    let tryParsed: parsePing.ParsedLogLine | void, parsedLogLine: parsePing.ParsedLogLine;
    let uri: string, time_stamp: string, ping_ms: string | number;
    tryParsed = parsePing.parseLogLine(logLine);
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
      records.push([ time_stamp, uri, ping_ms ]);
    }
  }
  return records;
}

export async function getConvertableLogs(logInfos: LogInfo[], coalesced?: boolean) {
  let convertableLogs: LogInfo[], pathToTest: string;
  if(coalesced === undefined) {
    coalesced = false;
  }
  convertableLogs = [];
  for(let i = 0, currLogInfo; i < logInfos.length, currLogInfo = logInfos[i]; ++i) {
    // always convert the last entry
    if(i === (logInfos.length - 1)) {
      convertableLogs.push(currLogInfo);
      continue;
    }
    // always convert the last 10 entries
    if(i > (logInfos.length - 10)) {
      convertableLogs.push(currLogInfo);
      continue;
    }
    pathToTest = coalesced ? currLogInfo.coalescedCsvPath : currLogInfo.csvPath;
    if(!(await files.exists(pathToTest))) {
      convertableLogs.push(currLogInfo);
    }
  }
  return convertableLogs;
}

export async function getLogPaths() {
  let filePaths: string[];
  filePaths = await files.getDirFilePaths(logDir);
  return filePaths;
}

function getLogInfos(logFilePaths: string[]) {
  let logInfos: LogInfo[];
  //dedupe
  logFilePaths = [ ...(new Set(logFilePaths)) ];
  logInfos = logFilePaths.map(logFilePath => {
    let parsedPath: ParsedPath, fileName: string, csvPath: string, coalescedCsvPath: string;
    let datePart: string, timePart: string;
    let month: number, day: number, year: number, hours: number,
      minutes: number;
    let logDate: Date, logStamp: number;
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
    coalescedCsvPath = path.join(COALESCED_LOG_DIR, `${fileName}.csv`);

    logInfo = {
      filePath: logFilePath,
      fileName,
      date: logDate,
      time_stamp: logStamp,
      csvPath,
      coalescedCsvPath,
    };
    return logInfo;
  });
  logInfos.sort((a, b) => {
    let aStamp: number, bStamp: number;
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
