
import path from 'path';
import fs, { WriteStream } from 'fs';

import { BASE_PATH } from '../constants';
import { getLocaleTimestamp } from '../date-service';
import { mkdirIfNotExist } from '../files';
import { sleep } from './sleep';

const DEBUG_FILE_DIR = path.join(BASE_PATH, 'debug-logs');
const MB_PRECISION = 3;
const MB_PRECISION_EXPONENT = Math.pow(10, MB_PRECISION);
const SAMPLE_MS = 1e3 * 15;

const HEADER_COL = [
  'timestamp',
  'heapTotal_mb',
  'heapUsed_mb',
  'external_mb',
  'arrayBuffers_mb',
  'user_ms',
  'system_ms',
];

export async function startResourceMonitor() {
  let timestamp: string, debugFileName: string, debugFilePath: string;
  let debugWriteStream: WriteStream;
  timestamp = getLocaleTimestamp({
    ms: false,
  });
  debugFileName = `${timestamp}_resource.log`;
  debugFilePath = path.join(DEBUG_FILE_DIR, debugFileName);
  await mkdirIfNotExist(DEBUG_FILE_DIR);

  debugWriteStream = fs.createWriteStream(debugFilePath);
  while(!debugWriteStream.writable) {
    await sleep(0);
  }
  const startCpuUsage = process.cpuUsage();
  resourceMonitor(debugWriteStream, startCpuUsage, true);
}

function resourceMonitor(writeStream: WriteStream, lastCpuUsage: NodeJS.CpuUsage, firstWrite?: boolean) {
  let timestamp: string, memoryUsage: NodeJS.MemoryUsage, logCols: string[], logStr: string;
  let cpuUsage: NodeJS.CpuUsage, nextCpuUsage: NodeJS.CpuUsage;

  if(firstWrite === true) {
    writeStream.write(`${HEADER_COL.join(' ')}\n`);
  }

  timestamp = getLocaleTimestamp();
  memoryUsage = process.memoryUsage();
  cpuUsage = process.cpuUsage(lastCpuUsage);

  logCols = [
    timestamp,
    convertToMb(memoryUsage.heapTotal),
    convertToMb(memoryUsage.heapUsed),
    convertToMb(memoryUsage.external),
    convertToMb(memoryUsage.arrayBuffers),
    convertMicrosecondsToMilliseconds(cpuUsage.user),
    convertMicrosecondsToMilliseconds(cpuUsage.system),
  ].map(val => `${val}`);

  logStr = `${logCols.join(' ')}\n`;
  writeStream.write(logStr);

  nextCpuUsage = process.cpuUsage();

  setTimeout(() => {
    resourceMonitor(writeStream, nextCpuUsage);
  }, SAMPLE_MS);
}

function convertToMb(bytes: number): number {
  let mb: number;
  mb = Math.round((bytes / 1024 / 1024) * MB_PRECISION_EXPONENT) / MB_PRECISION_EXPONENT;
  return mb;
}

function convertMicrosecondsToMilliseconds(microseconds: number) {
  return Math.round(microseconds / 1e3);
}
