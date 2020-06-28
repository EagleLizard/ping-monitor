
const logDir = `${__dirname}/logs`;
const STAT_TYPES = {
  FAIL: 'FAIL',
  SUCCESS: 'SUCCESS',
};
const LOG_STAT_MAX = 4096;
const LOG_LEDGER_NAME = `log_ledger.txt`
const LOG_LEDGER_PATH = `${__dirname}/${LOG_LEDGER_NAME}`;

module.exports = {
  logDir,
  STAT_TYPES,
  LOG_STAT_MAX,
  LOG_LEDGER_NAME,
  LOG_LEDGER_PATH,
};
