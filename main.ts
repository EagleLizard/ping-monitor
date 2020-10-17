
import child_process from 'child_process';
import fs from 'fs';

import * as files from './files';
import {
  logDir,
  LOG_LEDGER_PATH,
  LOG_TYPES,
  MAIN_ARGS,
} from './constants';
import { padTime } from './date-service';
import { convertLogs } from './parse-data/csv-convert';
import { WriteStream } from 'fs';

import sourceMapSupport from 'source-map-support';
import { ParsedLogLine, parseLogLine } from './parse-data/parse-ping';
import { scaleTo } from './math-util';
sourceMapSupport.install();
const RAW_PING_TARGETS = [
  'www.qualtrics.com',
  'www.github.com',
  'news.ycombinator.com',
  'www.microsoft.com',
  // 'www.usa.gov',
  'www.amazon.com',
  'www.salesforce.com',
  'www.npr.org',
  'www.yahoo.com',
];

const PING_TARGETS: string[] = [];
Array(1).fill(0).map(() => 0).forEach(() => {
  RAW_PING_TARGETS.forEach(pingTarget => {
    PING_TARGETS.push(pingTarget);
  });
});

type PingOptions = {
  uri: string;
  wait?: number;
  ttl?: number;
  bytes: number;
}

const WAIT_MS = 100;
const WAIT_SECONDS = (WAIT_MS / 1000);

const DEFAULT_PING_OPTS: PingOptions = {
  uri: '',
  wait: WAIT_SECONDS,
  // ttl: 50,
  bytes: (56 + 8) + (8 * 80),
};

const LOG_FILE_PERIOD_MINUTES = 30;

const PARSE_ARG = process.argv[2];

(async () => {
  try {
    await main();
  } catch(e) {
    console.log('error:');
    console.log(e);
  }
})();

async function main() {
  switch(PARSE_ARG) {
    case MAIN_ARGS.CONVERT_CSV:
      return convertLogs();
    case MAIN_ARGS.WATCH:
      return watchLogs();
    default:
      return await pingMain();
  }
  // if(PARSE_ARG === MAIN_ARGS.CONVERT_CSV) {
  //   return convertLogs();
  // } else {
  //   return await pingMain();
  // }
}

async function watchLogs() {
  for(;;) {
    await doWatch();
    await sleep(1000 * 15);
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

async function pingMain() {
  await files.mkdirIfNotExist(logDir);
  await multiPing(PING_TARGETS, () => {
    return false;
  });
}

async function sleep(ms: number) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

async function multiPing(pingTargets: string[], stopCb: () => boolean) {
  let doStop;
  let doLog, pingEnd: { value: boolean };
  let currLogStart, currLogCheck, logStartMinuteRemainder, currLogDelta,
    currLogStartRoundMinutes;
  let logFilePath: string, pingPromises: Promise<unknown>[], pingPromise: Promise<unknown>;
  let logWs: WriteStream, pingEndCb: () => { value: boolean };
  let logData: (ParsedLogLine | void)[], lastTime: number;
  // start a log file, keep a ledge of logfile names
  // Periodically check the timestamp, and stop the pings periodically
  // Restart the pings and start over
  doLog = false;
  logData = [];
  lastTime = Date.now();
  while(!(doStop = stopCb())) {
    if(doStop === true) {
      // TODO: teardown
    }
    if(!doLog) {
      doLog = true;
      // deconstruct current writeStream and create a new one
      if(logWs !== undefined) {
        // console.log('ending log writestream');
        await endWriteStream(logWs);
      }
      logFilePath = `${logDir}/${getDayStamp(LOG_FILE_PERIOD_MINUTES)}_ping-log.txt`;
      await writeLedgerEntry(logFilePath);
      logWs = fs.createWriteStream(logFilePath, {
        flags: 'a',
      });

      logStackTimer(stopCb, () => {
        // const LOG_STACK_MAX = 256;
        // const LOG_STACK_MAX = 512;
        // const LOG_STACK_MAX = 1024;
        const LOG_STACK_MAX = 2048;
        let now: number;
        now = Date.now();
        if(logData.length > LOG_STACK_MAX) {
          // logData = logData.slice(Math.round(LOG_STACK_MAX * 0.0625));
          logData = logData.slice(Math.round(LOG_STACK_MAX * 0.0625));
        }
        // console.log(`\n${logData.length}`);
        if((now - lastTime) > (5 * 1000)) {
          lastTime = now;
        }
        return logData;
      });

      pingEnd = { value: false };
      pingEndCb = () => pingEnd;
      pingPromises = [];
      for(let i = 0, currTarget: string; currTarget = pingTargets[i], i < pingTargets.length; ++i) {
        let pingOpts;
        pingOpts = Object.assign({}, DEFAULT_PING_OPTS, {
          uri: currTarget,
        });
        pingPromise = ping(pingOpts, pingHandler(logWs, logStr => {
          logData.push(parseLogLine(logStr));
        }), pingEndCb);
        pingPromises.push(pingPromise);
        await sleep(Math.round(WAIT_MS / pingTargets.length));
      }
      Promise.all(pingPromises)
        .then(() => {
          // console.log(`Finished writing logfile: ${logFilePath}`);
        }).catch(err => {
          console.log(`Error writing logs in: ${logFilePath}`);
          console.log(err);
        });
      currLogStart = new Date;
    } else {
      currLogCheck = new Date;
      logStartMinuteRemainder = currLogStart.getMinutes() % LOG_FILE_PERIOD_MINUTES;
      currLogStartRoundMinutes = ((currLogStart.getMinutes() - logStartMinuteRemainder) < 0)
        ? 0
        : currLogStart.getMinutes() - logStartMinuteRemainder;
      currLogDelta = currLogCheck.getMinutes() - currLogStartRoundMinutes;
      if(
        (currLogCheck.getHours() !== currLogStart.getHours())
        || (currLogDelta >= LOG_FILE_PERIOD_MINUTES)
      ) {
        doLog = false;
        pingEnd.value = true;
      } else {
        await sleep(1000);
      }
    }
  }
}

function logStackTimer(stopCb: () => boolean, getLogDataRef: () => (ParsedLogLine | void)[]) {
  if(stopCb()) {
    return;
  }
  setTimeout(() => {
    let parsedLogLines: ParsedLogLine[], pingSum: number, successPings: number,
      pingAvg: number, toWrite: string, logData: (ParsedLogLine | void)[],
      pingCount: number;
    let logMax: number, logMin: number;
    let pingBarMax: number, pingBarVal: number;
    logData = getLogDataRef();
    parsedLogLines = (logData as ParsedLogLine[]).filter(log => {
      return log !== undefined;
    });
    pingSum = 0;
    successPings = 0;
    pingCount = 0;
    logMax = -1;
    logMin = Infinity;
    parsedLogLines.forEach((logLine, idx) => {
      if(logLine.type !== LOG_TYPES.SUCCESS) {
        return;
      }
      if(logLine.ping_ms > logMax) {
        logMax = logLine.ping_ms;
      }
      if(logLine.ping_ms < logMin) {
        logMin = logLine.ping_ms;
      }
      pingCount++;
      // only include the most recent pings in the avg
      if(idx > (parsedLogLines.length - (parsedLogLines.length * 0.25))) {
        pingSum = pingSum + logLine.ping_ms;
        successPings++;
      }
    });
    pingAvg = pingSum / successPings;
    pingBarMax = 80;
    pingBarVal = scaleTo(pingAvg, [ logMin, logMax ], [ 1, pingBarMax ]);
    toWrite = `  ${(pingCount + '').padStart(5, ' ')} - [ min, max ]:[ ${logMin.toFixed(1).padStart(4, ' ')}, ${logMax.toFixed(1).padStart(4, ' ')} ] ${pingAvg.toFixed(1).padStart(5, ' ')}ms |${'='.repeat(Math.round(pingBarVal)).padEnd(pingBarMax, ' ')}|`;
    process.stdout.clearLine(undefined);  // clear current text
    process.stdout.cursorTo(0);
    process.stdout.write(toWrite);
    process.stdout.cursorTo(0);
    logStackTimer(stopCb, getLogDataRef);
  }, 15);
}

async function endWriteStream(writeStream: WriteStream) {
  return new Promise((resolve, reject) => {
    writeStream.on('error', err => {
      reject(err);
    });

    writeStream.end(() => {
      writeStream.destroy();
    });

    writeStream.on('close', () => {
      resolve();
    });
  });
}

function writeLedgerEntry(logFilePath: string) {
  return new Promise((resolve, reject) => {
    let ledgerWs: WriteStream;
    ledgerWs = fs.createWriteStream(LOG_LEDGER_PATH, {
      flags: 'a'
    });

    ledgerWs.write(`${logFilePath}\n`, () => {
      ledgerWs.end(() => {
        ledgerWs.destroy();
      });
    });

    ledgerWs.on('close', () => {
      resolve();
    });

    ledgerWs.on('error', err => {
      reject(err);
    });

  });
}

function pingHandler(logWs: WriteStream, writeCb?: (log: string) => void): (data: any, uri: string) => any {
  return (data, uri) => {
    let cols, timeCol, timeVal,
      dataStr, outStr;
    // let logStr, timeBar;
    dataStr = data.toString().trim();
    cols = dataStr.split(' ');
    timeCol = cols[cols.length - 2];
    timeVal = timeCol.split('=').pop();
    outStr = stampLog(`${uri} ${dataStr}`);
    if(logWs.writable) {
      logWs.write(`${outStr}\n`);
    }
    if(Number.isNaN(+timeVal)) {
      // logStr = `${stampLog(`${uri} FAIL`)}\n`;
    } else {
      // timeBar = '='.repeat(Math.round(+timeVal));
      // logStr = `${stampLog(`${uri} ${timeVal} ${timeBar}`)}\n`;
    }
    // process.stdout.write(logStr);
    if((typeof writeCb) === 'function') {
      writeCb(outStr);
    }
  };
}

function ping(options: PingOptions, cb: (data: any, uri: string) => any, endCb: () => { value: boolean }) {
  return new Promise((resolve, reject) => {
    let pingProcess: child_process.ChildProcessWithoutNullStreams, args: string[], uri: string, wait: number,
      ttl: number, bytes: number;
    args = [];
    uri = options.uri;
    wait = options.wait || 1;
    ttl = options.ttl;
    bytes = options.bytes;
    if(wait !== undefined) {
      args.push('-i', wait + '');
    }
    if(ttl !== undefined) {
      args.push('-m', ttl + '');
    }
    if(bytes !== undefined) {
      args.push('-s', bytes + '');
    }
    args.push(uri);

    pingProcess = child_process.spawn('ping', args);

    pingProcess.stdout.on('data', data => {
      return cb(data, uri);
    });
    pingProcess.on('exit', code => {
      resolve(code);
    });
    pingProcess.on('error', err => {
      reject(err);
    });

    if((typeof endCb) === 'function') {
      (function checkEnd() {
        setTimeout(() => {
          if(endCb().value === true) {
            pingProcess.kill();
          } else {
            checkEnd();
          }
        }, 500);
      })();
    }
  });
}

function getDayStamp(roundMinutes: number) {
  let date, day, month, year, hours, minutes;
  let roundMinuteRemainder;
  date = new Date;
  year = date.getFullYear();
  day = padTime(date.getDate());
  month = padTime(date.getMonth() + 1);
  hours = padTime(date.getHours());
  minutes = date.getMinutes();
  roundMinuteRemainder = minutes % roundMinutes;
  minutes = minutes - roundMinuteRemainder;
  if(minutes < 0) {
    minutes = 0;
  }
  minutes = padTime(minutes);

  return `${month}-${day}-${year}_${hours}:${minutes}`;
}

function stampLog(toPrint: string) {
  let time;
  time = (new Date).toISOString();
  return `${time} ${toPrint}`;
}
