
const logDir = `${__dirname}/logs`;
const STAT_TYPES = {
  FAIL: 'FAIL',
  SUCCESS: 'SUCCESS',
};
const LOG_STAT_MAX = 4096;
const LOG_LEDGER_NAME = `log_ledger.txt`
const LOG_LEDGER_PATH = `${__dirname}/${LOG_LEDGER_NAME}`;
const PERIOD_STAT_NAME = 'period_stat.txt';
const PERIOD_STAT_PATH = `${__dirname}/${PERIOD_STAT_NAME}`;
const PERIOD_TYPES = {
  'MINUTE': 'MINUTE',
  'HOUR': 'HOUR',
};
const LOG_TYPES = {
  'SUCCESS': 'SUCCESS',
  'FAIL': 'FAIL',
};

module.exports = {
  logDir,
  STAT_TYPES,
  PERIOD_TYPES,
  PERIOD_STAT_PATH,
  LOG_TYPES,
  LOG_STAT_MAX,
  LOG_LEDGER_NAME,
  LOG_LEDGER_PATH,
};
