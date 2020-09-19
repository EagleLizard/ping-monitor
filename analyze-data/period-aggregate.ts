
import {
  PERIOD_TYPES,
  LOG_TYPES,
} from '../constants';
import {
  padTime,
  getPeriodTimeString,
} from '../date-service';
import { ParsedLogLine } from '../parse-data/parse-ping';

const DEFAULT_MINUTE_GROUP_BY_VAL = 1;
const DEFAULT_MINUTE_GROUP_BY_ROUND = 5;
const DEFAULT_HOUR_GROUP_BY_VAL = 1;

export type IntervalBucket = {
  minMs: number;
  maxMs: number;
  pingCount: number;
  totalMs: number;
  failedCount: number;
  avgMs: number;
  time_stamp: string;
  time_stamp_ms: number;
  failedPercent: number;
}

export type PeriodAggregator = {
  aggregate: (parsedLogLine: any) => void;
  getStats: () => Map<string, IntervalBucket>;
  periodType: PERIOD_TYPES;
  groupByVal: number;
}

export {
  getPeriodAggregator,
};

function getPeriodAggregator(periodType: PERIOD_TYPES, groupByVal: number): PeriodAggregator {
  let intervalBuckets: Map<string, IntervalBucket>, periodAggregator: PeriodAggregator;

  if(periodType === undefined) {
    periodType = PERIOD_TYPES.MINUTE;
  }
  intervalBuckets = new Map;
  groupByVal = getValidGroupByVal(groupByVal, periodType);

  periodAggregator = {
    aggregate,
    getStats,
    periodType,
    groupByVal,
  };

  return periodAggregator;

  function aggregate(parsedLogLine: ParsedLogLine) {
    let logDate, bucketKey, bucket;
    if(parsedLogLine === undefined) {
      return;
    }
    // Key buckets by day, hour, minute
    logDate = new Date(parsedLogLine.time_stamp);

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
      throw new Error('totalMs isNaN in current log.');
    }

    if(parsedLogLine.ping_ms < bucket.minMs) {
      bucket.minMs = parsedLogLine.ping_ms;
    }
    if(parsedLogLine.ping_ms > bucket.maxMs) {
      bucket.maxMs = parsedLogLine.ping_ms;
    }
  }

  function getStats(): Map<string, IntervalBucket> {
    let bucketValIt;
    bucketValIt = intervalBuckets.values();
    for(let i = 0, currBucket; i < intervalBuckets.size, currBucket = bucketValIt.next().value; ++i) {
      currBucket.failedPercent = (currBucket.failedCount / (currBucket.failedCount + currBucket.pingCount)) * 100;
    }

    return intervalBuckets;
  }

}

function getValidGroupByVal(groupByVal: number, periodType: PERIOD_TYPES) {
  switch(periodType) {
    case PERIOD_TYPES.MINUTE:
      return getValidMinuteGroupByVal(groupByVal);
    case PERIOD_TYPES.HOUR:
      return getValidHourGroupByVal(groupByVal);
  }
}

function getValidMinuteGroupByVal(groupByVal: number) {
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

function getValidHourGroupByVal(groupByVal?: number) {
  return DEFAULT_HOUR_GROUP_BY_VAL;
}

function getBucketKey(logDate: Date, periodType: PERIOD_TYPES, groupByVal: number) {
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

function getIntervalBucket(logDate: Date): IntervalBucket {
  let totalMs: number, pingCount: number, avgMs: number, minMs: number,
    maxMs: number, failedCount: number;
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
    failedPercent: undefined,
  };
}
