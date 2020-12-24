
import {
  MAIN_ARGS,
} from './constants';
import { convertLogs } from './parse-data/csv-convert';
import { pingMain } from './ping/ping-main';
import { pingMainV2 } from './ping/ping-main-v2';
import { watchLogs } from './ping/watch-aggregate';

import sourceMapSupport from 'source-map-support';
sourceMapSupport.install();

const PARSE_ARG = process.argv[2];

(async () => {
  try {
    await main();
  } catch(e) {
    console.log('error:');
    console.log(e);
  }
})();

async function main() {
  switch(PARSE_ARG) {
    case MAIN_ARGS.CONVERT_CSV:
      return convertLogs();
    case MAIN_ARGS.WATCH:
      return watchLogs();
    case MAIN_ARGS.V2:
      return await pingMainV2();
    default:
      return await pingMain();
  }
}
