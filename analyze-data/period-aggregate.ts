
import {
  PERIOD_TYPES,
  LOG_TYPES,
} from '../constants';
import {
  padTime,
  getPeriodTimeString,
} from '../date-service';
import { ParsedLogLine } from '../parse-data/parse-ping';
import { PingAggregator } from './ping-aggregator';

const DEFAULT_MINUTE_GROUP_BY_VAL = 1;
const DEFAULT_MINUTE_GROUP_BY_ROUND = 5;
const DEFAULT_HOUR_GROUP_BY_VAL = 1;

export type IntervalBucket = {
  minMs: number;
  maxMs: number;
  pingCount: number;
  ping_total: number;
  totalMs: number;
  avgMs: number;
  failedCount: number;
  time_stamp: string;
  time_stamp_ms: number;
  failedPercent: number;
};

// export {
//   getPeriodAggregator,
// };

export class PeriodAggregator implements PingAggregator<IntervalBucket> {
  intervalBuckets: Map<string, IntervalBucket>;
  periodType: PERIOD_TYPES;
  groupByVal: number;
  doCoalesce: boolean;

  constructor(periodType: PERIOD_TYPES, groupByVal: number, doCoalesce?: boolean) {
    this.periodType = periodType;
    this.groupByVal = groupByVal;
    this.groupByVal = getValidGroupByVal(this.groupByVal, this.periodType);
    if(doCoalesce === undefined) {
      this.doCoalesce = false;
    } else {
      this.doCoalesce = doCoalesce;
    }

    this.intervalBuckets = new Map;
  }

  aggregate(parsedLogLine: ParsedLogLine) {
    let logDate: Date, bucketKey: string, bucket: IntervalBucket;
    if(parsedLogLine === undefined) {
      return;
    }
    // Key buckets by day, hour, minute
    logDate = new Date(parsedLogLine.time_stamp);

    bucketKey = getBucketKey(logDate, this.periodType, this.groupByVal);
    if(!this.intervalBuckets.has(bucketKey)) {
      this.intervalBuckets.set(bucketKey, getIntervalBucket(logDate));
    }
    bucket = this.intervalBuckets.get(bucketKey);
    if(this.doCoalesce) {
      if((typeof parsedLogLine.failed) === 'number') {
        bucket.failedCount += parsedLogLine.failed;
      }
      if((typeof +parsedLogLine.ping_count) === 'number') {
        bucket.ping_total += +parsedLogLine.ping_count;
      }
    } else {
      if(parsedLogLine.type === LOG_TYPES.FAIL) {
        bucket.failedCount++;
        return;
      }
    }

    bucket.pingCount++;
    if(this.doCoalesce) {
      bucket.totalMs = bucket.totalMs + parsedLogLine.total_ms;
    } else {
      bucket.totalMs = bucket.totalMs + parsedLogLine.ping_ms;
    }

    if(Number.isNaN(bucket.totalMs)) {
      console.log(parsedLogLine);
      console.log(bucket);
      throw new Error('totalMs isNaN in current log.');
    }

    if(parsedLogLine.ping_ms < bucket.minMs) {
      bucket.minMs = parsedLogLine.ping_ms;
    }
    if(parsedLogLine.ping_ms > bucket.maxMs) {
      bucket.maxMs = parsedLogLine.ping_ms;
    }
  }

  getStats() {
    let bucketValIt: IterableIterator<IntervalBucket>;
    bucketValIt = this.intervalBuckets.values();
    for(let i = 0, currBucket; i < this.intervalBuckets.size, currBucket = bucketValIt.next().value; ++i) {
      if(this.doCoalesce) {
        currBucket.failedPercent = (currBucket.failedCount / (currBucket.ping_total)) * 100;
        currBucket.avgMs = currBucket.totalMs / (currBucket.ping_total - currBucket.failedCount);
      } else {
        currBucket.failedPercent = (currBucket.failedCount / (currBucket.failedCount + currBucket.pingCount)) * 100;
        currBucket.avgMs = currBucket.totalMs / currBucket.ping_total;
      }
    }

    return this.intervalBuckets;
  }
}

function getValidGroupByVal(groupByVal: number, periodType: PERIOD_TYPES) {
  switch(periodType) {
    case PERIOD_TYPES.SECOND:
      return getValidSecondGroupByVal(groupByVal);
    case PERIOD_TYPES.MINUTE:
      return getValidMinuteGroupByVal(groupByVal);
    case PERIOD_TYPES.HOUR:
      return getValidHourGroupByVal(groupByVal);
  }
}

function getValidSecondGroupByVal(groupByVal: number): number {
  // hardcoded list of valid integers divisible by 60
  const validSecondGroupByVals = [ 1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30, 60 ];
  if(!validSecondGroupByVals.includes(groupByVal)) {
    throw new Error(`Invalid SecondGroupByVal provided: ${groupByVal}`);
  }
  return groupByVal;
}

function getValidMinuteGroupByVal(groupByVal: number) {
  let remainder: number;
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
  groupByVal = DEFAULT_HOUR_GROUP_BY_VAL;
  return groupByVal;
}

function getBucketKey(logDate: Date, periodType: PERIOD_TYPES, groupByVal: number) {
  let timeString: string, month: string, day: string, year: number,
    key: string;
  timeString = getPeriodTimeString(logDate, periodType, groupByVal);
  month = padTime(logDate.getMonth() + 1);
  day = padTime(logDate.getDate());
  year = logDate.getFullYear();
  // if(year !== 2020) {
  //   console.log(logDate);
  // }
  key = `${month}-${day}-${year}_${timeString}`;
  return key;
}

function getIntervalBucket(logDate: Date): IntervalBucket {
  let totalMs: number, pingCount: number, avgMs: number, minMs: number,
    maxMs: number, failedCount: number, ping_total: number;
  minMs = Infinity;
  maxMs = -1;
  pingCount = 0;
  totalMs = 0;
  failedCount = 0;
  avgMs = 0;
  ping_total = 0;
  return {
    minMs,
    maxMs,
    pingCount,
    totalMs,
    failedCount,
    avgMs,
    ping_total,
    time_stamp: logDate.toISOString(),
    time_stamp_ms: logDate.valueOf(),
    failedPercent: undefined,
  };
}
