
const child_process = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const mkdir = promisify(fs.mkdir);

const {
  logDir,
  LOG_LEDGER_PATH,
} = require('./constants');
const { padTime } = require('./date-service');

const PING_TARGETS = [
  'www.qualtrics.com',
  'www.github.com',
  'news.ycombinator.com',
  'www.microsoft.com',
  // 'www.usa.gov',
  'www.amazon.com',
  'www.salesforce.com',
];

const DEFAULT_PING_OPTS = {
  wait: 0.5,
  // ttl: 50,
  bytes: (56 + 8) + (8 * 80),
};

const LOG_FILE_PERIOD_MINUTES = 30;

(async () => {
  try {
    await main();
  } catch(e) {
    console.log('error:');
    console.log(e);
  }
})();

async function main() {
  try {
    await mkdir(logDir);
  } catch(e) {
    if(!(e.code === 'EEXIST')) {
      throw e;
    }
  }
  await multiPing(PING_TARGETS, () => {
    return false;
  });
}

async function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

async function multiPing(pingTargets, stopCb) {
  let doStop;
  let doLog, pingEnd;
  let currLogStart, currLogCheck, logStartMinuteRemainder, currLogDelta,
    currLogStartRoundMinutes;
  let logFilePath, pingPromises;
  let logWs, pingEndCb;
  // start a log file, keep a ledge of logfile names
  // Periodically check the timestamp, and stop the pings periodically
  // Restart the pings and start over
  doLog = false;
  while(!(doStop = stopCb())) {
    if(doStop === true) {
      // TODO: teardown
    }
    if(!doLog) {
      doLog = true;
      // deconstruct current writeStream and create a new one
      if(logWs !== undefined) {
        console.log('ending log writestream');
        await endWriteStream(logWs);
      }
      logFilePath = `${logDir}/${getDayStamp(LOG_FILE_PERIOD_MINUTES)}_ping-log.txt`;
      await writeLedgerEntry(logFilePath);
      logWs = fs.createWriteStream(logFilePath, {
        flags: 'a',
      });

      pingEnd = { value: false };
      pingEndCb = () => pingEnd;
      pingPromises = pingTargets.map(pingTarget => {
        let pingOpts;
        pingOpts = Object.assign({}, {
          uri: pingTarget,
        }, DEFAULT_PING_OPTS);
        return ping(pingOpts, pingHandler(logWs), pingEndCb);
      });
      Promise.all(pingPromises)
        .then(() => {
          console.log(`Finished writing logfile: ${logFilePath}`);
        }).catch(err => {
          console.log(`Error writing logs in: ${logFilePath}`);
          console.log(err);
        });
      currLogStart = new Date;
    } else {
      currLogCheck = new Date;
      logStartMinuteRemainder = currLogStart.getMinutes() % LOG_FILE_PERIOD_MINUTES;
      currLogStartRoundMinutes = ((currLogStart.getMinutes() - logStartMinuteRemainder) < 0)
        ? 0
        : currLogStart.getMinutes() - logStartMinuteRemainder;
      currLogDelta = currLogCheck.getMinutes() - currLogStartRoundMinutes;
      if(
        (currLogCheck.getHours() !== currLogStart.getHours())
        || (currLogDelta >= LOG_FILE_PERIOD_MINUTES)
      ) {
        doLog = false;
        pingEnd.value = true;
      } else {
        await sleep(1000);
      }
    }
  }
}

async function endWriteStream(writeStream) {
  return new Promise((resolve, reject) => {
    writeStream.on('error', err => {
      reject(err);
    });

    writeStream.end(() => {
      writeStream.destroy();
    });

    writeStream.on('close', () => {
      resolve();
    });
  });
}

function writeLedgerEntry(logFilePath) {
  return new Promise((resolve, reject) => {
    let ledgerWs;
    ledgerWs = fs.createWriteStream(LOG_LEDGER_PATH, {
      flags: 'a'
    });

    ledgerWs.write(`${logFilePath}\n`, () => {
      ledgerWs.end(() => {
        ledgerWs.destroy();
      });
    });

    ledgerWs.on('close', () => {
      resolve();
    });

    ledgerWs.on('error', err => {
      reject(err);
    });

  });
}

function pingHandler(logWs, graphWs) {
  return (data, uri) => {
    let cols, timeCol, timeVal, timeBar,
      dataStr, outStr;
    let logStr;
    dataStr = data.toString().trim();
    cols = dataStr.split(' ');
    timeCol = cols[cols.length - 2];
    timeVal = timeCol.split('=').pop();
    outStr = stampLog(`${uri} ${dataStr}`);
    if(logWs.writable) {
      logWs.write(`${outStr}\n`);
    }
    if(Number.isNaN(+timeVal)) {
      logStr = `${stampLog(`${uri} FAIL`)}\n`;
    } else {
      timeBar = '='.repeat(Math.round(+timeVal));
      logStr = `${stampLog(`${uri} ${timeVal} ${timeBar}`)}\n`;
    }
    if(graphWs === undefined) {
      process.stdout.write(logStr);
    } else {
      graphWs.write(logStr);
    }
  };
}

function ping(options, cb, endCb) {
  return new Promise((resolve, reject) => {
    let pingProcess, args, uri, wait,
      ttl, bytes;
    args = [];
    uri = options.uri;
    wait = options.wait || 1;
    ttl = options.ttl;
    bytes = options.bytes;
    if(wait !== undefined) {
      args.push('-i', wait);
    }
    if(ttl !== undefined) {
      args.push('-m', ttl);
    }
    if(bytes !== undefined) {
      args.push('-s', bytes);
    }
    args.push(uri);

    pingProcess = child_process.spawn('ping', args);

    pingProcess.stdout.on('data', data => {
      return cb(data, uri);
    });
    pingProcess.on('exit', code => {
      resolve(code);
    });
    pingProcess.on('error', err => {
      reject(err);
    });

    if((typeof endCb) === 'function') {
      (function checkEnd() {
        setTimeout(() => {
          if(endCb().value === true) {
            pingProcess.kill();
          } else {
            checkEnd();
          }
        }, 500);
      })();
    }
  });
}

function getDayStamp(roundMinutes) {
  let date, day, month, year, hours, minutes;
  let roundMinuteRemainder;
  date = new Date;
  year = date.getFullYear();
  day = padTime(date.getDate());
  month = padTime(date.getMonth() + 1);
  hours = padTime(date.getHours());
  minutes = date.getMinutes();
  roundMinuteRemainder = minutes % roundMinutes;
  minutes = minutes - roundMinuteRemainder;
  if(minutes < 0) {
    minutes = 0;
  }
  minutes = padTime(minutes);

  return `${month}-${day}-${year}_${hours}:${minutes}`;
}

function stampLog(toPrint) {
  let time;
  time = (new Date).toISOString();
  return `${time} ${toPrint}`;
}
