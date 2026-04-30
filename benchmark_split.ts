function origParse(str: string) {
    return str.split(',').map(s => s.trim()).filter(s => s);
}

function parseCommaSeparated(str: string): string[] {
  const result: string[] = [];
  let start = 0;
  let end = 0;
  while ((end = str.indexOf(',', start)) !== -1) {
    const part = str.substring(start, end).trim();
    if (part) result.push(part);
    start = end + 1;
  }
  const lastPart = str.substring(start).trim();
  if (lastPart) result.push(lastPart);
  return result;
}

const testStr = "S1 , S2, S3,  S4 ,S5";

for (let i = 0; i < 5; i++) {
    origParse(testStr);
    parseCommaSeparated(testStr);
}

const start1 = performance.now();
for (let i = 0; i < 100000; i++) {
    origParse(testStr);
}
const end1 = performance.now();

const start2 = performance.now();
for (let i = 0; i < 100000; i++) {
    parseCommaSeparated(testStr);
}
const end2 = performance.now();

console.log(`Original: ${end1 - start1} ms`);
console.log(`Optimized: ${end2 - start2} ms`);
