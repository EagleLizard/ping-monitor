
const fs = require('fs');
const os = require('os');

const csv = require('csv');

const {
  PERIOD_TYPES,
  LOG_TYPES,
} = require('./constants');
const { getPeriodAggregator } = require('./analyze-data/period-aggregate');
const { writePeriodStats } = require('./analyze-data/write-data');

const CSV_PATH = `${__dirname}/log.csv`;
const TIME_STAMP_HEADER = 'time_stamp';
const PING_MS_HEADER = 'ping_ms';
const NUM_CPUS = os.cpus().length;

const MINUTE_PERIOD_GROUP_BY = 1;

(async () => {
  try {
    await main();
  } catch(e) {
    console.log(e);
  }
})();

async function main() {
  let currRowIdx, headers, rowData;
  let periodAggegator;
  let pingSum, numPings, numFailed, numTotal,
    pingMin, pingMax;
  let pingAvg, percentFailed;
  let startMs, endMs, deltaS;
  let heapTotalMb, externalMb, totalMb;

  currRowIdx = 0;
  rowData = [];
  pingSum = 0;
  numPings = 0;
  numFailed = 0;
  numTotal = 0;
  pingMin = Infinity;
  pingMax = -1;

  periodAggegator = getPeriodAggregator(PERIOD_TYPES.MINUTE, MINUTE_PERIOD_GROUP_BY);

  startMs = Date.now();

  await parseCsv(record => {
    let rowObj;
    if(currRowIdx++ === 0) {
      headers = record;
      return;
    }
    numTotal++;
    rowObj = convertRow(headers, record);
    rowObj = convertData(rowObj);
    if(((typeof rowObj.ping_ms) === 'number') ) {
      pingSum = pingSum + rowObj.ping_ms;
      if(rowObj.ping_ms > pingMax) {
        pingMax = rowObj.ping_ms;
      }
      if(rowObj.ping_ms < pingMin) {
        pingMin = rowObj.ping_ms;
      }
      numPings++;
    } else if(((typeof rowObj.ping_ms) === 'string') && (rowObj.ping_ms === 'FAIL')) {
      numFailed++;
    }
    periodAggegator.aggregate(rowObj);
  });

  endMs = Date.now();
  deltaS = +((endMs - startMs) / 1000).toFixed(3);
  pingAvg = +(pingSum / numPings).toFixed(3);
  percentFailed = +(numFailed / numTotal).toFixed(3);
  console.log(`CSV Analyze took ${deltaS}s`);
  console.log('');
  console.log(`numPings: ${numPings}`);
  console.log(`pingSum: ${pingSum}`);
  console.log(`numFailed: ${numFailed}`);
  console.log('');
  console.log(`Average ping: ${pingAvg}ms`)
  console.log(`Percent failed: ${percentFailed}%`);
  console.log('');
  
  
  heapTotalMb = Math.round(process.memoryUsage().heapTotal / 1024 / 1024);
  externalMb = Math.round(process.memoryUsage().external / 1024 / 1024);
  totalMb = heapTotalMb + externalMb;
  console.log(`Process used ${heapTotalMb}mb of heap memory`);
  console.log(`Process used ${externalMb}mb of heap memory`);
  console.log(`Process used ${totalMb}mb of total memory`);
  writePeriodStats(periodAggegator, {
    filterPingMs: pingAvg * Math.LOG2E,
    pingMin,
    filterFailPercent: 5,
  });
}

function parseCsv(recordCb) {
  return new Promise((resolve, reject) => {
    let csvRs, csvParser, csvTransformer;
    
    csvRs = fs.createReadStream(CSV_PATH);

    csvRs.on('error', err => {
      reject(err);
    });

    csvParser = csv.parse();

    csvParser.on('end', resolve);

    csvTransformer = csv.transform(recordCb, {
      // parallel: 1 || NUM_CPUS,
    });

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
    : LOG_TYPES.SUCCESS ;
  return rowObj;
}
