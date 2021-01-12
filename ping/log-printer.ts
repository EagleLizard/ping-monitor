
import {
  LOG_TYPES,
} from '../constants';
import { scaleTo } from '../math-util';
import { ParsedLogLine } from '../parse-data/parse-ping';

export function logStackTimer(stopCb: () => boolean, getLogDataRef: () => (ParsedLogLine | void)[]) {
  const FAIL_INTERVAL = 200;
  const SLIDING_WINDOW_MOD = 0.25;
  if(stopCb()) {
    return;
  }
  setTimeout(() => {
    let parsedLogLines: ParsedLogLine[], pingSum: number, successPings: number,
      pingAvg: number, logData: (ParsedLogLine | void)[],
      pingCount: number;
    let logMax: number, logMin: number, failMax: number, failMin: number;
    let failWindow: ParsedLogLine[], failTotal: number, failPercent: number,
      failWindowTotal: number;
    let pingBarMax: number, pingBarVal: number, failBarMax: number, failBarVal: number,
      failBar: string;
    let latencyOut: string, failOut: string;
    logData = getLogDataRef();
    parsedLogLines = (logData as ParsedLogLine[]).filter(log => {
      return log !== undefined;
    });
    pingCount = 0;
    successPings = 0;
    /*
    Measure Success
    */
    pingSum = 0;
    logMax = -1;
    logMin = Infinity;
    // for(let idx = 0, logLine: ParsedLogLine; logLine = parsedLogLines[idx], idx < parsedLogLines.length; ++idx) {
    //   if(logLine.type !== LOG_TYPES.SUCCESS) {
    //     return;
    //   }
    //   if(logLine.ping_ms > logMax) {
    //     logMax = logLine.ping_ms;
    //   }
    //   if(logLine.ping_ms < logMin) {
    //     logMin = logLine.ping_ms;
    //   }
    //   pingCount++;
    //   // only include the most recent pings in the avg
    //   if(idx > (parsedLogLines.length - (parsedLogLines.length * SLIDING_WINDOW_MOD))) {
    //     pingSum = pingSum + logLine.ping_ms;
    //     successPings++;
    //   }
    // }
    parsedLogLines.forEach((logLine, idx) => {
      // console.log(logLine.type);
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
      if(idx > (parsedLogLines.length - (parsedLogLines.length * SLIDING_WINDOW_MOD))) {
        pingSum = pingSum + logLine.ping_ms;
        successPings++;
      }
    });

    /*
    Measure Failure
    */
    failWindow = [];
    failTotal = 0;
    failWindowTotal = 0;
    failMax = -1;
    failMin = Infinity;
    // for(let idx = 0, logLine: ParsedLogLine; logLine = parsedLogLines[idx], idx < parsedLogLines.length; ++idx) {
    //   let failCount: number, windowFailPercent: number;
    //   if(idx > (parsedLogLines.length - (parsedLogLines.length * SLIDING_WINDOW_MOD))) {
    //     failWindowTotal++;
    //     if(logLine.type === LOG_TYPES.FAIL) {
    //       failTotal++;
    //     }
    //   }
    //   if(((idx + 1) % FAIL_INTERVAL) === 0) {
    //     failWindow = [];
    //   }
    //   failCount = failWindow.reduce((acc, curr) => {
    //     return acc + ((curr.type === LOG_TYPES.FAIL) ? 1 : 0);
    //   }, 0);
    //   windowFailPercent = (failCount / failWindow.length) * 100;
    //   if(windowFailPercent > failMax) {
    //     failMax = windowFailPercent;
    //   }
    //   if(windowFailPercent < failMin) {
    //     failMin = windowFailPercent;
    //   }
    //   failWindow.push(logLine);
    // }
    parsedLogLines.forEach((logLine, idx) => {
      let failCount: number, windowFailPercent: number;
      if(idx > (parsedLogLines.length - (parsedLogLines.length * SLIDING_WINDOW_MOD))) {
        failWindowTotal++;
        if(logLine.type === LOG_TYPES.FAIL) {
          failTotal++;
        }
      }
      if(((idx + 1) % FAIL_INTERVAL) === 0) {
        failWindow = [];
      }
      failCount = failWindow.reduce((acc, curr) => {
        return acc + ((curr.type === LOG_TYPES.FAIL) ? 1 : 0);
      }, 0);
      windowFailPercent = (failCount / failWindow.length) * 100;
      if(windowFailPercent > failMax) {
        failMax = windowFailPercent;
      }
      if(windowFailPercent < failMin) {
        failMin = windowFailPercent;
      }
      failWindow.push(logLine);
    });

    pingAvg = pingSum / successPings;
    pingBarMax = 65;
    failBarMax = 60;
    failPercent = ((failTotal / failWindowTotal) * 100) || 0;
    failBarVal = scaleTo(failPercent, [ 0, 100 ], [ 1, failBarMax ]);
    pingBarVal = scaleTo(pingAvg, [ logMin, logMax ], [ 1, pingBarMax ]);
    try {
      failBar = (!isFinite(failBarVal) || isNaN(failBarVal) || failBarVal < 1)
        ? ''
        : '.'.repeat(Math.round(failBarVal));
    } catch(e) {
      console.log('failBarVal');
      console.log(failBarVal);
      throw e;
    }
    latencyOut = `  ${(pingCount + '').padStart(5, ' ')} - [ min, max ]:[ ${logMin.toFixed(1).padStart(4, ' ')}, ${logMax.toFixed(1).padStart(4, ' ')} ] ${pingAvg.toFixed(1).padStart(5, ' ')}ms |${'='.repeat(Math.round(pingBarVal)).padEnd(pingBarMax, ' ')}|`;
    failOut = `failed: [ min, max ]:[ ${failMin.toFixed(1).padStart(4, ' ')}, ${failMax.toFixed(1).padStart(4, ' ')} ] ${failPercent.toFixed(1).padStart(5, ' ')}% |${failBar.padEnd(failBarMax, ' ')}|${' '.repeat(10)}`;
    process.stdout.clearLine(undefined);  // clear current text
    process.stdout.write(latencyOut);
    process.stdout.write('\n');
    process.stdout.write(failOut);
    process.stdout.write('\n');
    process.stdout.moveCursor(0, -2);
    logStackTimer(stopCb, getLogDataRef);
  }, 50);
}
