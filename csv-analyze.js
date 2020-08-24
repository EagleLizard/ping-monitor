
const os = require('os');
const path = require('path');
const fs = require('fs');

const csv = require('csv');

const {
  PERIOD_TYPES,
  LOG_TYPES,
  CSV_LOG_DIR,
  CSV_ANALYZE_ARGS,
} = require('./constants');
const { getPeriodAggregator } = require('./analyze-data/period-aggregate');
const { writePeriodStats } = require('./analyze-data/write-data');
const { chunk } = require('./array-util');
const parsePing = require('./parse-data/parse-ping');

const CSV_PATH = `${__dirname}/log.csv`;
const TIME_STAMP_HEADER = 'time_stamp';
const PING_MS_HEADER = 'ping_ms';
const NUM_CPUS = os.cpus().length;
const CSV_CHUNK_SIZE = NUM_CPUS;

const PING_FILTER_MIN = 100;
const MINUTE_PERIOD_GROUP_BY = 1;

const CSV_SYNC_ARG = process.argv[2];

(async () => {
  try {
    await main();
  } catch(e) {
    console.log(e);
  }
})();

async function main() {
  let periodAggegator;
  let pingSum, numPings, numFailed, numTotal;
  let pingAvg, percentFailed;
  let startMs, endMs, deltaS;
  let heapTotalMb, externalMb, totalMb;
  let filterPingMs, filterFailPercent;

  startMs = Date.now();

  ({
    periodAggegator,
    pingSum,
    numPings,
    numFailed,
    numTotal,
  } = (
    (CSV_SYNC_ARG === CSV_ANALYZE_ARGS.PARSE_SYNC)
      ? (console.log('Synchonous'), (await aggregateCsvData()))
      : await aggregateMultiCsvData()
  ));

  endMs = Date.now();
  deltaS = +((endMs - startMs) / 1000).toFixed(3);
  pingAvg = +(pingSum / numPings).toFixed(3);
  percentFailed = +(numFailed / numTotal).toFixed(3);

  console.log(`\nCSV Analyze took ${deltaS}s`);
  console.log('');
  console.log(`numPings: ${numPings}`);
  console.log(`pingSum: ${pingSum}`);
  console.log(`numFailed: ${numFailed}`);
  console.log('');
  console.log(`Average ping: ${pingAvg}ms`);
  console.log(`Percent failed: ${percentFailed}%`);
  console.log('');

  heapTotalMb = Math.round(process.memoryUsage().heapTotal / 1024 / 1024);
  externalMb = Math.round(process.memoryUsage().external / 1024 / 1024);
  totalMb = heapTotalMb + externalMb;
  console.log(`Process used ${heapTotalMb}mb of heap memory`);
  console.log(`Process used ${externalMb}mb of external memory`);
  console.log(`Process used ${totalMb}mb of total memory`);
  filterPingMs = (PING_FILTER_MIN > 100) ? PING_FILTER_MIN : 100;
  filterFailPercent = 4;
  writePeriodStats(periodAggegator, {
    doFilter: false,
    filterPingMs,
    filterFailPercent,
  });
}

async function aggregateMultiCsvData() {
  let periodAggegator, numTotal,
    pingSum, numPings, numFailed;
  let logEntries, csvFilePaths, csvFileChunks;
  pingSum = 0;
  numPings = 0;
  numFailed = 0;
  numTotal = 0;

  periodAggegator = getPeriodAggregator(PERIOD_TYPES.MINUTE, MINUTE_PERIOD_GROUP_BY);

  logEntries = await parsePing.getLogLedgerEntries();
  csvFilePaths = logEntries.map(logEntry => {
    let parsedLogEntry, logName, csvFilePath;
    parsedLogEntry = path.parse(logEntry);
    logName = parsedLogEntry.name;
    csvFilePath = path.join(CSV_LOG_DIR, `${logName}.csv`);
    return csvFilePath;
  });
  csvFileChunks = chunk(csvFilePaths, CSV_CHUNK_SIZE);
  for(let i = 0, currChunk; i < csvFileChunks.length, currChunk = csvFileChunks[i]; ++i) {
    let chunkPromises;
    chunkPromises = currChunk.map(csvPath => {
      let currRowIdx, headers;
      currRowIdx = 0;
      return parseCsv(csvPath, record => {
        let rowObj;

        if(currRowIdx++ === 0) {
          headers = record;
          return;
        }
        numTotal++;
        rowObj = convertRow(headers, record);
        rowObj = convertData(rowObj);
        if(((typeof rowObj.ping_ms) === 'number')) {
          pingSum = pingSum + rowObj.ping_ms;
          numPings++;
        } else if(((typeof rowObj.ping_ms) === 'string') && (rowObj.ping_ms === 'FAIL')) {
          numFailed++;
        }
        periodAggegator.aggregate(rowObj);
      });
    });
    await Promise.all(chunkPromises);
  }
  return {
    periodAggegator,
    pingSum,
    numPings,
    numFailed,
    numTotal,
  };
}

async function aggregateCsvData() {
  let periodAggegator, currRowIdx, headers, numTotal,
    pingSum, numPings, numFailed;
  currRowIdx = 0;
  pingSum = 0;
  numPings = 0;
  numFailed = 0;
  numTotal = 0;

  periodAggegator = getPeriodAggregator(PERIOD_TYPES.MINUTE, MINUTE_PERIOD_GROUP_BY);

  await parseCsv(record => {
    let rowObj;

    if(currRowIdx++ === 0) {
      headers = record;
      return;
    }
    numTotal++;
    rowObj = convertRow(headers, record);
    rowObj = convertData(rowObj);
    if(((typeof rowObj.ping_ms) === 'number')) {
      pingSum = pingSum + rowObj.ping_ms;
      numPings++;
    } else if(((typeof rowObj.ping_ms) === 'string') && (rowObj.ping_ms === 'FAIL')) {
      numFailed++;
    }
    periodAggegator.aggregate(rowObj);
  });
  return {
    periodAggegator,
    pingSum,
    numPings,
    numFailed,
    numTotal,
  };
}

function parseCsv(csvPath, recordCb) {
  if((typeof csvPath) === 'function') {
    recordCb = csvPath;
    csvPath = CSV_PATH;
  }
  return new Promise((resolve, reject) => {
    let csvRs, csvParser, csvTransformer;

    csvRs = fs.createReadStream(csvPath);

    csvRs.on('error', err => {
      reject(err);
    });

    csvParser = csv.parse();

    csvParser.on('end', resolve);

    csvTransformer = csv.transform(recordCb);

    csvRs.pipe(csvParser).pipe(csvTransformer);
  });
}

function convertRow(headers, row) {
  let rowObj;
  rowObj = {};
  for(let i = 0, currHeader; i < headers.length, currHeader = headers[i]; ++i) {
    rowObj[currHeader] = row[i];
  }
  return rowObj;
}

function convertData(rowObj) {
  let timeStamp, pingMs, isFailLog;
  timeStamp = rowObj[TIME_STAMP_HEADER];
  pingMs = rowObj[PING_MS_HEADER];
  if(timeStamp !== undefined) {
    rowObj[TIME_STAMP_HEADER] = new Date(timeStamp);
  }
  if(!isNaN(+pingMs) && ((typeof pingMs) === 'string') && (pingMs.length > 0)) {
    rowObj[PING_MS_HEADER] = +pingMs;
  }
  isFailLog = ((typeof pingMs === 'string') && (pingMs === 'FAIL'));
  rowObj.type = isFailLog
    ? LOG_TYPES.FAIL
    : LOG_TYPES.SUCCESS;
  return rowObj;
}
