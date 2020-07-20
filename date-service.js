
const {
  PERIOD_TYPES,
} = require('./constants');

module.exports = {
  padTime,
  getMinutesDateString,
  getHoursDateString,
  getPeriodDateString,
  getPeriodTimeString,
};

function padTime(timeVal, padTo) {
  if(padTo === undefined) {
    padTo = 2;
  }
  timeVal = timeVal + '';
  if(timeVal.length < padTo) {
    timeVal = timeVal.padStart(padTo, '0');
  }
  return timeVal;
}

function getMinutesDateString(date) {
  let timeString, splatTimeString, month, day, year, dateString;
  splatTimeString = date.toTimeString().split(' ')[0].split(':');
  splatTimeString[2] = '00'; // always default seconds to 00
  timeString = splatTimeString.join(':');
  month = padTime(date.getMonth() + 1);
  day = padTime(date.getDate());
  year = date.getFullYear();
  dateString = `${month}/${day}/${year}`;
  return `${dateString} ${timeString}`;
}

function getHoursDateString(date) {
  let hours, timeString, month, day, year, dateString;
  hours = padTime(date.getHours());
  timeString = `${hours}:00:00`;
  month = padTime(date.getMonth() + 1);
  day = padTime(date.getDate());
  year = date.getFullYear();
  dateString = `${month}/${day}/${year}`;
  return `${dateString} ${timeString}`;
}

function getPeriodDateString(logDate, periodType) {
  switch(periodType) {
    case PERIOD_TYPES.MINUTE:
      return getMinutesDateString(logDate);
    case PERIOD_TYPES.HOUR:
      return getHoursDateString(logDate);
  }
}

function getPeriodTimeString(logDate, periodType, groupByVal) {
  switch(periodType) {
    case PERIOD_TYPES.MINUTE:
      return getMinuteTimeString(logDate, groupByVal);
    case PERIOD_TYPES.HOUR:
      return getHourTimeString(logDate, groupByVal);
  }
}

function getMinuteTimeString(logDate, groupByVal) {
  let timeString, splatTimeString, formattedTimeString;
  let hours, minutes, seconds, minutesRemainder;
  timeString = logDate.toTimeString().split(' ')[0];
  splatTimeString = timeString.split(':');
  hours = splatTimeString[0];
  minutes = splatTimeString[1];
  seconds = '00';
  minutesRemainder = minutes % groupByVal;
  if((minutes - minutesRemainder) < 0) {
    minutes = 0;
  }else if(minutesRemainder !== 0) {
    minutes = minutes - minutesRemainder;
  }
  minutes = padTime(minutes);
  formattedTimeString = [ hours, minutes, seconds ].join(':');
  return formattedTimeString;
}

function getHourTimeString(logDate, groupByVal) {
  let hours;
  hours = padTime(logDate.getHours());
  return `${hours}:00:00`;
}
