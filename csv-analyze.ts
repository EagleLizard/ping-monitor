
import os from 'os';
import path from 'path';
import fs, { ReadStream } from 'fs';

import csvParse, { Parser } from 'csv-parse';
import streamTransform, { Transformer as StreamTransformer, Handler } from 'stream-transform';
import sourceMapSupport from 'source-map-support';

sourceMapSupport.install();

import {
  PERIOD_TYPES,
  LOG_TYPES,
  CSV_LOG_DIR,
  CSV_ANALYZE_ARGS,
} from './constants';
import { getPeriodAggregator, PeriodAggregator } from './analyze-data/period-aggregate';
import { writePeriodStats } from './analyze-data/write-data';
import { chunk } from './array-util';
import * as parsePing from './parse-data/parse-ping';
import { scaleTo } from './math-util';

type CsvParserFn = (csvPath: string | streamTransform.Handler, recordCb?: streamTransform.Handler) => Promise<unknown>;

const CSV_PATH = `${__dirname}/log.csv`;
const TIME_STAMP_HEADER = 'time_stamp';
const PING_MS_HEADER = 'ping_ms';
const NUM_CPUS = os.cpus().length;

const CSV_CHUNK_SIZE = Math.round(
  // NUM_CPUS * Math.E
  NUM_CPUS * Math.LOG2E
  // NUM_CPUS / Math.LOG2E
  // NUM_CPUS / 2
  // NUM_CPUS * 2
  // NUM_CPUS
  // NUM_CPUS - 2
);
console.log(`NUM_CPUS: ${NUM_CPUS}`);
console.log(`CSV_CHUNK_SIZE: ${CSV_CHUNK_SIZE}`);

const PING_FILTER_MIN = 100;
const MINUTE_PERIOD_GROUP_BY = 3;

const CSV_SYNC_ARG = process.argv[2];

(async () => {
  try {
    await main();
  } catch(e) {
    console.log(e);
  }
})();

async function main() {
  let periodAggegator: PeriodAggregator;
  let pingSum: number, numPings: number, numFailed: number, numTotal: number;
  let pingAvg: number, percentFailed: number;
  let startMs: number, endMs: number, deltaS: number;
  let heapTotalMb: number, externalMb: number, totalMb: number;
  let filterPingMs: number, filterFailPercent: number;

  process.stdout.write('\n');

  startMs = Date.now();

  ({
    periodAggegator,
    pingSum,
    numPings,
    numFailed,
    numTotal,
  } = (
    (CSV_SYNC_ARG === CSV_ANALYZE_ARGS.PARSE_SYNC)
      ? (console.log('Synchonous'), (await aggregateCsvData()))
      : await aggregateMultiCsvData(parseCsv, CSV_CHUNK_SIZE)
  ));

  endMs = Date.now();

  process.stdout.write('\n');

  deltaS = +((endMs - startMs) / 1000).toFixed(3);
  pingAvg = +(pingSum / numPings).toFixed(3);
  percentFailed = +(numFailed / numTotal).toFixed(3);

  console.log(`\nCSV Analyze took ${deltaS}s`);
  console.log('');
  // console.log(`numPings: ${numPings}`);
  // console.log(`pingSum: ${pingSum}`);
  // console.log(`numFailed: ${numFailed}`);
  // console.log('');
  console.log(`Average ping: ${pingAvg}ms`);
  console.log(`Percent failed: ${percentFailed}%`);
  console.log('');

  heapTotalMb = Math.round(process.memoryUsage().heapTotal / 1024 / 1024);
  externalMb = Math.round(process.memoryUsage().external / 1024 / 1024);
  totalMb = heapTotalMb + externalMb;
  console.log(`Process used ${heapTotalMb}mb of heap memory`);
  console.log(`Process used ${externalMb}mb of external memory`);
  console.log(`Process used ${totalMb}mb of total memory`);
  filterPingMs = (PING_FILTER_MIN > 100) ? PING_FILTER_MIN : 100;
  filterFailPercent = 4;
  writePeriodStats(periodAggegator, {
    doFilter: false,
    filterPingMs,
    filterFailPercent,
  });
}

async function aggregateMultiCsvData(csvParserFn: CsvParserFn, csvChunkSize: number) {
  let periodAggegator: PeriodAggregator, numTotal: number,
    pingSum: number, numPings: number, numFailed: number;
  let logEntries, csvFilePaths, csvFileChunks;
  let logFilesComplete: number, logFilesTotal: number;
  pingSum = 0;
  numPings = 0;
  numFailed = 0;
  numTotal = 0;

  periodAggegator = getPeriodAggregator(PERIOD_TYPES.MINUTE, MINUTE_PERIOD_GROUP_BY);

  logEntries = await parsePing.getLogLedgerEntries();
  csvFilePaths = logEntries.map(logEntry => {
    let parsedLogEntry, logName, csvFilePath;
    parsedLogEntry = path.parse(logEntry);
    logName = parsedLogEntry.name;
    csvFilePath = path.join(CSV_LOG_DIR, `${logName}.csv`);
    return csvFilePath;
  });

  logFilesComplete = 0;
  logFilesTotal = csvFilePaths.length;

  csvFileChunks = chunk(csvFilePaths, csvChunkSize);
  for(let i = 0, currChunk; i < csvFileChunks.length, currChunk = csvFileChunks[i]; ++i) {
    let chunkPromises;
    chunkPromises = currChunk.map(csvPath => {
      let currRowIdx: number, headers: string[];
      currRowIdx = 0;
      return csvParserFn(csvPath, record => {
        let rowObj;

        if(currRowIdx++ === 0) {
          headers = record;
          return;
        }
        numTotal++;
        rowObj = convertRow(headers, record);
        rowObj = convertData(rowObj);
        if(((typeof rowObj.ping_ms) === 'number')) {
          pingSum = pingSum + rowObj.ping_ms;
          numPings++;
        } else if(((typeof rowObj.ping_ms) === 'string') && (rowObj.ping_ms === 'FAIL')) {
          numFailed++;
        }
        periodAggegator.aggregate(rowObj);
      }).then(res => {
        logFilesComplete++;
        writeProgress(logFilesComplete, logFilesTotal);
        return res;
      });
    });
    await Promise.all(chunkPromises);
  }
  return {
    periodAggegator,
    pingSum,
    numPings,
    numFailed,
    numTotal,
  };
}

function writeProgress(completedCount: number, total: number) {
  let progressBar: string, doOverwrite: boolean, prefix: string, postfix: string,
    toWrite: string;
  doOverwrite = (completedCount < total);
  prefix = doOverwrite ? '  ' : '';
  // postfix = doOverwrite ? '\r' : '       \n';
  postfix = ` ${((completedCount / total) * 100).toFixed(2)}%`;
  progressBar = getProgressBar(completedCount, total);
  toWrite = `${prefix}${progressBar}${postfix}`;
  process.stdout.clearLine(undefined);  // clear current text
  process.stdout.cursorTo(0);
  process.stdout.write(toWrite);
  process.stdout.cursorTo(0);
}

function getProgressBar(completedCount: number, total: number) {
  let scaledCompleted: number, scaledDiff: number, progressBar: string;
  scaledCompleted = Math.ceil(
    scaleTo(completedCount, [ 0, total ], [ 0, 100 ])
  );
  scaledDiff = 100 - scaledCompleted;
  progressBar = `[${'-'.repeat(scaledCompleted)}${' '.repeat(scaledDiff)}]`;
  return progressBar;
}

async function aggregateCsvData() {
  let periodAggegator: PeriodAggregator, currRowIdx: number, headers: string[], numTotal: number,
    pingSum: number, numPings: number, numFailed: number;
  currRowIdx = 0;
  pingSum = 0;
  numPings = 0;
  numFailed = 0;
  numTotal = 0;

  periodAggegator = getPeriodAggregator(PERIOD_TYPES.MINUTE, MINUTE_PERIOD_GROUP_BY);

  await parseCsv(record => {
    let rowObj;

    if(currRowIdx++ === 0) {
      headers = record;
      return;
    }
    numTotal++;
    rowObj = convertRow(headers, record);
    rowObj = convertData(rowObj);
    if(((typeof rowObj.ping_ms) === 'number')) {
      pingSum = pingSum + rowObj.ping_ms;
      numPings++;
    } else if(((typeof rowObj.ping_ms) === 'string') && (rowObj.ping_ms === 'FAIL')) {
      numFailed++;
    }
    periodAggegator.aggregate(rowObj);
  });
  return {
    periodAggegator,
    pingSum,
    numPings,
    numFailed,
    numTotal,
  };
}

function parseCsv(csvPath: string|Handler, recordCb?: Handler) {
  let _recordCb: Handler, _csvPath: string;
  if((typeof _csvPath) === 'function') {
    _recordCb = (csvPath as Handler);
    _csvPath = CSV_PATH;
  } else {
    _csvPath = (csvPath as string);
    _recordCb = recordCb;
  }
  return new Promise((resolve, reject) => {
    let csvRs: ReadStream, csvParser: Parser, csvTransformer: StreamTransformer;

    csvRs = fs.createReadStream(_csvPath);

    csvRs.on('error', err => {
      reject(err);
    });

    csvParser = csvParse();

    csvParser.on('end', resolve);

    csvTransformer = streamTransform(_recordCb);

    csvRs.pipe(csvParser).pipe(csvTransformer);
  });
}

function convertRow(headers: string[], row: any[]) {
  let rowObj: { [key: string]: any };
  rowObj = {};
  for(let i = 0, currHeader; i < headers.length, currHeader = headers[i]; ++i) {
    rowObj[currHeader] = row[i];
  }
  return rowObj;
}

function convertData(rowObj: { [key: string]: any }) {
  let timeStamp: string, pingMs: number, isFailLog: boolean;
  timeStamp = rowObj[TIME_STAMP_HEADER];
  pingMs = rowObj[PING_MS_HEADER];
  if(timeStamp !== undefined) {
    rowObj[TIME_STAMP_HEADER] = new Date(timeStamp);
  }
  if(!isNaN(+pingMs) && ((typeof pingMs) === 'string') && ((pingMs + '').length > 0)) {
    rowObj[PING_MS_HEADER] = +pingMs;
  }
  isFailLog = ((typeof pingMs === 'string') && (pingMs === 'FAIL'));
  rowObj.type = isFailLog
    ? LOG_TYPES.FAIL
    : LOG_TYPES.SUCCESS;
  return rowObj;
}
