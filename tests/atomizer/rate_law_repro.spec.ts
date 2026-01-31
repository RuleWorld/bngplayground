import { describe, it, expect, beforeAll } from 'vitest';
import { evaluateFunctionalRate, expandRateLawMacros, _setEvaluatorRefForTests } from '../../services/simulation/ExpressionEvaluator';
import { SafeExpressionEvaluator } from '../../services/safeExpressionEvaluator';

describe('Rate Law Parity Audit', () => {
  beforeAll(() => {
     _setEvaluatorRefForTests(SafeExpressionEvaluator);
  });
    // Test Sat(k, K) -> k / (K + S)
    // Expected Velocity = k * S / (K + S)
    // Simulator multiplies by S externally, so we verify the factor: k / (K + S)
    it('should evaluate Sat(k, K) correctly', () => {
        const k = 10;
        const K = 5;
        const S = 5; // [S] = Km

        // Sat(10, 5) with S=5
        // Factor = 10 / (5 + 5) = 1.0
        // Rate = 1.0 * 5 = 5.0
        // Theoretically V = Vmax * S / (Km + S) = 10 * 5 / 10 = 5.0. Matches.

        const expr = expandRateLawMacros('Sat(k, K)', 'S');
        const result = evaluateFunctionalRate(expr, { k, K }, { S });

        console.log(`Sat(10, 5) at S=5: Factor=${result}, Rate=${result * S}`);
        expect(result).toBeCloseTo(1.0, 5);
    });

    // Test MM(kcat, Km) using standard Michaelis-Menten approximation
    // BNG2 uses: rate = kcat * Et * FreeS / (Km + FreeS)
    // Our evaluator returns a FACTOR 'f' such that rate = f * St * Et
    // So f = kcat * FreeS / (Km + FreeS) / St
    it('should evaluate MM(kcat, Km) correctly', () => {
        const kcat = 10;
        const Km = 5;
        const St = 100; // Substrate (ridx0)
        const Et = 1;   // Enzyme (ridx1)

        // Case 1: Substrate Excess (St >> Et)
        // FreeS approx St
        // Rate approx kcat * Et * St / (Km + St)
        // Rate approx 10 * 1 * 100 / (5 + 100) = 1000 / 105 = 9.5238
        // Expected Factor f = Rate / (St * Et) = 9.5238 / 100 = 0.095238

        const expr = expandRateLawMacros('MM(kcat, Km)', 'St', 'Et');
        const result = evaluateFunctionalRate(expr, { kcat, Km }, { St, Et });

        const calculatedRate = result * St * Et;
        console.log(`MM(10, 5) at St=100, Et=1: Factor=${result}, Rate=${calculatedRate}`);

        // Verify roughly matches standard MM
        const standardMM = (kcat * Et * St) / (Km + St);
        console.log(`Standard MM Rate: ${standardMM}`);

        expect(calculatedRate).toBeCloseTo(standardMM, 1);
    });

    // Test MM(kcat, Km) under Tight Binding (St ~ Et)
    // Here FreeS != St, so standard MM fails, but BNG2's quadratic solution works
    it('should evaluate MM(kcat, Km) correctly under tight binding', () => {
        const kcat = 10;
        const Km = 1; // High affinity
        const St = 10;
        const Et = 8;

        // b = St - Et - Km = 10 - 8 - 1 = 1
        // sqrtTerm = sqrt(1 + 4*10*1) = sqrt(41) = 6.403
        // FreeS = 0.5 * (1 + 6.403) = 3.7015

        // Rate = kcat * Et * FreeS / (Km + FreeS)
        // Rate = 10 * 8 * 3.7015 / (1 + 3.7015) = 296.12 / 4.7015 = 62.98

        // Expected Factor f = Rate / (St * Et) = 62.98 / 80 = 0.787

        const expr = expandRateLawMacros('MM(kcat, Km)', 'St', 'Et');
        const result = evaluateFunctionalRate(expr, { kcat, Km }, { St, Et });

        const rate = result * St * Et;
        console.log(`MM(10, 1) tight binding St=10, Et=8: Rate=${rate}`);

        const b = St - Et - Km;
        const freeS_manual = 0.5 * (b + Math.sqrt(b * b + 4 * St * Km));
        const manualRate = kcat * Et * freeS_manual / (Km + freeS_manual);

        expect(rate).toBeCloseTo(manualRate, 4);
    });
});
