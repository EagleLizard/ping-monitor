
module.exports = {
  scaleTo,
};

function scaleTo(n, fromRange, toRange) {
  let fromMin, fromMax, toMin, toMax;
  let rangeDelta, nDelta, scaled;
  [ fromMin, fromMax ] = fromRange;
  [ toMin, toMax ] = toRange;
  scaled = (((toMax - toMin) * (n - fromMin)) / (fromMax - fromMin)) + toMin;
  return scaled;
}
