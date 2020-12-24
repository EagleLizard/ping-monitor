
import fs, { WriteStream } from 'fs';

import * as files from '../files';
import {
  logDir,
  LOG_LEDGER_PATH,
  PING_TARGETS,
} from '../constants';
import { ParsedLogLine, parseLogLine } from '../parse-data/parse-ping';
import { padTime } from '../date-service';
import { logStackTimer } from './log-printer';
import { sleep } from '../util/sleep';
import {
  ping,
  PingOptions,
} from './ping-process';

const pingTargets: string[] = [];
Array(1).fill(0).map(() => 0).forEach(() => {
  PING_TARGETS.forEach(pingTarget => {
    pingTargets.push(pingTarget);
  });
});

const WAIT_MS = 200;
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
const LOG_STACK_MAX = 1536;
// const LOG_STACK_MAX = 2048;
// const LOG_STACK_MAX = 3072;

export async function pingMain() {
  await files.mkdirIfNotExist(logDir);
  await multiPing(pingTargets, () => {
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
        await sleep(500);
      }
    }
  }
}

export async function endWriteStream(writeStream: WriteStream) {
  return new Promise<void>((resolve, reject) => {
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

export function writeLedgerEntry(logFilePath: string) {
  return new Promise<void>((resolve, reject) => {
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

export function getDayStamp(roundMinutes: number) {
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

export function stampLog(toPrint: string) {
  let time;
  time = (new Date).toISOString();
  return `${time} ${toPrint}`;
}
