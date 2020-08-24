
const path = require('path');
const { promisify } = require('util');
const fs = require('fs');
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);
const access = promisify(fs.access);

module.exports = {
  mkdirIfNotExist,
  getDirFilePaths,
  exists,
};

async function mkdirIfNotExist(dirPath) {
  try {
    await mkdir(dirPath);
  } catch(e) {
    if(!(e.code === 'EEXIST')) {
      throw e;
    }
  }
}

async function getDirFilePaths(dirPath) {
  let fileNames;
  fileNames = await readdir(dirPath);
  return fileNames.map(fileName => path.join(dirPath, fileName));
}

async function exists(filePath) {
  let fileExists;
  try {
    await access(filePath, fs.constants.F_OK);
    fileExists = true;
  } catch(e) {
    fileExists = false;
  }
  return fileExists;
}
