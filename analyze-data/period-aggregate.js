
const {
  PERIOD_TYPES,
  LOG_TYPES,
} = require('../constants');

module.exports = {
  getPeriodAggregator,
};

function getPeriodAggregator(periodType) {
  
  return {
    aggregate,
    getStats,
  };
  function aggregate(parsedLogLine) {
    if(parsedLogLine === undefined) {
      return;
    }
    if(parsedLogLine.type === LOG_TYPES.FAIL) {
      failedCount++;
      return;
    }
    ping
  } 
  function getStats() {

  }
}

function getIntervalBucket() {
  let totalMs, pingCount, avgMs, minMs,
    maxMs, failedCount, failedPercent;;
  minMs = Infinity;
  maxMs = -1;
  pingCount = 0;
  totalMs = 0;
  failedCount = 0;

}
