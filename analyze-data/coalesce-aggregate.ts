
// group by second

import { LOG_TYPES } from '../constants';
import { ParsedLogLine } from '../parse-data/parse-ping';
import { PingAggregator } from './ping-aggregator';

export type CoalesceBucket = {
  minMs: number;
  maxMs: number;
  pingTotal: number;
  pingCount: number;
  totalMs: number;
  failedCount: number;
  avgMs: number;
  time_stamp: string;
  time_stamp_ms: number;
  failedPercent: number;
};

export class CoalesceAggregator implements PingAggregator<CoalesceBucket> {
  buckets: Map<string, CoalesceBucket>;
  constructor() {
    this.buckets = new Map;
  }

  aggregate(parsedLogLine: ParsedLogLine) {
    let logDate: Date, bucketKey: string, bucket: CoalesceBucket;
    if(parsedLogLine === undefined) {
      return;
    }
    logDate = new Date(parsedLogLine.time_stamp);

    bucketKey = getBucketKey(logDate);
    if(!this.buckets.has(bucketKey)) {
      this.buckets.set(bucketKey, getCoalesceBucket(logDate));
    }
    bucket = this.buckets.get(bucketKey);
    bucket.pingCount = bucket.pingCount + 1;
    if(parsedLogLine.type === LOG_TYPES.SUCCESS) {
      bucket.pingTotal += parsedLogLine.ping_ms;
    }
    if(parsedLogLine.type === LOG_TYPES.FAIL) {
      bucket.failedCount++;
    }
  }

  getStats(): Map<string, CoalesceBucket> {
    let bucketValIt: IterableIterator<CoalesceBucket>;
    bucketValIt = this.buckets.values();
    for(let i = 0, currBucket; i < this.buckets.size, currBucket = bucketValIt.next().value; ++i) {
      currBucket.failedPercent = (currBucket.failedCount / (currBucket.failedCount + currBucket.pingTotal)) * 100;
    }
    return this.buckets;
  }
}

function getCoalesceBucket(logDate: Date): CoalesceBucket {
  let totalMs: number, pingCount: number, pingTotal: number, avgMs: number,
    minMs: number, maxMs: number, failedCount: number;
  minMs = Infinity;
  maxMs = -1;
  pingCount = 0;
  pingTotal = 0;

  totalMs = 0;
  failedCount = 0;
  avgMs = null;
  return {
    minMs,
    maxMs,
    pingCount,
    pingTotal,
    totalMs,
    failedCount,
    avgMs,
    time_stamp: logDate.toISOString(),
    time_stamp_ms: logDate.valueOf(),
    failedPercent: undefined,
  };
}

function getBucketKey(logDate: Date): string {
  // year, month, day, hour, minute, second
  let year: number, month: number, day: number, hour: number,
  minute: number, second: number, key: string;
  year = logDate.getFullYear();
  month = logDate.getMonth();
  day = logDate.getDate();
  hour = logDate.getHours();
  minute = logDate.getMinutes();
  second = logDate.getSeconds();
  key = `${year}-${month}-${day}_${hour}:${minute}:${second}`;
  return key;
}
