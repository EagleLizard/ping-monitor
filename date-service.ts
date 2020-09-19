
import {
  PERIOD_TYPES,
} from './constants';

export {
  padTime,
  getMinutesDateString,
  getHoursDateString,
  getPeriodDateString,
  getPeriodTimeString,
};

function padTime(timeVal: number, padTo?: number) {
  let timeValString: string;
  if(padTo === undefined) {
    padTo = 2;
  }
  timeValString = timeVal + '';
  if(timeValString.length < padTo) {
    timeValString = timeValString.padStart(padTo, '0');
  }
  return timeValString;
}

type GetDateStringOptions = {
  amPm: boolean;
}

function getMinutesDateString(date: Date, options: GetDateStringOptions) {
  let rawHours: number, hours: string, minutes: string,
    timeString: string, splatTimeString: string[], month: string, day: string,
    year: number, dateString: string, amPmHours: string[], amPmPostfix: string;
  options = options || { amPm: false };
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
  // seconds = '00'; // always default seconds to 00
  timeString = `${hours}:${minutes}`;
  month = padTime(date.getMonth() + 1);
  day = padTime(date.getDate());
  year = date.getFullYear();
  dateString = `${month}/${day}/${year}`;
  return `${dateString} ${timeString} ${amPmPostfix || ''}`;
}

function getHoursDateString(date: Date, options: GetDateStringOptions) {
  let rawHours: number, amPmPostfix: string, hours: string, timeString: string, month: string,
    day: string, year: number, dateString: string, amPmHours: string[];
  options = options || { amPm: false };
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

function getAmPmHours(rawHours: number) {
  let hours: string, amPmPostfix: string;
  if(rawHours > 12) {
    amPmPostfix = 'PM';
    hours = padTime(rawHours - 12);
  } else {
    amPmPostfix = 'AM';
    hours = padTime(rawHours);
  }

  return [ hours, amPmPostfix ];
}

function getPeriodDateString(logDate: Date, periodType: PERIOD_TYPES, options: GetDateStringOptions) {
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

function getPeriodTimeString(logDate: Date, periodType: PERIOD_TYPES, groupByVal: number) {
  switch(periodType) {
    case PERIOD_TYPES.MINUTE:
      return getMinuteTimeString(logDate, groupByVal);
    case PERIOD_TYPES.HOUR:
      return getHourTimeString(logDate);
  }
}

function getMinuteTimeString(logDate: Date, groupByVal: number) {
  let timeString: string, splatTimeString: string[], formattedTimeString: string;
  let hours: string, minutes: number, seconds: string, minutesRemainder: number;
  let minutesString: string;
  timeString = logDate.toTimeString().split(' ')[0];
  splatTimeString = timeString.split(':');
  hours = splatTimeString[0];
  minutes = +splatTimeString[1];
  seconds = '00';
  minutesRemainder = minutes % groupByVal;
  if((minutes - minutesRemainder) < 0) {
    minutes = 0;
  } else if(minutesRemainder !== 0) {
    minutes = minutes - minutesRemainder;
  }
  minutesString = padTime(minutes);
  formattedTimeString = [ hours, minutesString, seconds ].join(':');
  return formattedTimeString;
}

function getHourTimeString(logDate: Date) {
  let hours: string;
  hours = padTime(logDate.getHours());
  return `${hours}:00:00`;
}
