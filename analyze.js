
const { promisify } = require('util');
const fs = require('fs');
const readFile = promisify(fs.readFile);

const {
  STAT_TYPES,
  LOG_STAT_MAX,
  LOG_LEDGER_PATH,
  LOG_TYPES,
} = require('./constants');

const OMIT_MS_LIMIT = 10000;

(async () => {
  try {
    await main();
  } catch(e) {
    console.error(e);
  }
})();

async function main() {
  let statRollups, rollupStatTotals, statTotals;
  let logFileData, logFilePaths;
  let statAggregator;
  logFilePaths = (await readFile(LOG_LEDGER_PATH))
    .toString()
    .split('\n')
    .map(str => str.trim())
    .filter(str => str.length > 0);
  //dedupe
  logFilePaths = [ ...(new Set(logFilePaths)) ];
  console.log('logFilePaths');
  console.log(logFilePaths);
  statAggregator = getStatAggregator();
  logFileData = await Promise.all(logFilePaths.map(logFilePath => {
    return readFile(logFilePath).then(data => {
      let logLines, pasedLogLine;
      logLines = data.toString().split('\n');
      for(let i = 0, currLine; i < logLines.length, currLine = logLines[i]; ++i) {
        parsedLogLine = parseLogLine(currLine);
        statAggregator.aggregateStat(parsedLogLine);
      }
      return logLines;
    });
  }));
  statRollups = logFileData.map(getLogFileStats);
  statRollups.forEach(statRollup => {
    let statRollupCopy;
    statRollupCopy = Object.assign({}, statRollup, {
      start_timestamp: (new Date(statRollup.start_timestamp)).toLocaleString(),
      end_timestamp: (new Date(statRollup.end_timestamp)).toLocaleString(),
    });
    console.log(statRollupCopy);
  });
  console.log('Aggregator Totals:');
  console.log(statAggregator.getStats());
}

function getStatAggregator() {
  let logFileData, parsedLogLine, omitCount, failedCount,
    failedPercent;
  let totalMs, pingCount, avgMs, minMs,
    maxMs;
  minMs = Infinity;
  maxMs = -1;
  pingCount = 0;
  omitCount = 0;
  failedCount = 0;
  totalMs = 0;

  return {
    aggregateStat,
    getStats,
  };

  function aggregateStat(parsedLogLine) {
    if(parsedLogLine === undefined) {
      omitCount++;
      return;
    }
    if(parsedLogLine.type === LOG_TYPES.FAIL) {
      failedCount++;
    } else {
      pingCount++;
      totalMs = totalMs + parsedLogLine.ping_ms;
      if(Number.isNaN(totalMs)) {
        console.log(parsedLogLine);
        throw new Error(`totalMs isNaN, current log. line number: ${i}`);
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
    failedPercent = (failedCount / (pingCount + failedCount)) * 100;
    avgMs = totalMs / pingCount;
    return {
      avg_ms: +(avgMs.toFixed(3)),
      max_ms: maxMs,
      min_ms: minMs,
      num_failed_pings: failedCount,
      num_pings: pingCount,
      percent_failed: +(failedPercent.toFixed(3)),
    }
  }
}

function getStatTotals(logFileDataArrays) {
  let logFileData, parsedLogLine, omitCount, failedCount,
    failedPercent;
  let totalMs, pingCount, avgMs, minMs,
    maxMs;
  minMs = Infinity;
  maxMs = -1;
  pingCount = 0;
  omitCount = 0;
  failedCount = 0;
  totalMs = 0;
  logFileData = [];
  // flatten the data
  for(let i = 0, dataArr; i < logFileDataArrays.length, dataArr = logFileDataArrays[i]; ++i) {
    for(let k = 0, logLine; k < dataArr.length, logLine = dataArr[k]; ++k) {
      logFileData.push(logLine);
    }
  }

  for(let i = 0, logLine; i < logFileData.length, logLine = logFileData[i]; ++i) {
    parsedLogLine = parseLogLine(logLine);
    if(parsedLogLine === undefined) {
      omitCount++;
      continue;
    }
    if(parsedLogLine.type === LOG_TYPES.FAIL) {
      failedCount++;
    } else {
      pingCount++;
      totalMs = totalMs + parsedLogLine.ping_ms;
      if(Number.isNaN(totalMs)) {
        throw new Error(`totalMs isNaN, current log: ${logLine}, line number: ${i}`);
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
  failedPercent = (failedCount / (pingCount + failedCount)) * 100;
  avgMs = totalMs / pingCount;
  return {
    avg_ms: +(avgMs.toFixed(3)),
    max_ms: maxMs,
    min_ms: minMs,
    num_failed_pings: failedCount,
    num_pings: pingCount,
    percent_failed: +(failedPercent.toFixed(3)),
  };
}

function parseLogLine(logLine) {
  let logType, splat;
  let yearStamp;
  if(!logLine || logLine.trim().length === 0) {
    return;
  }
  yearStamp = logLine.substring(0, 4);
  if(!/[0-9]{4}/g.test(yearStamp)) {
    return;
  }
  logType = (logLine.includes('Unreachable') || logLine.includes('timeout'))
    ? LOG_TYPES.FAIL
    : LOG_TYPES.SUCCESS;
  switch(logType) {
    case LOG_TYPES.SUCCESS:
      return parseSuccessLogLine(logLine);
    case LOG_TYPES.FAIL:
      return parseFailLogLine(logLine);
  }
}

function parseSuccessLogLine(logLine) {
  let splat, time_stamp, uri, timePart, ping_ms;
  splat = logLine.split(' ');
  time_stamp = splat[0];
  uri = splat[1];
  timePart = splat[splat.length - 2];
  ping_ms = +timePart.split('=')[1];
  if(Number.isNaN(ping_ms) || ping_ms >= OMIT_MS_LIMIT) {
    return;
  }
  return {
    type: LOG_TYPES.SUCCESS,
    time_stamp,
    uri,
    ping_ms,
  }
}

function parseFailLogLine(logLine) {
  let splat, time_stamp, uri;
  splat = logLine.split(' ');
  time_stamp = splat[0];
  uri = splat[1];
  return {
    type: LOG_TYPES.FAIL,
    time_stamp,
    uri,
  };
}

function getRollupStatTotals(statRollups) {
  let avgDividend, avgDivisor, avgQuotient, failedCount,
    percentFailed, maxMs, minMs;
  avgDividend = 0;
  avgDivisor = 0;
  failedCount = 0;
  maxMs = -1;
  minMs = Infinity;
  for(let i = 0, currStat; i < statRollups.length, currStat = statRollups[i]; ++i) {
    avgDividend += (currStat.num_pings * currStat.avg_ms);
    avgDivisor += currStat.num_pings;
    failedCount += currStat.num_failed_pings;
    if(currStat.max_ms > maxMs) {
      maxMs = currStat.max_ms;
    }
    if(currStat.min_ms < minMs) {
      minMs = currStat.min_ms;
    }
  }
  avgQuotient = +(avgDividend / avgDivisor).toFixed(3);
  percentFailed = +(((failedCount / avgDivisor) * 100)).toFixed(3);
  return {
    avg_ms: avgQuotient,
    max_ms: maxMs,
    min_ms: minMs,
    num_failed_pings: failedCount,
    num_pings: avgDivisor,
    percent_failed: percentFailed,
  };
}

function getLogFileStats(logData) {
  let successStack, failStack;
  let logStats, logStatsRollup;
  // logData = logData.split('\n');
  successStack = [];
  failStack = [];
  logStats = [];
  for(let i = 0, line; i < logData.length, line = logData[i]; ++i) {
    let yearStamp, lineParts, isSuccess, isFail;
    let successLogs, failLogs;
    let successStat, failStat;
    // if the first 4 characters are not a year value, skip
    if(!line || line.trim().length === 0){
      continue;
    }
    yearStamp = line.substring(0, 4);
    if(!/[0-9]{4}/g.test(yearStamp)) {
      continue;
    }
    // Unreachable Request timeout
    isFail = (line.includes('Unreachable') || line.includes('timeout'));
    if(isFail) {
      if(successStack.length > 0) {
        successLogs = successStack;
        successStat = getSuccessStat(successLogs);
        logStats.push(successStat);
        successStack = [];
      }
      failStack.push(line);
      continue;
    }
    isSuccess = line.includes('time=');
    if(isSuccess) {
      if(failStack.length > 0) {
        failLogs = failStack;
        failStat = getFailStat(failLogs);
        logStats.push(failStat);
        failStack = [];
      }
      if(successStack.length >= LOG_STAT_MAX) {
        successLogs = successStack;
        successStat = getSuccessStat(successLogs);
        logStats.push(successStat);
        successStack = [];
      }
      successStack.push(line);
      continue;
    }
  }
  if(successStack.length > 0) {
    logStats.push(getSuccessStat(successStack));
  }
  if(failStack.length > 0) {
    logStats.push(getFailStat(failStack));
  }
  logStatsRollup = getStatsRollup(logStats);
  return logStatsRollup;
}

function getStatsRollup(logStats) {
  let avgMs, minMs, maxMs, statAvgTotal, pingCountTotal;
  let failedCount;
  let firstLog, lastLog, firstLogStamp, lastLogStamp;
  firstLog = logStats[0];
  lastLog = logStats[logStats.length - 1];
  statAvgTotal = 0;
  pingCountTotal = 0;
  minMs = Infinity;
  maxMs = -1;
  failedCount = 0;
  for(let i = 0, currStat; i < logStats.length, currStat = logStats[i]; ++i) {
    if(currStat.type === STAT_TYPES.SUCCESS) {
      statAvgTotal += currStat.avg_ms * currStat.num_pings;
      pingCountTotal += +currStat.num_pings;
      if(currStat.min_ms < minMs) {
        minMs = currStat.min_ms;
      }
      if(currStat.max_ms > maxMs) {
        maxMs = currStat.max_ms;
      }
    } else if(currStat.type === STAT_TYPES.FAIL) {
      failedCount += currStat.failedPings;
    }
  }
  avgMs = +(statAvgTotal / pingCountTotal).toFixed(3);
  return {
    start_timestamp: firstLog.start_timestamp,
    end_timestamp: lastLog.end_timestamp,
    num_pings: pingCountTotal,
    num_failed_pings: failedCount,
    min_ms: minMs,
    max_ms: maxMs,
    avg_ms: avgMs,
  };
}

function getSuccessStat(logs) {
  let firstLog, lastLog, ms;
  let firstParts, lastParts, firstStamp, lastStamp;
  let minMs, maxMs, totalMs, avgMs;
  let omitCount;
  omitCount = 0;
  minMs = Infinity;
  maxMs = -1;
  avgMs = 0;
  if(logs.length === 0) {
    ms = 1000;
  } else {
    firstLog = logs[0];
    lastLog = logs[logs.length - 1];
    firstParts = firstLog.split(' ');
    lastParts = lastLog.split(' ');
    firstStamp = firstParts[0];
    lastStamp = lastParts[0];
    ms = (new Date(lastStamp)).getTime() - (new Date(firstStamp)).getTime();
    totalMs = 0;
    for(let i = 0, currLine; i < logs.length, currLine = logs[i]; ++i) {
      let timePart, pingMs, splat;
      splat = currLine.split(' ');
      timePart = splat[splat.length - 2];
      pingMs = +timePart.split('=')[1];
      if(pingMs >= OMIT_MS_LIMIT) {
        omitCount++;
        continue;
      }
      totalMs += pingMs;
      if(pingMs < minMs) {
        minMs = pingMs;
      } else if(pingMs > maxMs) {
        maxMs = pingMs;
      }
    }
    avgMs = +(totalMs / logs.length).toFixed(3);
  }
  return {
    type: STAT_TYPES.SUCCESS,
    start_timestamp: firstStamp,
    end_timestamp: lastStamp,
    uptime_period_ms: ms,
    uptime_period_seconds: +(ms / 1000).toFixed(3),
    num_pings: logs.length - omitCount,
    min_ms: minMs,
    max_ms: maxMs,
    avg_ms: avgMs,
  }
}

function getFailStat(logs) {
  let firstFail, lastFail, ms;
  let outageStart, outageEnd, failedPings;
  let firstParts, lastParts, firstStamp, lastStamp;
  if(logs.length === 0) {
    ms = 1000;
  } else {
    firstFail = logs[0];
    lastFail = logs[logs.length - 1];
    firstParts = firstFail.split(' ');
    lastParts = lastFail.split(' ');
    firstStamp = firstParts[0];
    lastStamp = lastParts[0];
    ms = (new Date(lastStamp)).getTime() - (new Date(firstStamp)).getTime();
    outageStart = firstStamp;
    outageEnd = lastStamp;
    failedPings = logs.length;
  }
  return {
    type: STAT_TYPES.FAIL,
    start_timestamp: firstStamp,
    end_timestamp: lastStamp,
    outage_period_ms: ms,
    outage_period_seconds: +(ms / 1000).toFixed(3),
    outageStart,
    outageEnd,
    failedPings,
  };
}
