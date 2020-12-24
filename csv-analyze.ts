
import os from 'os';
import fs, { ReadStream } from 'fs';

import csvParse, { Parser } from 'csv-parse';
import streamTransform, { Transformer as StreamTransformer, Handler } from 'stream-transform';
import sourceMapSupport from 'source-map-support';

sourceMapSupport.install();

import {
  PERIOD_TYPES,
  LOG_TYPES,
  TIME_STAMP_HEADER,
  PING_MS_HEADER,
} from './constants';
import { IntervalBucket, PeriodAggregator } from './analyze-data/period-aggregate';
import { writePeriodStats } from './analyze-data/write-data';
import { chunk } from './array-util';
import * as parsePing from './parse-data/parse-ping';
import { writeProgress } from './print';
import { PingAggregator } from './analyze-data/ping-aggregator';
import { getLogInfos } from './parse-data/csv-convert';

type CsvParserFn = (csvPath: string | streamTransform.Handler, recordCb?: streamTransform.Handler) => Promise<unknown>;

const CSV_PATH = `${__dirname}/log.csv`;
const NUM_CPUS = os.cpus().length;

const CSV_CHUNK_SIZE = Math.round(
  // NUM_CPUS * 3
  // NUM_CPUS * Math.E
  // NUM_CPUS * Math.LOG2E
  // 1
  NUM_CPUS - 1
  // NUM_CPUS - 2
  // NUM_CPUS / 2
  // 1e6
  // NUM_CPUS * 2
  // NUM_CPUS
  // NUM_CPUS / 4
);
console.log(`NUM_CPUS: ${NUM_CPUS}`);
console.log(`CSV_CHUNK_SIZE: ${CSV_CHUNK_SIZE}`);

const DO_COALESCE = true;
// const PING_FILTER_MIN = 150;
const PING_FILTER_MIN = 1;

let MINUTE_PERIOD_GROUP_BY: number, SECONDS_PERIOD_GROUP_BY: number, DAYS_TO_INCLUDE: number;

DAYS_TO_INCLUDE = 1;
// DAYS_TO_INCLUDE = 3;
// DAYS_TO_INCLUDE = 7;
// DAYS_TO_INCLUDE = 14;
// DAYS_TO_INCLUDE = 30;
// DAYS_TO_INCLUDE = Math.round((Date.now() - (new Date('10/24/2020').valueOf())) / 1000 / 60 / 60 / 24); // new internet
// DAYS_TO_INCLUDE = 60;
// DAYS_TO_INCLUDE = 240;
// DAYS_TO_INCLUDE = 480;

// MINUTE_PERIOD_GROUP_BY = 1;
// MINUTE_PERIOD_GROUP_BY = 2;
MINUTE_PERIOD_GROUP_BY = 3;
// MINUTE_PERIOD_GROUP_BY = 5;
// MINUTE_PERIOD_GROUP_BY = 10;
// MINUTE_PERIOD_GROUP_BY = 15;
// MINUTE_PERIOD_GROUP_BY = 30;

// SECONDS_PERIOD_GROUP_BY = 1;
// SECONDS_PERIOD_GROUP_BY = 3;
// SECONDS_PERIOD_GROUP_BY = 5;
// SECONDS_PERIOD_GROUP_BY = 10;
// SECONDS_PERIOD_GROUP_BY = 15;
// SECONDS_PERIOD_GROUP_BY = 30;

(async () => {
  try {
    await main();
  } catch(e) {
    console.log(e);
  }
})();

async function main() {
  let periodAggegator: PingAggregator<IntervalBucket>;
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
    await aggregateMultiCsvData(parseCsv, CSV_CHUNK_SIZE)
  ));

  endMs = Date.now();

  process.stdout.write('\n');

  deltaS = +((endMs - startMs) / 1000).toFixed(3);
  pingAvg = +(pingSum / numPings).toFixed(3);
  percentFailed = +(numFailed / (numTotal + numFailed)).toFixed(3);

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
  filterPingMs = (pingAvg > PING_FILTER_MIN) ? pingAvg * Math.LOG2E : PING_FILTER_MIN;
  filterFailPercent = 20;
  writePeriodStats(periodAggegator, {
    // doFilter: true,
    doFilter: false,
    filterPingMs,
    filterFailPercent,
  });
}

async function aggregateMultiCsvData(csvParserFn: CsvParserFn, csvChunkSize: number) {
  let periodAggegator: PingAggregator<IntervalBucket>, numTotal: number,
    pingSum: number, numPings: number, numFailed: number;
  let logEntries, logInfos, csvFilePaths, csvFileChunks;
  let logFilesComplete: number, logFilesTotal: number;
  let today: Date, daysToInclude: number;

  today = new Date;
  daysToInclude = DAYS_TO_INCLUDE;

  pingSum = 0;
  numPings = 0;
  numFailed = 0;
  numTotal = 0;
  if(SECONDS_PERIOD_GROUP_BY !== undefined) {
    periodAggegator = new PeriodAggregator(PERIOD_TYPES.SECOND, SECONDS_PERIOD_GROUP_BY, DO_COALESCE);
  } else {
    periodAggegator = new PeriodAggregator(PERIOD_TYPES.MINUTE, MINUTE_PERIOD_GROUP_BY, DO_COALESCE);
  }

  logEntries = await parsePing.getLogLedgerEntries();
  logInfos = await getLogInfos(logEntries);
  logInfos = logInfos.filter(logInfo => {
    let deltaMs: number, deltaDays: number;
    deltaMs = today.getTime() - logInfo.date.getTime();
    deltaDays = deltaMs / (1000 * 60 * 60 * 24);
    return deltaDays <= daysToInclude;
  });

  csvFilePaths = logInfos.map(logInfo => {
    return DO_COALESCE ? logInfo.coalescedCsvPath : logInfo.csvPath;
  });

  logFilesComplete = 0;
  logFilesTotal = csvFilePaths.length;

  csvFileChunks = chunk(csvFilePaths, csvChunkSize);

  for(let i = 0, currChunk; i < csvFileChunks.length, currChunk = csvFileChunks[i]; ++i) {
    let chunkPromises;
    // let chunkLogLines: parsePing.ParsedLogLine[];
    // chunkLogLines = [];

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
        }
        if(DO_COALESCE) {
          if((typeof rowObj.failed) === 'number') {
            numFailed += rowObj.failed;
          }
        } else if(((typeof rowObj.ping_ms) === 'string') && (rowObj.ping_ms === 'FAIL')) {
          numFailed++;
        }
        // chunkLogLines.push(rowObj as parsePing.ParsedLogLine);
        periodAggegator.aggregate(rowObj as parsePing.ParsedLogLine);
      }).then(res => {
        logFilesComplete++;
        writeProgress(logFilesComplete, logFilesTotal);
        return res;
      });
    });

    await Promise.all(chunkPromises);

    // chunkLogLines.forEach(logLine => {
    //   periodAggegator.aggregate(logLine);
    // });
  }
  return {
    periodAggegator,
    pingSum,
    numPings,
    numFailed,
    numTotal,
  };
}

export function parseCsv(csvPath: string|Handler, recordCb?: Handler) {
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
  let timeStamp: string, pingMs: number, isFailLog: boolean, failedCount: number,
    total_ms: number;
  timeStamp = rowObj[TIME_STAMP_HEADER];
  pingMs = rowObj[PING_MS_HEADER];
  failedCount = rowObj.failed;
  total_ms = rowObj.total_ms;
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
  if(!isNaN(+failedCount)) {
    rowObj.failed = +failedCount;
  }
  if(!isNaN(+total_ms)) {
    rowObj.total_ms = +total_ms;
  }
  return rowObj;
}
