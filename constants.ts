
import path from 'path';

const BASE_PATH = path.resolve(__dirname, '..');
const logDir = `${BASE_PATH}/logs`;
const CSV_LOG_DIR = `${BASE_PATH}/csv-logs`;
const STAT_TYPES = {
  FAIL: 'FAIL',
  SUCCESS: 'SUCCESS',
};
const LOG_STAT_MAX = 4096;
const OMIT_MS_LIMIT = 10000;
const LOG_LEDGER_NAME = 'log_ledger.txt';
const LOG_LEDGER_PATH = `${BASE_PATH}/${LOG_LEDGER_NAME}`;
const PERIOD_STAT_NAME = 'period_stat.txt';
const PERIOD_STAT_PATH = `${BASE_PATH}/${PERIOD_STAT_NAME}`;
enum PERIOD_TYPES {
  MINUTE = 'MINUTE',
  HOUR = 'HOUR',
}
const LOG_TYPES = {
  'SUCCESS': 'SUCCESS',
  'FAIL': 'FAIL',
};
const MAIN_ARGS = {
  CONVERT_CSV: 'csv',
};
const CSV_ANALYZE_ARGS = {
  PARSE_SYNC: 'sync',
};

export {
  BASE_PATH,
  logDir,
  CSV_LOG_DIR,
  STAT_TYPES,
  PERIOD_TYPES,
  PERIOD_STAT_PATH,
  LOG_TYPES,
  LOG_STAT_MAX,
  OMIT_MS_LIMIT,
  LOG_LEDGER_NAME,
  LOG_LEDGER_PATH,
  MAIN_ARGS,
  CSV_ANALYZE_ARGS,
};
