
module.exports = {
  padTime,
  getMinutesDateString,
  getHoursDateString,
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
