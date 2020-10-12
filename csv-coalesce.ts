
import { createReadStream, ReadStream } from 'fs';
import os from 'os';
import path from 'path';

import csvParse, { Parser } from 'csv-parse';
import csvTransform, { Handler, Transformer as StreamTransformer } from 'stream-transform';
import { getLogInfos, LogInfo, getLogPaths, getConvertableLogs } from './parse-data/csv-convert';
import { CoalesceAggregator, CoalesceBucket } from './analyze-data/coalesce-aggregate';
import { ParsedLogLine } from './parse-data/parse-ping';
import { CsvWriter, getCsvWriter } from './analyze-data/write-data';

import {
  TIME_STAMP_HEADER,
  PING_MS_HEADER,
  LOG_TYPES,
  COALESCED_LOG_DIR,
} from './constants';
import { chunk } from './array-util';
import { writeProgress } from './print';
import { mkdirIfNotExist } from './files';

const NUM_CPUS = os.cpus().length;

const CSV_CHUNK_SIZE = Math.round(
  // NUM_CPUS * Math.LOG2E
  NUM_CPUS - 2
);

(async () => {
  try {
    await main();
  } catch(e) {
    console.log(e);
  }
})();

async function main() {
  let filePaths: string[], logInfos: LogInfo[], convertableLogs: LogInfo[];
  let startMs: number, endMs: number, deltaS: number;
  let heapTotalMb: number, externalMb: number, totalMb: number;

  await mkdirIfNotExist(COALESCED_LOG_DIR);

  startMs = Date.now();

  filePaths = await getLogPaths();
  logInfos = await getLogInfos(filePaths);
  convertableLogs = await getConvertableLogs(logInfos, true);
  // console.log(convertableLogs);
  await coalesce(convertableLogs);

  endMs = Date.now();

  deltaS = +((endMs - startMs) / 1000).toFixed(3);

  console.log(`\nCSV Coalesce took ${deltaS}s`);

  heapTotalMb = Math.round(process.memoryUsage().heapTotal / 1024 / 1024);
  externalMb = Math.round(process.memoryUsage().external / 1024 / 1024);
  totalMb = heapTotalMb + externalMb;
  console.log(`Process used ${heapTotalMb}mb of heap memory`);
  console.log(`Process used ${externalMb}mb of external memory`);
  console.log(`Process used ${totalMb}mb of total memory`);
}

export async function coalesce(logsToConvert: LogInfo[]) {
  let logChunks: LogInfo[][], totalCount: number, completedCount: number;
  let parsePromise: Promise<unknown>, parsePromises: Promise<unknown>[];

  logChunks = chunk(logsToConvert, CSV_CHUNK_SIZE);
  totalCount = logsToConvert.length;
  completedCount = 0;

  parsePromises = [];

  for(let i = 0, currChunk: LogInfo[]; currChunk = logChunks[i], i < logChunks.length; ++i) {
    for(let k = 0, currLog: LogInfo; currLog = currChunk[k], k < currChunk.length; ++k) {
      parsePromise = parseCsvFile(currLog.csvPath).then((res) => {
        let csvPath: string, aggregator: CoalesceAggregator;
        [ csvPath, aggregator ] = res;
        completedCount++;
        writeProgress(completedCount, totalCount);
        return writeCoalesceCsv(csvPath, aggregator);
      });
      parsePromises.push(parsePromise);
    }
    await Promise.all(parsePromises);
  }
}

function writeCoalesceCsv(csvPath: string, aggregator: CoalesceAggregator) {
  return new Promise((resolve) => {
    (async () => {
      let fileName: string, coalescedPath: string;
      let buckets: [ string, CoalesceBucket ][], csvWriter: CsvWriter;
      let coalescedRecords: (string | number)[][];
      buckets = [ ...aggregator.getStats() ];
      buckets.sort((a, b) => {
        let aStamp: number, bStamp: number;
        aStamp = a[1].time_stamp_ms;
        bStamp = b[1].time_stamp_ms;
        if(aStamp < bStamp) {
          return -1;
        } else {
          return 1;
        }
      });
      fileName = csvPath.split('/').pop();
      coalescedPath = path.resolve(COALESCED_LOG_DIR, fileName);
      csvWriter = await getCsvWriter(coalescedPath);
      coalescedRecords = convertCoalescedLogsToRecords(buckets.map(bucket => bucket[1]));
      for(let i = 0, currRecord: (string | number)[]; currRecord = coalescedRecords[i], i < coalescedRecords.length; ++i) {
        csvWriter.write(currRecord);
      }
      await csvWriter.end();
      resolve();
    })();
  });
}

function convertCoalescedLogsToRecords(buckets: CoalesceBucket[]): (string | number)[][] {
  let headers: string[], records: (string | number)[][];
  headers = [ 'time_stamp', 'ping_ms', 'ping_count', 'failed' ];
  buckets = buckets.slice();
  buckets.sort((a, b) => {
    let aStamp: number, bStamp: number;
    aStamp = a.time_stamp_ms;
    bStamp = b.time_stamp_ms;
    if(aStamp < bStamp) {
      return -1;
    } else {
      return 1;
    }
  });
  records = buckets.reduce((acc, curr) => {
    let time_stamp: string, ping_ms: number, ping_count: number,
      failed: number;
    time_stamp = curr.time_stamp;
    ping_ms = +(curr.pingTotal / curr.pingCount).toFixed(6);
    ping_count = curr.pingCount;
    failed = curr.failedCount;
    return [ ...acc, [
      time_stamp,
      ping_ms,
      ping_count,
      failed,
    ]];
  }, []);
  return [ headers, ...records ];
}

function parseCsvFile(csvPath: string): Promise<[ string, CoalesceAggregator ]> {
  return new Promise((resolve, reject) => {
    let csvRs: ReadStream, csvParser: Parser, csvTransformer: StreamTransformer;
    let recordCb: Handler, coalesceAggregator: CoalesceAggregator;
    let headers: string[], currRowIdx: number;
    currRowIdx = 0;

    coalesceAggregator = new CoalesceAggregator;

    recordCb = (record: any[]) => {
      let rowObj: { [key: string]: any};
      if(currRowIdx++ === 0) {
        headers = record;
        return;
      }
      rowObj = convertRow(headers, record);
      rowObj = convertData(rowObj);
      coalesceAggregator.aggregate(rowObj as ParsedLogLine);
      // console.log(record);
    };

    csvRs = createReadStream(csvPath);

    csvRs.on('error', err => {
      return reject(err);
    });

    csvParser = csvParse();

    csvParser.on('end', () => resolve([
      csvPath,
      coalesceAggregator
    ]));

    csvTransformer = csvTransform(recordCb);

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
  // isFailLog = ((typeof pingMs === 'string') && (pingMs === 'FAIL'));
  isFailLog = ((typeof pingMs === 'string') && (pingMs === 'FAIL'));
  rowObj.type = isFailLog
    ? LOG_TYPES.FAIL
    : LOG_TYPES.SUCCESS;
  return rowObj;
}
