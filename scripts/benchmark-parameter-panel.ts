import { performance } from 'perf_hooks';

interface Parameter {
  name: string;
  value: number;
  lineIndex: number;
}

interface LocalParameterState extends Parameter {
  initialValue: number;
  sliderValue: number;
}

// Generate large array
const numParams = 5000;
const parsedParams: Parameter[] = Array.from({ length: numParams }, (_, i) => ({
  name: `param_${i}`,
  value: i * 0.1,
  lineIndex: i
}));

const prev: LocalParameterState[] = Array.from({ length: numParams }, (_, i) => ({
  name: `param_${i}`,
  value: i * 0.1,
  lineIndex: i,
  initialValue: i * 0.1,
  sliderValue: 0
}));

// Function to measure
function testBaseline() {
  const start = performance.now();
  parsedParams.map(p => {
    const existing = prev.find(e => e.name === p.name);
    let isDifferent = true;
    if (existing) {
      const diff = Math.abs(p.value - existing.value);
      if (p.value === 0) {
        isDifferent = diff > 1e-9;
      } else {
        isDifferent = (diff / Math.abs(p.value)) > 1e-3;
      }
    }
    if (isDifferent || !existing) {
      return { ...p, initialValue: p.value, sliderValue: 0 };
    } else {
      return { ...existing, lineIndex: p.lineIndex, value: p.value };
    }
  });
  const end = performance.now();
  return end - start;
}

function testOptimized() {
  const start = performance.now();
  const prevMap = new Map<string, LocalParameterState>();
  for (const e of prev) {
    prevMap.set(e.name, e);
  }
  parsedParams.map(p => {
    const existing = prevMap.get(p.name);
    let isDifferent = true;
    if (existing) {
      const diff = Math.abs(p.value - existing.value);
      if (p.value === 0) {
        isDifferent = diff > 1e-9;
      } else {
        isDifferent = (diff / Math.abs(p.value)) > 1e-3;
      }
    }
    if (isDifferent || !existing) {
      return { ...p, initialValue: p.value, sliderValue: 0 };
    } else {
      return { ...existing, lineIndex: p.lineIndex, value: p.value };
    }
  });
  const end = performance.now();
  return end - start;
}

console.log('Baseline (O(N^2)):');
let baseSum = 0;
for(let i=0; i<10; i++) baseSum += testBaseline();
console.log(baseSum / 10 + ' ms');

console.log('Optimized (O(N)):');
let optSum = 0;
for(let i=0; i<10; i++) optSum += testOptimized();
console.log(optSum / 10 + ' ms');
