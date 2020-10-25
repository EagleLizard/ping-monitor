
import child_process from 'child_process';
import fs, { WriteStream } from 'fs';

import * as files from '../files';
import {
  logDir,
  LOG_LEDGER_PATH,
} from '../constants';
import { ParsedLogLine, parseLogLine } from '../parse-data/parse-ping';
import { padTime } from '../date-service';
import { logStackTimer } from './log-printer';

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

// const LOG_STACK_MAX = 256;
// const LOG_STACK_MAX = 512;
// const LOG_STACK_MAX = 1024;
// const LOG_STACK_MAX = 2048;
const LOG_STACK_MAX = 3072;

export async function pingMain() {
  await files.mkdirIfNotExist(logDir);
  await multiPing(PING_TARGETS, () => {
    return false;
  });
}

async function multiPing(pingTargets: string[], stopCb: () => boolean) {
  let doStop;
  let doLog;
  let currLogStart, currLogCheck, logStartMinuteRemainder, currLogDelta,
    currLogStartRoundMinutes;
  let logFilePath: string, pingPromises: Promise<(() => void)>[], pingPromise: Promise<(() => void)>;
  let killFns: (() => void)[];
  let logWs: WriteStream;
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

      if(Array.isArray(killFns)) {
        killFns.forEach(killFn => killFn());
      }
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

      pingPromises = [];
      for(let i = 0, currTarget: string; currTarget = pingTargets[i], i < pingTargets.length; ++i) {
        let pingOpts;
        pingOpts = Object.assign({}, DEFAULT_PING_OPTS, {
          uri: currTarget,
        });
        pingPromise = ping(pingOpts, pingHandler(logWs, logStr => {
          logData.push(parseLogLine(logStr));
        }));
        pingPromises.push(pingPromise);
        await sleep(Math.round(WAIT_MS / pingTargets.length));
      }
      try {
        killFns = await Promise.all(pingPromises);
      } catch(e) {
        console.log(`Error writing logs in: ${logFilePath}`);
        console.log(e);
        throw e;
      }
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
      } else {
        await sleep(1000);
      }
    }
  }
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

function ping(options: PingOptions, cb: (data: any, uri: string) => any): Promise<() => void> {
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
      resolve(() => {
        pingProcess.kill();
      });
      return cb(data, uri);
    });

    pingProcess.on('error', err => {
      reject(err);
    });

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

async function sleep(ms: number) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}
