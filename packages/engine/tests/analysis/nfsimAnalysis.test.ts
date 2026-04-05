import { describe, expect, it } from 'vitest';
import { analyzeNFsimOutput } from '../../src/services/analysis/NFsimAnalysis';

describe('NFsimAnalysis', () => {
  // -----------------------------------------------------------------------
  // Test 1: Simple dimerization
  // -----------------------------------------------------------------------
  describe('simple dimerization', () => {
    const result = analyzeNFsimOutput({
      speciesTimeSeries: [
        {
          time: 0,
          species: {
            'A(b)': 80,
            'A(b!1).A(b!1)': 10,
          },
        },
      ],
      moleculeTypes: [
        { name: 'A', components: [{ name: 'b' }] },
      ],
    });

    it('should compute complex size histogram', () => {
      const hist = result.complexSizes[0].sizeHistogram;
      expect(hist.get(1)).toBe(80);
      expect(hist.get(2)).toBe(10);
    });

    it('should compute mean complex size', () => {
      // (80*1 + 10*2) / (80+10) = 100/90
      expect(result.complexSizes[0].meanSize).toBeCloseTo(100 / 90, 10);
    });

    it('should compute max complex size', () => {
      expect(result.complexSizes[0].maxSize).toBe(2);
    });

    it('should compute bond occupancy for A(b)', () => {
      const occ = result.bondOccupancies.find(
        o => o.moleculeType === 'A' && o.component === 'b',
      );
      expect(occ).toBeDefined();
      // 80 free A(b) monomers + 10 dimers * 2 molecules each = 100 total A molecules
      // In the dimer A(b!1).A(b!1), both b components are bound -> 10*2 = 20 bound
      // fraction = 20/100 = 0.2
      expect(occ!.timeSeries[0].fractionBound).toBeCloseTo(0.2, 10);
    });
  });

  // -----------------------------------------------------------------------
  // Test 2: Phosphorylation states
  // -----------------------------------------------------------------------
  describe('phosphorylation states', () => {
    const result = analyzeNFsimOutput({
      speciesTimeSeries: [
        {
          time: 0,
          species: {
            'A(s~U)': 60,
            'A(s~P)': 40,
          },
        },
      ],
      moleculeTypes: [
        { name: 'A', components: [{ name: 's', states: ['U', 'P'] }] },
      ],
    });

    it('should compute site state fractions', () => {
      const dist = result.siteStates.find(
        s => s.moleculeType === 'A' && s.component === 's',
      );
      expect(dist).toBeDefined();

      const uFracs = dist!.stateFractions.get('U')!;
      const pFracs = dist!.stateFractions.get('P')!;

      expect(uFracs[0].fraction).toBeCloseTo(0.6, 10);
      expect(pFracs[0].fraction).toBeCloseTo(0.4, 10);
    });

    it('should have all species as monomers', () => {
      const hist = result.complexSizes[0].sizeHistogram;
      expect(hist.get(1)).toBe(100);
      expect(hist.size).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Test 3: Complex with bonds (A-B heterodimer)
  // -----------------------------------------------------------------------
  describe('complex with bonds (heterodimer)', () => {
    const result = analyzeNFsimOutput({
      speciesTimeSeries: [
        {
          time: 0,
          species: {
            'A(b!1).B(a!1)': 30,
            'A(b)': 70,
            'B(a)': 20,
          },
        },
      ],
      moleculeTypes: [
        { name: 'A', components: [{ name: 'b' }] },
        { name: 'B', components: [{ name: 'a' }] },
      ],
    });

    it('should compute bond occupancy for A(b)', () => {
      const occ = result.bondOccupancies.find(
        o => o.moleculeType === 'A' && o.component === 'b',
      );
      expect(occ).toBeDefined();
      // 70 free A + 30 bound A = 100 total; 30 bound => 0.3
      expect(occ!.timeSeries[0].fractionBound).toBeCloseTo(0.3, 10);
    });

    it('should compute bond occupancy for B(a)', () => {
      const occ = result.bondOccupancies.find(
        o => o.moleculeType === 'B' && o.component === 'a',
      );
      expect(occ).toBeDefined();
      // 20 free B + 30 bound B = 50 total; 30 bound => 0.6
      expect(occ!.timeSeries[0].fractionBound).toBeCloseTo(0.6, 10);
    });

    it('should compute complex size histogram with monomers and dimers', () => {
      const hist = result.complexSizes[0].sizeHistogram;
      expect(hist.get(1)).toBe(90); // 70 free A + 20 free B
      expect(hist.get(2)).toBe(30); // 30 A-B dimers
    });

    it('should compute molecules per complex', () => {
      // A: 70 free monomers (70 complexes with 1 A each) + 30 dimers (30 complexes with 1 A each)
      // total A molecules = 100, complexes containing A = 100, mean = 1.0
      const aMean = result.moleculesPerComplex.get('A')!;
      expect(aMean[0].mean).toBeCloseTo(1.0, 10);

      // B: 20 free monomers (20 complexes with 1 B each) + 30 dimers (30 complexes with 1 B each)
      // total B molecules = 50, complexes containing B = 50, mean = 1.0
      const bMean = result.moleculesPerComplex.get('B')!;
      expect(bMean[0].mean).toBeCloseTo(1.0, 10);
    });
  });

  // -----------------------------------------------------------------------
  // Test 4: Time series showing state change over time
  // -----------------------------------------------------------------------
  describe('time series with state change', () => {
    const result = analyzeNFsimOutput({
      speciesTimeSeries: [
        {
          time: 0,
          species: {
            'A(b,s~U)': 90,
            'A(b,s~P)': 10,
            'A(b!1,s~P).B(a!1)': 0,
            'B(a)': 50,
          },
        },
        {
          time: 1,
          species: {
            'A(b,s~U)': 30,
            'A(b,s~P)': 20,
            'A(b!1,s~P).B(a!1)': 50,
            'B(a)': 0,
          },
        },
      ],
      moleculeTypes: [
        { name: 'A', components: [{ name: 'b' }, { name: 's', states: ['U', 'P'] }] },
        { name: 'B', components: [{ name: 'a' }] },
      ],
    });

    it('should track phosphorylation change over time', () => {
      const dist = result.siteStates.find(
        s => s.moleculeType === 'A' && s.component === 's',
      );
      expect(dist).toBeDefined();

      const uFracs = dist!.stateFractions.get('U')!;
      const pFracs = dist!.stateFractions.get('P')!;

      // t=0: 90 U, 10 P => U=0.9, P=0.1
      expect(uFracs[0].time).toBe(0);
      expect(uFracs[0].fraction).toBeCloseTo(0.9, 10);
      expect(pFracs[0].fraction).toBeCloseTo(0.1, 10);

      // t=1: 30 U, 20 P (free) + 50 P (in complex) => 30 U, 70 P => U=0.3, P=0.7
      expect(uFracs[1].time).toBe(1);
      expect(uFracs[1].fraction).toBeCloseTo(0.3, 10);
      expect(pFracs[1].fraction).toBeCloseTo(0.7, 10);
    });

    it('should track bond occupancy change over time', () => {
      const occA = result.bondOccupancies.find(
        o => o.moleculeType === 'A' && o.component === 'b',
      );
      expect(occA).toBeDefined();

      // t=0: 90+10 free A + 0 bound = 0 fraction
      expect(occA!.timeSeries[0].fractionBound).toBeCloseTo(0, 10);
      // t=1: 30+20 free A + 50 bound => 50/100 = 0.5
      expect(occA!.timeSeries[1].fractionBound).toBeCloseTo(0.5, 10);

      const occB = result.bondOccupancies.find(
        o => o.moleculeType === 'B' && o.component === 'a',
      );
      expect(occB).toBeDefined();

      // t=0: 50 free B + 0 bound => 0
      expect(occB!.timeSeries[0].fractionBound).toBeCloseTo(0, 10);
      // t=1: 0 free B + 50 bound => 50/50 = 1.0
      expect(occB!.timeSeries[1].fractionBound).toBeCloseTo(1.0, 10);
    });

    it('should track complex size distribution over time', () => {
      // t=0: 90+10 monomers + 50 monomers (B) + 0 dimers
      expect(result.complexSizes[0].sizeHistogram.get(1)).toBe(150);
      expect(result.complexSizes[0].maxSize).toBe(1);

      // t=1: 30+20 monomers (A) + 0 monomers (B) + 50 dimers
      expect(result.complexSizes[1].sizeHistogram.get(1)).toBe(50);
      expect(result.complexSizes[1].sizeHistogram.get(2)).toBe(50);
      expect(result.complexSizes[1].maxSize).toBe(2);
    });

    it('should track molecules per complex over time', () => {
      const aMean = result.moleculesPerComplex.get('A')!;
      // t=0: all A are monomers -> mean = 1.0
      expect(aMean[0].mean).toBeCloseTo(1.0, 10);
      // t=1: 50 monomers (1 A each) + 50 dimers (1 A each) -> mean = 1.0
      expect(aMean[1].mean).toBeCloseTo(1.0, 10);

      const bMean = result.moleculesPerComplex.get('B')!;
      // t=0: 50 free B monomers -> mean = 1.0
      expect(bMean[0].mean).toBeCloseTo(1.0, 10);
      // t=1: 50 dimers (1 B each) -> mean = 1.0
      expect(bMean[1].mean).toBeCloseTo(1.0, 10);
    });
  });

  // -----------------------------------------------------------------------
  // Test 5: Larger complex (trimer) and molecules-per-complex > 1
  // -----------------------------------------------------------------------
  describe('trimer with multiple molecules of same type', () => {
    const result = analyzeNFsimOutput({
      speciesTimeSeries: [
        {
          time: 0,
          species: {
            'A(b!1,c!2).A(b!3,c).B(a!1,d!3,e!2)': 20,
            'A(b,c)': 60,
            'B(a,d,e)': 30,
          },
        },
      ],
      moleculeTypes: [
        { name: 'A', components: [{ name: 'b' }, { name: 'c' }] },
        { name: 'B', components: [{ name: 'a' }, { name: 'd' }, { name: 'e' }] },
      ],
    });

    it('should detect size-3 complexes', () => {
      const hist = result.complexSizes[0].sizeHistogram;
      expect(hist.get(1)).toBe(90); // 60 A monomers + 30 B monomers
      expect(hist.get(3)).toBe(20); // 20 trimers
    });

    it('should compute molecules per complex for multi-molecule complexes', () => {
      const aMean = result.moleculesPerComplex.get('A')!;
      // A appears in: 60 monomers (1 A each, 60 complexes) + 20 trimers (2 A each, 20 complexes)
      // total A = 60 + 40 = 100, complexes containing A = 60 + 20 = 80
      // mean = 100/80 = 1.25
      expect(aMean[0].mean).toBeCloseTo(1.25, 10);

      const bMean = result.moleculesPerComplex.get('B')!;
      // B appears in: 30 monomers (1 B each) + 20 trimers (1 B each)
      // total B = 50, complexes = 50, mean = 1.0
      expect(bMean[0].mean).toBeCloseTo(1.0, 10);
    });

    it('should compute mean complex size', () => {
      // (90*1 + 20*3) / (90+20) = 150/110
      expect(result.complexSizes[0].meanSize).toBeCloseTo(150 / 110, 10);
    });
  });

  // -----------------------------------------------------------------------
  // Test 6: Zero-count species should be ignored
  // -----------------------------------------------------------------------
  describe('zero-count species', () => {
    const result = analyzeNFsimOutput({
      speciesTimeSeries: [
        {
          time: 0,
          species: {
            'A(b)': 100,
            'A(b!1).A(b!1)': 0,
          },
        },
      ],
      moleculeTypes: [
        { name: 'A', components: [{ name: 'b' }] },
      ],
    });

    it('should not include zero-count species in histogram', () => {
      const hist = result.complexSizes[0].sizeHistogram;
      expect(hist.get(1)).toBe(100);
      expect(hist.has(2)).toBe(false);
    });

    it('should have zero bond occupancy when all are free', () => {
      const occ = result.bondOccupancies.find(
        o => o.moleculeType === 'A' && o.component === 'b',
      );
      expect(occ!.timeSeries[0].fractionBound).toBe(0);
    });
  });
});
