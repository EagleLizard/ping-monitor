
const fs = require('fs');

const {
  PERIOD_TYPES,
  LOG_TYPES,
  PERIOD_STAT_PATH,
} = require('../constants');
const {
  padTime,
  getMinutesDateString,
  getHoursDateString,
} = require('../date-service');

const DEFAULT_MINUTE_GROUP_BY_VAL = 1;
const DEFAULT_MINUTE_GROUP_BY_ROUND = 5;
const DEFAULT_HOUR_GROUP_BY_VAL = 1;
const SCALE_MOD = 1.5;

module.exports = {
  getPeriodAggregator,
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
      pingBar = '∆'.repeat(Math.round(currStat.avgMs / SCALE_MOD));
      failBar = '∟'.repeat(Math.ceil(currStat.failedPercent));
      statVals = `avg: ${currStat.avgMs}ms, failed: ${currStat.failedPercent.toFixed(2)}%`;
      statWs.write(`${timeString}\n${statVals}\n\n${pingBar}\n${failBar}`);
      statWs.write('\n\n');
    }

    statWs.end();
  });
}

function getPeriodAggregator(periodType, groupByVal) {
  let intervalBuckets;

  if(periodType === undefined) {
    periodType = PERIOD_TYPES.MINUTE;
  }
  intervalBuckets = new Map;
  groupByVal = getValidGroupByVal(groupByVal, periodType);
  

  return {
    aggregate,
    getStats,
    periodType,
    groupByVal,
  };

  function aggregate(parsedLogLine) {
    let logDate, bucketKey, bucket;
    if(parsedLogLine === undefined) {
      return;
    }
    // Key buckets by day, hour, minute
    logDate = new Date(parsedLogLine.time_stamp);
    if(logDate.getFullYear() !== 2020) {
      console.log(parsedLogLine);
      throw Error();
    }
    bucketKey = getBucketKey(logDate, periodType, groupByVal);
    if(!intervalBuckets.has(bucketKey)) {
      intervalBuckets.set(bucketKey, getIntervalBucket(logDate));
    }
    bucket = intervalBuckets.get(bucketKey);

    if(parsedLogLine.type === LOG_TYPES.FAIL) {
      bucket.failedCount++;
      return;
    }
    bucket.pingCount++;
    bucket.totalMs = bucket.totalMs + parsedLogLine.ping_ms;
    if(Number.isNaN(bucket.totalMs)) {
      console.log(parsedLogLine);
      throw new Error(`totalMs isNaN in current log.`);
    }
    if(bucket.totalMs >= Number.MAX_SAFE_INTEGER) {
      throw Error(`TotalMS got too big ${bucket.totalMs}`);
    }
    if(parsedLogLine.ping_ms < bucket.minMs) {
      bucket.minMs = parsedLogLine.ping_ms;
    }
    if(parsedLogLine.ping_ms > bucket.maxMs) {
      bucket.maxMs = parsedLogLine.ping_ms;
    }
  }

  function getStats() {
    let bucketValIt;
    bucketValIt = intervalBuckets.values();
    for(let i = 0, currBucket; i < intervalBuckets.size, currBucket = bucketValIt.next().value; ++i) {
      currBucket.failedPercent = (currBucket.failedCount / (currBucket.failedCount + currBucket.pingCount)) * 100;
    }
    
    return intervalBuckets;
  }

}

function getValidGroupByVal(groupByVal, periodType) {
  switch(periodType) {
    case PERIOD_TYPES.MINUTE:
      return getValidMinuteGroupByVal(groupByVal);
    case PERIOD_TYPES.HOUR:
      return getValidHourGroupByVal(groupByVal);
  }
}

function getValidMinuteGroupByVal(groupByVal) {
  let remainder;
  /*
    Valid groupings need to be evenly divisible by 60
      For now, divisibility by 5 will be used
  */
 if(
   (groupByVal === undefined)
   || (groupByVal < 1)
   || (groupByVal > 60)
  ) {
   return DEFAULT_MINUTE_GROUP_BY_VAL;
 }
  remainder = groupByVal % DEFAULT_MINUTE_GROUP_BY_ROUND;
  
  if((remainder !== 0) && (groupByVal > DEFAULT_MINUTE_GROUP_BY_ROUND)) {
    groupByVal = groupByVal - remainder;
    if(remainder >= 3) {
      return groupByVal + DEFAULT_MINUTE_GROUP_BY_ROUND;
    }
  }
  return groupByVal;
}

function getValidHourGroupByVal(groupByVal) {
  return DEFAULT_HOUR_GROUP_BY_VAL;
}

function getBucketKey(logDate, periodType, groupByVal) {
  let timeString, month, day, year,
    key;
  timeString = getPeriodTimeString(logDate, periodType, groupByVal);
  month = padTime(logDate.getMonth() + 1);
  day = padTime(logDate.getDate());
  year = logDate.getFullYear();
  if(year !== 2020) {
    console.log(logDate);
  }
  key = `${month}-${day}-${year}_${timeString}`;
  return key;
}

function getPeriodDateString(logDate, periodType) {
  switch(periodType) {
    case PERIOD_TYPES.MINUTE:
      return getMinutesDateString(logDate);
    case PERIOD_TYPES.HOUR:
      return getHoursDateString(logDate);
  }
}

function getPeriodTimeString(logDate, periodType, groupByVal) {
  switch(periodType) {
    case PERIOD_TYPES.MINUTE:
      return getMinuteTimeString(logDate, groupByVal);
    case PERIOD_TYPES.HOUR:
      return getHourTimeString(logDate, groupByVal);
  }
}

function getMinuteTimeString(logDate, groupByVal) {
  let timeString, splatTimeString, formattedTimeString;
  let hours, minutes, seconds, minutesRemainder;
  timeString = logDate.toTimeString().split(' ')[0];
  splatTimeString = timeString.split(':');
  hours = splatTimeString[0];
  minutes = splatTimeString[1];
  seconds = '00';
  minutesRemainder = minutes % groupByVal;
  if((minutes - minutesRemainder) < 0) {
    minutes = 0;
  }else if(minutesRemainder !== 0) {
    minutes = minutes - minutesRemainder;
  }
  minutes = padTime(minutes);
  formattedTimeString = [ hours, minutes, seconds ].join(':');
  return formattedTimeString;
}

function getHourTimeString(logDate, groupByVal) {
  let hours;
  hours = padTime(logDate.getHours());
  return `${hours}:00:00`;
}

function getIntervalBucket(logDate) {
  let totalMs, pingCount, avgMs, minMs,
    maxMs, failedCount, failedPercent;
  minMs = Infinity;
  maxMs = -1;
  pingCount = 0;
  totalMs = 0;
  failedCount = 0;
  avgMs = null;
  return {
    minMs,
    maxMs,
    pingCount,
    totalMs,
    failedCount,
    avgMs,
    time_stamp: logDate.toISOString(),
    time_stamp_ms: logDate.valueOf(),
  }
}
