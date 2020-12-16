
import path from 'path';
import { promisify } from 'util';
import fs from 'fs';
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);
const access = promisify(fs.access);
export const readFile = promisify(fs.readFile);

export async function mkdirIfNotExist(dirPath: string) {
  try {
    await mkdir(dirPath);
  } catch(e) {
    if(!(e.code === 'EEXIST')) {
      throw e;
    }
  }
}

export async function getDirFilePaths(dirPath: string) {
  let fileNames;
  fileNames = await readdir(dirPath);
  return fileNames.map(fileName => path.join(dirPath, fileName));
}

export async function exists(filePath: string) {
  let fileExists;
  try {
    await access(filePath, fs.constants.F_OK);
    fileExists = true;
  } catch(e) {
    fileExists = false;
  }
  return fileExists;
}
