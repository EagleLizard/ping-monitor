
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

function getMinutesDateString(date, options) {
  let rawHours, hours, minutes, seconds,
    timeString, splatTimeString, month, day,
    year, dateString, amPmHours, amPmPostfix;
  options = options || {};
  rawHours = date.getHours();
  if(options.amPm === true) {
    amPmHours = getAmPmHours(rawHours);
    hours = amPmHours[0];
    amPmPostfix = amPmHours[1];
  } else {
    hours = padTime(rawHours);
  }
  splatTimeString = date.toTimeString().split(' ')[0].split(':');
  minutes = splatTimeString[1];
  seconds = '00'; // always default seconds to 00
  timeString = `${hours}:${minutes}`;
  month = padTime(date.getMonth() + 1);
  day = padTime(date.getDate());
  year = date.getFullYear();
  dateString = `${month}/${day}/${year}`;
  return `${dateString} ${timeString} ${amPmPostfix || ''}`;
}

function getHoursDateString(date, options) {
  let rawHours, amPmPostfix, hours, timeString, month,
    day, year, dateString, amPmHours;
  options = options || {};
  rawHours = date.getHours();
  console.log(options);
  if(options.amPm === true) {
    amPmHours = getAmPmHours(rawHours);
    hours = amPmHours[0];
    amPmPostfix = amPmHours[1];
  } else {
    hours = padTime(date.getHours());
  }
  timeString = `${hours}:00:00`;
  month = padTime(date.getMonth() + 1);
  day = padTime(date.getDate());
  year = date.getFullYear();
  dateString = `${month}/${day}/${year}`;
  return `${dateString} ${timeString} ${amPmPostfix || ''}`;
}

function getAmPmHours(rawHours) {
  let hours, amPmPostfix;
  if(rawHours > 12) {
    amPmPostfix = 'PM';
    hours = padTime(rawHours - 12);
  } else {
    amPmPostfix = 'AM';
    hours = padTime(rawHours);
  }
  
  return [ hours, amPmPostfix ];
}

function getPeriodDateString(logDate, periodType, options) {
  options = Object.assign({}, {
    amPm: false,
  }, options);
  switch(periodType) {
    case PERIOD_TYPES.MINUTE:
      return getMinutesDateString(logDate, options);
    case PERIOD_TYPES.HOUR:
      return getHoursDateString(logDate, options);
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
