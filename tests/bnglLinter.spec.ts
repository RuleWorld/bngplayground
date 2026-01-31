/**
 * Tests for BNGL Linter
 */

import { describe, it, expect } from 'vitest';
import { parseBNGL } from '../services/parseBNGL';
import { lintBNGL, LintDiagnostic } from '../services/bnglLinter';

function findByCode(diagnostics: LintDiagnostic[], code: string): LintDiagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}

describe('BNGL Linter', () => {
  describe('Undefined Molecule Types', () => {
    it('should detect undefined molecule types in species', () => {
      const code = `
        begin molecule types
          A(b)
        end molecule types
        begin seed species
          A(b) 100
          UndefinedMol(x) 50
        end seed species
      `;
      const model = parseBNGL(code);
      const result = lintBNGL(model);

      const issues = findByCode(result.diagnostics, 'UNDEFINED_MOLECULE_TYPE');
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].message).toContain('UndefinedMol');
    });

    it('should not report defined molecule types', () => {
      const code = `
        begin molecule types
          A(b)
          B(a)
        end molecule types
        begin seed species
          A(b) 100
          B(a) 50
        end seed species
      `;
      const model = parseBNGL(code);
      const result = lintBNGL(model);

      const issues = findByCode(result.diagnostics, 'UNDEFINED_MOLECULE_TYPE');
      expect(issues.length).toBe(0);
    });
  });

  describe('Undefined Components', () => {
    it('should detect undefined components', () => {
      const code = `
        begin molecule types
          A(b)
        end molecule types
        begin seed species
          A(b,c) 100
        end seed species
      `;
      const model = parseBNGL(code);
      const result = lintBNGL(model);

      const issues = findByCode(result.diagnostics, 'UNDEFINED_COMPONENT');
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].message).toContain("'c'");
    });
  });

  describe('Undefined States', () => {
    it('should detect undefined states', () => {
      const code = `
        begin molecule types
          A(b~U~P)
        end molecule types
        begin seed species
          A(b~X) 100
        end seed species
      `;
      const model = parseBNGL(code);
      const result = lintBNGL(model);

      const issues = findByCode(result.diagnostics, 'UNDEFINED_STATE');
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].message).toContain("'X'");
    });

    it('should allow wildcard states', () => {
      const code = `
        begin molecule types
          A(b~U~P)
        end molecule types
        begin observables
          Molecules A_any A(b~?)
        end observables
      `;
      const model = parseBNGL(code);
      const result = lintBNGL(model);

      const issues = findByCode(result.diagnostics, 'UNDEFINED_STATE');
      expect(issues.length).toBe(0);
    });
  });

  describe('Symmetric Sites', () => {
    it('should warn about symmetric sites', () => {
      const code = `
        begin molecule types
          A(b,b)
        end molecule types
      `;
      const model = parseBNGL(code);
      const result = lintBNGL(model);

      const issues = findByCode(result.diagnostics, 'SYMMETRIC_SITES');
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].message).toContain('2 components');
    });

    it('should not warn about distinct sites', () => {
      const code = `
        begin molecule types
          A(b1,b2)
        end molecule types
      `;
      const model = parseBNGL(code);
      const result = lintBNGL(model);

      const issues = findByCode(result.diagnostics, 'SYMMETRIC_SITES');
      expect(issues.length).toBe(0);
    });
  });

  describe('Unused Definitions', () => {
    it('should detect unused molecule types', () => {
      const code = `
        begin molecule types
          A(b)
          UnusedMol(x)
        end molecule types
        begin seed species
          A(b) 100
        end seed species
      `;
      const model = parseBNGL(code);
      const result = lintBNGL(model);

      const issues = findByCode(result.diagnostics, 'UNUSED_MOLECULE_TYPE');
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].message).toContain('UnusedMol');
    });

    it('should detect unused parameters', () => {
      const code = `
        begin parameters
          kf 1.0
          unused_param 42.0
        end parameters
        begin molecule types
          A(b)
        end molecule types
        begin reaction rules
          A(b) -> A(b) kf
        end reaction rules
      `;
      const model = parseBNGL(code);
      const result = lintBNGL(model);

      const issues = findByCode(result.diagnostics, 'UNUSED_PARAMETER');
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].message).toContain('unused_param');
    });

    it('should not flag parameters used as seed species initial concentrations', () => {
      const code = `
        begin parameters
          AMPK_tot 800
        end parameters
        begin molecule types
          AMPK(s~U~P)
        end molecule types
        begin seed species
          AMPK(s~U) AMPK_tot
        end seed species
      `;

      const model = parseBNGL(code);
      const result = lintBNGL(model, {}, code);

      const issues = findByCode(result.diagnostics, 'UNUSED_PARAMETER');
      // No unused parameter diagnostics for AMPK_tot
      expect(issues.some(i => i.location?.name === 'AMPK_tot')).toBe(false);
    });

    it('should not flag parameters used as seed species initial concentrations without source', () => {
      const code = `
        begin parameters
          AMPK_tot 800
        end parameters
        begin molecule types
          AMPK(s~U~P)
        end molecule types
        begin seed species
          AMPK(s~U) AMPK_tot
        end seed species
      `;

      const model = parseBNGL(code);
      // Call linter without passing sourceCode; should use species.initialExpression
      const result = lintBNGL(model);

      const issues = findByCode(result.diagnostics, 'UNUSED_PARAMETER');
      expect(issues.some(i => i.location?.name === 'AMPK_tot')).toBe(false);
    });
  });

  describe('Duplicate Definitions', () => {
    it('should detect duplicate observable names', () => {
      const code = `
        begin molecule types
          A(b~U~P)
        end molecule types
        begin observables
          Molecules A_phos A(b~P)
          Molecules A_phos A(b~U)
        end observables
      `;
      const model = parseBNGL(code);
      const result = lintBNGL(model);

      const issues = findByCode(result.diagnostics, 'DUPLICATE_OBSERVABLE');
      expect(issues.length).toBeGreaterThan(0);
    });
  });

  describe('Compartments', () => {
    it('should detect undefined compartments in species', () => {
      const code = `
        begin molecule types
          A(b)
        end molecule types
        begin compartments
          cytoplasm 3 1.0
        end compartments
        begin seed species
          A(b)@undefined_comp 100
        end seed species
      `;
      const model = parseBNGL(code);
      const result = lintBNGL(model);

      const issues = findByCode(result.diagnostics, 'UNDEFINED_COMPARTMENT');
      expect(issues.length).toBeGreaterThan(0);
    });

    it('should detect undefined parent compartments', () => {
      const code = `
        begin compartments
          membrane 2 1.0 undefined_parent
        end compartments
      `;
      const model = parseBNGL(code);
      const result = lintBNGL(model);

      const issues = findByCode(result.diagnostics, 'UNDEFINED_PARENT_COMPARTMENT');
      expect(issues.length).toBeGreaterThan(0);
    });
  });

  describe('Rate Expressions', () => {
    it('should detect zero rate constants', () => {
      const code = `
        begin molecule types
          A(b)
        end molecule types
        begin reaction rules
          A(b) -> A(b) 0
        end reaction rules
      `;
      const model = parseBNGL(code);
      const result = lintBNGL(model);

      const issues = findByCode(result.diagnostics, 'ZERO_RATE');
      expect(issues.length).toBeGreaterThan(0);
    });

    it('should detect undefined parameters in rates', () => {
      const code = `
        begin parameters
          kf 1.0
        end parameters
        begin molecule types
          A(b)
        end molecule types
        begin reaction rules
          A(b) -> A(b) undefined_rate
        end reaction rules
      `;
      const model = parseBNGL(code);
      const result = lintBNGL(model);

      const issues = findByCode(result.diagnostics, 'UNDEFINED_PARAMETER');
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].message).toContain('undefined_rate');
    });
  });

  describe('Zero Concentrations', () => {
    it('should note species with zero concentration', () => {
      const code = `
        begin molecule types
          A(b)
        end molecule types
        begin seed species
          A(b) 0
        end seed species
      `;
      const model = parseBNGL(code);
      const result = lintBNGL(model);

      const issues = findByCode(result.diagnostics, 'ZERO_INITIAL_CONCENTRATION');
      expect(issues.length).toBeGreaterThan(0);
    });
  });

  describe('Reachability', () => {
    it('should warn about rules that can never fire', () => {
      const code = `
        begin parameters
          kf 1.0
        end parameters
        begin molecule types
          A(b)
          B(b)
        end molecule types
        begin seed species
          A(b) 100
        end seed species
        begin reaction rules
          B(b) -> B(b) kf
        end reaction rules
      `;
      const model = parseBNGL(code);
      const result = lintBNGL(model);

      const issues = findByCode(result.diagnostics, 'UNREACHABLE_RULE');
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].message).toContain('Rule');
    });

    it('should respect disabling the reachability check', () => {
      const code = `
        begin parameters
          kf 1.0
        end parameters
        begin molecule types
          A(b)
          B(b)
        end molecule types
        begin seed species
          A(b) 100
        end seed species
        begin reaction rules
          B(b) -> B(b) kf
        end reaction rules
      `;
      const model = parseBNGL(code);

      const result = lintBNGL(model, { checkReachability: false });
      const issues = findByCode(result.diagnostics, 'UNREACHABLE_RULE');
      expect(issues.length).toBe(0);
    });
  });

  describe('Options', () => {
    it('should respect disabled checks', () => {
      const code = `
        begin molecule types
          A(b,b)
        end molecule types
      `;
      const model = parseBNGL(code);

      const resultEnabled = lintBNGL(model, { checkSymmetricSites: true });
      expect(findByCode(resultEnabled.diagnostics, 'SYMMETRIC_SITES').length).toBeGreaterThan(0);

      const resultDisabled = lintBNGL(model, { checkSymmetricSites: false });
      expect(findByCode(resultDisabled.diagnostics, 'SYMMETRIC_SITES').length).toBe(0);
    });
  });

  describe('Clean Model', () => {
    it('should report no errors for a well-formed model', () => {
      const code = `
        begin parameters
          kf 1.0
          kr 0.1
        end parameters

        begin molecule types
          A(b)
          B(a~U~P)
        end molecule types

        begin seed species
          A(b) 100
          B(a~U) 50
        end seed species

        begin observables
          Molecules A_total A()
          Molecules B_phos B(a~P)
        end observables

        begin reaction rules
          A(b) + B(a~U) -> A(b!1).B(a~U!1) kf
          A(b!1).B(a!1) -> A(b) + B(a) kr
        end reaction rules
      `;
      const model = parseBNGL(code);
      const result = lintBNGL(model);

      expect(result.summary.errors).toBe(0);
    });
  });
});