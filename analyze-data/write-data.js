const fs = require('fs');

const csv = require('csv');

const {
  PERIOD_TYPES,
  PERIOD_STAT_PATH,
} = require('../constants');

const {
  getPeriodDateString,
} = require('../date-service');

const PING_SCALE_MOD = 2.5;
const FAIL_SCALE_MOD = 2;

module.exports = {
  getCsvWriter,
  writePeriodStats,
};

function writePeriodStats(periodAggregator) {
  return new Promise((resolve, reject) => {
    let periodMap, periodStats, periodMapIt;
    let statWs;
    periodMap = periodAggregator.getStats();
    periodStats = Array(periodMap.size)
      .fill(0)
      .map(() => undefined);
    periodMapIt = periodMap.values();
    for(let i = 0, currStat; i < periodMap.size, currStat = periodMapIt.next().value; ++i) {
      currStat.avgMs = +(currStat.totalMs / currStat.pingCount).toFixed(3);
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
    statWs = fs.createWriteStream(PERIOD_STAT_PATH);
    
    statWs.on('error', err => {
      reject(err);
    });

    statWs.on('finish', () => {
      resolve();
    });

    for(let i = 0, currStat; i < periodStats.length, currStat = periodStats[i]; ++i) {
      let timeString, pingBar, maxBar, minBar, failBar, statVals;
      
      timeString = getPeriodDateString(new Date(currStat.time_stamp), periodAggregator.periodType);
      if(periodAggregator.periodType === PERIOD_TYPES.MINUTE) {
        timeString = timeString.split(':').slice(0, -1).join(':');
      }
      pingBar = '∆'.repeat(Math.round(currStat.avgMs / PING_SCALE_MOD));
      failBar = '∟'.repeat(Math.ceil(currStat.failedPercent) * FAIL_SCALE_MOD);
      statVals = `avg: ${currStat.avgMs}ms, failed: ${currStat.failedPercent.toFixed(2)}%`;
      // statWs.write(`${timeString} ${statVals}`);
      statWs.write(`${timeString}\n${statVals}\n\n${pingBar}\n${failBar}`);
      statWs.write('\n\n');
    }

    statWs.end();
  });
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
      return new Promise((_resolve, _reject) => {
        ws.on('close', () => {
          _resolve();
        })
        stringifier.end();
      })
    }
  });
}
