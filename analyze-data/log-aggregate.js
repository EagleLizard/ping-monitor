
const {
  LOG_TYPES,
} = require('../constants');

module.exports = {
  getLogAggregator,
};

function getLogAggregator() {
  let failedCount, failedPercent;
  let totalMs, pingCount, avgMs, minMs,
    maxMs;
  let currentLogIdx, firstLog, curredParsedLogLine;
  let isFirstLog, startMs;
  minMs = Infinity;
  maxMs = -1;
  pingCount = 0;
  failedCount = 0;
  totalMs = 0;
  currentLogIdx = 0;

  isFirstLog = true;

  return {
    aggregate,
    getStats,
  };

  function aggregate(parsedLogLine) {
    if(isFirstLog === true) {
      isFirstLog = false;
      startMs = Date.now();
    }
    if(parsedLogLine === undefined) {
      return;
    }
    curredParsedLogLine = parsedLogLine;
    if(currentLogIdx === 0) {
      firstLog = curredParsedLogLine;
    }
    currentLogIdx++;
    if(parsedLogLine.type === LOG_TYPES.FAIL) {
      failedCount++;
    } else {
      pingCount++;
      totalMs = totalMs + parsedLogLine.ping_ms;
      if(Number.isNaN(totalMs)) {
        console.log(parsedLogLine);
        throw new Error(`totalMs isNaN, for current log. Log Line:\n${parsedLogLine.logLine}`);
      }
      if(totalMs >= Number.MAX_SAFE_INTEGER) {
        throw Error(`TotalMS got too big ${totalMs}`);
      }
      if(parsedLogLine.ping_ms < minMs) {
        minMs = parsedLogLine.ping_ms;
      }
      if(parsedLogLine.ping_ms > maxMs) {
        maxMs = parsedLogLine.ping_ms;
      }
    }
  }

  function getStats() {
    let startTimeStamp, endTimeStamp;
    let perfMs;
    if(currentLogIdx === 0) {
      return undefined;
    }
    perfMs = Date.now() - startMs;
    startTimeStamp = firstLog.time_stamp;
    endTimeStamp = curredParsedLogLine.time_stamp;
    failedPercent = (failedCount / (pingCount + failedCount)) * 100;
    avgMs = totalMs / pingCount;
    return {
      start_time_stamp: startTimeStamp,
      end_time_stamp: endTimeStamp,
      avg_ms: +(avgMs.toFixed(3)),
      max_ms: maxMs,
      min_ms: minMs,
      num_failed_pings: failedCount,
      num_pings: pingCount,
      percent_failed: +(failedPercent.toFixed(3)),
      perf_ms: perfMs,
    };
  }
}
