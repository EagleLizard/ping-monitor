
import { promisify } from 'util';
import fs from 'fs';
const readFile = promisify(fs.readFile);

import {
  LOG_TYPES,
  OMIT_MS_LIMIT,
  LOG_LEDGER_PATH,
} from '../constants';

export type ParsedLogLine = {
  type: string;
  time_stamp: string;
  uri: string;
  logLine?: string;
  ping_ms?: number;
  failed?: number;
  failedCount?: number;
};

export {
  parseLogLine,
  getLogLedgerEntries,
};

function parseLogLine(logLine: string): ParsedLogLine | void {
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

function parseSuccessLogLine(logLine: string): ParsedLogLine {
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

function parseFailLogLine(logLine: string): ParsedLogLine {
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
