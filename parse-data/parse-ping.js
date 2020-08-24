
const { promisify } = require('util');
const fs = require('fs');
const readFile = promisify(fs.readFile);

const {
  LOG_TYPES,
  OMIT_MS_LIMIT,
  LOG_LEDGER_PATH,
} = require('../constants');

module.exports = {
  parseLogLine,
  getLogLedgerEntries,
};

function parseLogLine(logLine) {
  let logType;
  let dateStamp;
  if(!logLine || logLine.trim().length === 0) {
    return;
  }
  dateStamp = logLine.substring(0, 10);
  if(!/[0-9]{4}-[0-9]{2}-[0-9]{2}/g.test(dateStamp)) {
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
    logLine,
    uri,
    ping_ms,
  };
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

async function getLogLedgerEntries() {
  let fileData, logEntries;
  fileData = await readFile(LOG_LEDGER_PATH);
  logEntries = fileData.toString()
    .split('\n')
    .map(logEntry => logEntry.trim())
    .filter(logEntry => {
      return (logEntry.length > 0)
        && (!logEntry.startsWith('#'));
    });
  // dedupe
  logEntries = [ ...(new Set(logEntries)) ];
  return logEntries;
}
