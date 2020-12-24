
import path from 'path';

export const BASE_PATH = path.resolve(__dirname, '..');
export const logDir = `${BASE_PATH}/logs`;

export const LOG_DATA_DIR = `${BASE_PATH}/data-logs`;
export const LOG_DIR_V2 = `${LOG_DATA_DIR}/logs`;
export const CSV_LOG_DIR_V2 = `${LOG_DATA_DIR}/csv-logs`;

export const CSV_LOG_DIR = `${BASE_PATH}/csv-logs`;
export const COALESCED_LOG_DIR = `${BASE_PATH}/csv-logs-coalesced`;
export const STAT_TYPES = {
  FAIL: 'FAIL',
  SUCCESS: 'SUCCESS',
};
export const LOG_STAT_MAX = 4096;
export const OMIT_MS_LIMIT = 10000;
export const LOG_LEDGER_NAME = 'log_ledger.txt';
export const LOG_LEDGER_PATH = `${BASE_PATH}/${LOG_LEDGER_NAME}`;
export const PERIOD_STAT_NAME = 'period_stat.txt';
export const PERIOD_STAT_PATH = `${BASE_PATH}/${PERIOD_STAT_NAME}`;

export enum PERIOD_TYPES {
  SECOND = 'SECOND',
  MINUTE = 'MINUTE',
  HOUR = 'HOUR',
}
export const LOG_TYPES = {
  'SUCCESS': 'SUCCESS',
  'FAIL': 'FAIL',
};
export const ROLLUP_TYPES = {
  'DISTINCT': 'DISTINCT',
  'PERIOD': 'PERIOD',
};
export const MAIN_ARGS = {
  CONVERT_CSV: 'csv',
  WATCH: 'watch',
  V2: 'v2',
};
export const TIME_STAMP_HEADER = 'time_stamp';
export const PING_MS_HEADER = 'ping_ms';

export const PING_TARGETS = [
  'www.qualtrics.com',
  'www.github.com',
  'news.ycombinator.com',
  'www.microsoft.com',
  // 'www.usa.gov',
  'www.amazon.com',
  'www.salesforce.com',
  'www.npr.org',
  'www.yahoo.com',
];
