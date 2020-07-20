
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
  getPeriodTimeString,
  getPeriodDateString,

} = require('../date-service');

const DEFAULT_MINUTE_GROUP_BY_VAL = 1;
const DEFAULT_MINUTE_GROUP_BY_ROUND = 5;
const DEFAULT_HOUR_GROUP_BY_VAL = 1;

module.exports = {
  getPeriodAggregator,
};

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
