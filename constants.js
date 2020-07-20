
const BASE_PATH = __dirname;
const logDir = `${BASE_PATH}/logs`;
const STAT_TYPES = {
  FAIL: 'FAIL',
  SUCCESS: 'SUCCESS',
};
const LOG_STAT_MAX = 4096;
const LOG_LEDGER_NAME = `log_ledger.txt`
const LOG_LEDGER_PATH = `${BASE_PATH}/${LOG_LEDGER_NAME}`;
const PERIOD_STAT_NAME = 'period_stat.txt';
const PERIOD_STAT_PATH = `${BASE_PATH}/${PERIOD_STAT_NAME}`;
const PERIOD_TYPES = {
  'MINUTE': 'MINUTE',
  'HOUR': 'HOUR',
};
const LOG_TYPES = {
  'SUCCESS': 'SUCCESS',
  'FAIL': 'FAIL',
};

module.exports = {
  BASE_PATH,
  logDir,
  STAT_TYPES,
  PERIOD_TYPES,
  PERIOD_STAT_PATH,
  LOG_TYPES,
  LOG_STAT_MAX,
  LOG_LEDGER_NAME,
  LOG_LEDGER_PATH,
};
