
import fs, { WriteStream } from 'fs';
import { CsvWriter, getCsvWriter } from '../analyze-data/write-data';
import {
  PING_TARGETS,
  LOG_TYPES,
  logDir,
  CSV_LOG_DIR,
} from '../constants';
import { sleep } from '../util/sleep';
import { ping, PingOptions, PingHandler } from './ping-process';
import { getDayStamp, stampLog, endWriteStream, writeLedgerEntry } from './ping-main';
import { exists, mkdirIfNotExist } from '../files';
import { ParsedLogLine, parseLogLine } from '../parse-data/parse-ping';
import { logStackTimer } from './log-printer';

const LOG_FILE_PERIOD_MINUTES = 30;

const WAIT_MS = 200;
const WAIT_SECONDS = (WAIT_MS / 1000);

const LOG_STACK_MAX = 1536;

const DEFAULT_PING_OPTS: PingOptions = {
  uri: '',
  wait: WAIT_SECONDS,
  // ttl: 50,
  bytes: (56 + 8) + (8 * 80),
};

const CSV_LOG_FILE_HEADERS = [
  'time_stamp',
  'uri',
  'ping_ms',
];

/*
  writes logs simulatneously to the v1 logs dir, but also appends csv logs directly
*/

export async function pingMainV2() {
  let doLog: boolean, doStop: boolean, stopCb: () => boolean;
  let killCallbacks: (() => void)[];
  let logFileName: string;
  let csvWriter: CsvWriter, logWs: WriteStream;
  let logData: (ParsedLogLine | void)[], lastTime: number;
  doStop = false;
  stopCb = () => {
    return doStop;
  };
  doLog = false;
  logData = [];
  lastTime = Date.now();

  while(!stopCb()) {
    if(!doLog) {
      doLog = true;
      if(Array.isArray(killCallbacks)) {
        killCallbacks.forEach(fn => fn());
      }
      if(logWs !== undefined) {
        await endWriteStream(logWs);
      }
      if(csvWriter !== undefined) {
        await csvWriter.end();
      }

      logStackTimer(stopCb, () => {
        let now: number;
        now = Date.now();
        if(logData.length > LOG_STACK_MAX) {
          logData = logData.slice(Math.round(LOG_STACK_MAX * 0.0625));
        }
        // console.log(`\n${logData.length}`);
        if((now - lastTime) > (5 * 1000)) {
          lastTime = now;
        }
        return logData;
      });

      logFileName = `${getLogFileName()}`;
      logWs = await initLogWs(logFileName);
      csvWriter = await initCsvWriter(logFileName);

      killCallbacks = await initPings((data, uri) => {
        let dataStr: string, logStr: string, tryParsed: ParsedLogLine | void, parsedLog: ParsedLogLine;
        let time_stamp: string, ping_ms: string | number;
        dataStr = data.toString().trim();
        logStr = stampLog(`${uri} ${dataStr}`);
        if(logWs.writable) {
          logWs.write(`${logStr}\n`);
        }
        tryParsed = parseLogLine(logStr);
        if(tryParsed !== undefined) {
          parsedLog = (tryParsed as ParsedLogLine);
          time_stamp = parsedLog.time_stamp;
          ping_ms = (parsedLog.type === LOG_TYPES.SUCCESS)
            ? parsedLog.ping_ms
            : LOG_TYPES.FAIL
          ;
          csvWriter.write([
            time_stamp,
            parsedLog.uri,
            ping_ms,
          ]);
        }
        logData.push(parsedLog);
      });
    } else {
      const shouldMakeNewLog = logFileName !== getLogFileName();
      if(shouldMakeNewLog) {
        doLog = false;
      } else {
        await sleep(100);
      }
    }
  }

  if(Array.isArray(killCallbacks)) {
    killCallbacks.forEach(fn => fn());
  }
  if(csvWriter !== undefined) {
    await csvWriter.end();
  }
}

async function initLogWs(logFileName: string): Promise<WriteStream> {
  let logFilePath: string, logFileExists: boolean, logWs: WriteStream;
  logFilePath = `${logDir}/${logFileName}.txt`;
  await mkdirIfNotExist(logDir);
  logFileExists = await exists(logFilePath);
  if(!logFileExists) {
    // write to the ledger
    await writeLedgerEntry(logFilePath);
  }
  logWs = fs.createWriteStream(logFilePath, {
    flags: 'a',
  });
  return logWs;
}

async function initCsvWriter(logFileName: string): Promise<CsvWriter> {
  let csvLogFilePath: string, logFileExists: boolean, csvWriter: CsvWriter;
  csvLogFilePath = `${CSV_LOG_DIR}/${logFileName}.csv`;
  await mkdirIfNotExist(CSV_LOG_DIR);
  logFileExists = await exists(csvLogFilePath);
  csvWriter = await getCsvWriter(csvLogFilePath, {
    flags: 'a',
  });
  if(!logFileExists) {
    // if it doesn't exist, write the headers first
    csvWriter.write(CSV_LOG_FILE_HEADERS);
  }

  return csvWriter;
}

function getLogFileName() {
  return `${getDayStamp(LOG_FILE_PERIOD_MINUTES)}_ping-log`;
}

async function initPings(pingHandler: PingHandler): Promise<(() => void)[]> {
  let pingPromises: Promise<() => void>[], killCallbacks: (() => void)[];
  pingPromises = [];
  for(let i = 0, currTarget: string; currTarget = PING_TARGETS[i], i < PING_TARGETS.length; ++i) {
    pingPromises.push(startPing(currTarget, pingHandler));
    await sleep(Math.round(WAIT_MS / PING_TARGETS.length));
  }
  killCallbacks = await Promise.all(pingPromises);
  return killCallbacks;
}

function startPing(pingTarget: string, pingHandler: PingHandler) {
  let pingOpts: PingOptions;
  pingOpts = Object.assign({}, DEFAULT_PING_OPTS, {
    uri: pingTarget,
  });
  return ping(pingOpts, pingHandler);
}
