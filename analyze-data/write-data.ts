import fs, { WriteStream } from 'fs';

import csvStringifer, { Stringifier } from 'csv-stringify';

import {
  PERIOD_STAT_PATH,
} from '../constants';

import {
  getPeriodDateString,
} from '../date-service';
import {
  scaleTo,
} from '../math-util';
import {
  IntervalBucket
} from './period-aggregate';
import { PingAggregator } from './ping-aggregator';

type PeriodOptions = {
  filterPingMs: number;
  filterFailPercent: number;
  doFilter: boolean;
}

export type CsvWriter = {
  write: (row: any[]) => void;
  end: () => Promise<unknown>;
}

type FormattedPeriodStat = {
  periodStats: IntervalBucket[];
  pingMin: number;
  pingMax: number;
  failMin: number;
  failMax: number;
}

const DEFAULT_PERIOD_OPTIONS: PeriodOptions = {
  filterPingMs: 0,
  filterFailPercent: 0,
  doFilter: false,
};

export {
  getCsvWriter,
  writePeriodStats,
};

function writePeriodStats<T extends IntervalBucket>(periodAggregator: PingAggregator<T>, options: PeriodOptions) {
  return new Promise((resolve, reject) => {
    let periodStats: IntervalBucket[];
    let formattedAggregates: FormattedPeriodStat;
    let pingMin: number, pingMax: number, failMin: number, failMax: number;
    let failLogFn: (n: number) => number;
    let statWs;

    options = (options === undefined)
      ? ({} as PeriodOptions)
      : options;

    pingMin = Infinity;
    pingMax = -1;
    failMin = Infinity;
    failMax = -1;
    options = Object.assign({}, DEFAULT_PERIOD_OPTIONS, options);
    if(options.doFilter === false) {
      options.filterPingMs = DEFAULT_PERIOD_OPTIONS.filterPingMs;
      options.filterFailPercent = DEFAULT_PERIOD_OPTIONS.filterFailPercent;
    }
    console.log(options);

    formattedAggregates = formatAggregateStats(periodAggregator);
    periodStats = formattedAggregates.periodStats;
    pingMin = formattedAggregates.pingMin;
    pingMax = formattedAggregates.pingMax;
    failMin = formattedAggregates.failMin;
    // failMax = (formattedAggregates.failMax >= 20)
    //   ? formattedAggregates.failMax
    //   : 20;
    // failMax = formattedAggregates.failMax;
    // failMax = 70;
    // failMax = (formattedAggregates.failMax >= 20)
    //   ? formattedAggregates.failMax
    //   : 100;
    failMax = 70;
    statWs = fs.createWriteStream(PERIOD_STAT_PATH);

    statWs.on('error', err => {
      reject(err);
    });

    statWs.on('finish', () => {
      resolve();
    });

    failLogFn = getLogFn([ failMin, failMax ], [ 0, 50 ]);

    for(let i = 0, currStat; i < periodStats.length, currStat = periodStats[i]; ++i) {
      let timeString, pingBar, failBarVal, failBar, statVals;
      let avgMs: number;

      avgMs = currStat.avgMs;

      /*
        filter based on passed options
      */
      if(
        (avgMs < options.filterPingMs)
        && (currStat.failedPercent < options.filterFailPercent)
      ) {
        continue;
      }

      timeString = getPeriodDateString(new Date(currStat.time_stamp), periodAggregator.periodType, {
        amPm: true,
      });

      failBarVal = Math.round(failLogFn(currStat.failedPercent));

      pingBar = getPingBar(currStat, [ pingMin, pingMax ], [ 10, 95 ]);
      failBar = '∟'.repeat(failBarVal);
      statVals = `avg: ${currStat.avgMs.toFixed(1)}ms, failed: ${currStat.failedPercent.toFixed(1)}%`;
      statWs.write(`${timeString}\n${statVals}\n\n${pingBar}\n${failBar}`);
      statWs.write('\n\n');
    }

    statWs.end();
  });
}

function getPingBar(stat: IntervalBucket, pingRange: [ number, number ], targetRange: [ number, number ]) {
  let pingFn, pingBarVal;
  let pingBar;
  pingFn = getLogFn(pingRange, targetRange);
  pingBarVal = pingFn(stat.avgMs);
  pingBar = '∆'.repeat(Math.round(pingBarVal));
  return pingBar;
}

function formatAggregateStats<T extends IntervalBucket>(periodAggregator: PingAggregator<T>): FormattedPeriodStat {
  let periodMap: Map<string, T>, periodStats: IntervalBucket[];
  let intervalBuckets: T[];
  let pingMin: number, pingMax: number, failMin: number, failMax: number;

  pingMin = Infinity;
  pingMax = -1;
  failMin = Infinity;
  failMax = -1;

  periodMap = periodAggregator.getStats();
  periodStats = Array(periodMap.size).fill(0).map(() => undefined) as IntervalBucket[];
  intervalBuckets = [ ...periodMap.values() ].filter(intervalBucket => {
    // filter out any logs without ping data
    if(intervalBucket.totalMs < 1) {
      return false;
    }
    return true;
  });

  for(let i = 0, currStat: T; i < intervalBuckets.length, currStat = intervalBuckets[i]; ++i) {
    currStat.avgMs = currStat.totalMs / currStat.pingCount;
    if(currStat.avgMs < pingMin) {
      pingMin = currStat.avgMs;
    }
    if(currStat.avgMs > pingMax) {
      pingMax = currStat.avgMs;
    }
    if(currStat.failedPercent < failMin) {
      failMin = currStat.failedPercent;
    }
    if(currStat.failedPercent > failMax) {
      failMax = currStat.failedPercent;
    }
    periodStats[i] = currStat;
  }

  periodStats.sort((a, b) => {
    let aMs, bMs;
    aMs = a.time_stamp_ms;
    bMs = b.time_stamp_ms;
    if(aMs < bMs) return 1;
    if(aMs > bMs) return -1;
    return 0;
  });

  return {
    periodStats,
    pingMin,
    pingMax,
    failMin,
    failMax,
  };
}

function getLogFn(fromRange: [ number, number ], toRange: [ number, number ]) {
  let baseFn: (n: number) => number, logFromRange: [ number, number ];
  baseFn = Math.log;
  if(fromRange[0] < 1) {
    fromRange[0] = 1;
  }
  logFromRange = [
    baseFn(fromRange[0]),
    baseFn(fromRange[1]),
  ];
  return (n: number) => {
    let logN;
    if(n < 1) {
      n = 1;
    }
    logN = baseFn(n);
    return scaleTo(logN, logFromRange, toRange);
  };
}

function getCsvWriter(filePath: string): Promise<CsvWriter> {
  return  new Promise((resolve, reject) => {
    let stringifier: Stringifier, ws: WriteStream, writer: CsvWriter;
    stringifier = csvStringifer();
    ws = fs.createWriteStream(filePath);
    writer = {
      write,
      end,
    };
    stringifier.on('error', err => {
      reject(err);
    });
    ws.on('error', err => {
      reject(err);
    });
    // stringifier.on('data', data => {
    //   ws.write(data);
    // })
    stringifier.pipe(ws);

    resolve(writer);

    function write(row: any[]) {
      stringifier.write(row);
    }
    function end() {
      return new Promise((_resolve) => {
        ws.on('close', () => {
          _resolve();
        });
        stringifier.end();
      });
    }
  });
}
