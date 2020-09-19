
export {
  chunk,
};

function chunk<T>(arr: T[], size: number) {
  let chunks;
  chunks = [];
  for(let i = 0; i < arr.length; i = i + size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
