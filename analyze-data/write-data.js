const fs = require('fs');

const csv = require('csv');

const {
  PERIOD_STAT_PATH,
} = require('../constants');

const {
  getPeriodDateString,
} = require('../date-service');
const {
  scaleTo,
} = require('../math-util');

const DEFAULT_PERIOD_OPTIONS = {
  filterPingMs: 0,
  filterFailPercent: 0,
};

module.exports = {
  getCsvWriter,
  writePeriodStats,
};

function writePeriodStats(periodAggregator, options) {
  return new Promise((resolve, reject) => {
    let periodStats;
    let formattedAggregates;
    let pingMin, pingMax, failMin, failMax;
    let failLogFn;
    let statWs;

    options = (options === undefined)
      ? {}
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
    failMax = (formattedAggregates.failMax >= 20)
      ? formattedAggregates.failMax
      : 100;

    statWs = fs.createWriteStream(PERIOD_STAT_PATH);

    statWs.on('error', err => {
      reject(err);
    });

    statWs.on('finish', () => {
      resolve();
    });

    failLogFn = getLogFn([ failMin, failMax ], [ 10, 75 ]);

    for(let i = 0, currStat; i < periodStats.length, currStat = periodStats[i]; ++i) {
      let timeString, pingBar, failBarVal, failBar, statVals;

      /*
        filter based on passed options
      */
      if(
        (currStat.avgMs < options.filterPingMs)
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
      statVals = `avg: ${currStat.avgMs.toFixed(1)}ms, failed: ${currStat.failedPercent.toFixed(2)}%`;
      statWs.write(`${timeString}\n${statVals}\n\n${pingBar}\n${failBar}`);
      statWs.write('\n\n');
    }

    statWs.end();
  });
}

function getPingBar(stat, pingRange, targetRange) {
  let pingFn, pingBarVal;
  let pingBar;
  pingFn = getLogFn(pingRange, targetRange);
  pingBarVal = pingFn(stat.avgMs);
  pingBar = '∆'.repeat(Math.round(pingBarVal));
  return pingBar;
}

function formatAggregateStats(periodAggregator) {
  let periodMap, periodStats, periodMapIt;
  let pingMin, pingMax, failMin, failMax;

  pingMin = Infinity;
  pingMax = -1;
  failMin = Infinity;
  failMax = -1;

  periodMap = periodAggregator.getStats();
  periodStats = Array(periodMap.size).fill(0).map(() => undefined);
  periodMapIt = periodMap.values();

  for(let i = 0, currStat; i < periodMap.size, currStat = periodMapIt.next().value; ++i) {
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

function getLogFn(fromRange, toRange) {
  let baseFn, logFromRange;
  baseFn = Math.log;
  if(fromRange[0] < 1) {
    fromRange[0] = 1;
  }
  logFromRange = [
    baseFn(fromRange[0]),
    baseFn(fromRange[1]),
  ];
  return n => {
    let logN;
    if(n < 1) {
      n = 1;
    }
    logN = baseFn(n);
    return scaleTo(logN, logFromRange, toRange);
  };
}

function getCsvWriter(filePath) {
  return  new Promise((resolve, reject) => {
    let stringifier, ws, writer;
    stringifier = csv.stringify();
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

    function write(row) {
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
