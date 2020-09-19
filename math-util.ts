
export {
  scaleTo,
};

function scaleTo(n: number, fromRange: [ number, number ], toRange: [ number, number ]) {
  let fromMin: number, fromMax: number, toMin: number, toMax: number;
  let rangeDelta: number, nDelta: number, scaled: number;
  [ fromMin, fromMax ] = fromRange;
  [ toMin, toMax ] = toRange;
  scaled = (((toMax - toMin) * (n - fromMin)) / (fromMax - fromMin)) + toMin;
  return scaled;
}
