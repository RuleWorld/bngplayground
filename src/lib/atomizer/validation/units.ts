/**
 * SBML unit conversion for the atomizer.
 *
 * The parser captures every <unitDefinition> as tuples [kind, scale, exponent, multiplier], but the
 * main BNGL path never used them: parameters, species initial values, and compartment sizes were
 * emitted verbatim, and only 10^(scale*exponent) was applied on the spatial path — the multiplier
 * and the choice of base unit were dropped. That silently corrupts any model not already expressed
 * in the units the downstream Na*V count conversion assumes (mole / litre / second).
 *
 * This module computes the scalar factor that converts a declared unit to its SI base
 * (factor = Π (multiplier · 10^scale)^exponent over the unit's terms) and applies it uniformly:
 *   - parameter value      *= factor(parameter units)
 *   - species amount       *= factor(substance units)
 *   - species concentration*= factor(substance units) / factor(volume units of its compartment)
 *   - compartment size     *= factor(size units for its dimensionality)
 * The result is a dimensionally-consistent SI model, after which the existing conc·Na·V step yields
 * molecule counts and time is in seconds. Undeclared/dimensionless units give factor 1 (no-op), so
 * models without unit declarations — including BNG round-trips — are unaffected. Every non-trivial
 * rescale is recorded as a warning so the transformation is auditable.
 */

import type { SBMLModel, SBMLImportWarning } from '../config/types';

/** SI base unit names that are already the internal base (factor 1). */
const SI_BASE_UNITY = new Set([
  'mole', 'litre', 'liter', 'second', 'dimensionless', 'item',
  'kilogram', 'gram', 'metre', 'meter', 'kelvin', 'ampere', 'candela',
  'radian', 'steradian', 'hertz', 'newton', 'pascal', 'joule', 'watt',
  'coulomb', 'volt', 'farad', 'ohm', 'siemens', 'weber', 'tesla',
  'henry', 'lumen', 'lux', 'becquerel', 'gray', 'sievert', 'katal',
]);

type UnitTerm = [number, number, number, number]; // [kind, scale, exponent, multiplier]

/** factor = Π (multiplier · 10^scale)^exponent  over all terms of the unit definition. */
export function unitConversionFactor(terms: UnitTerm[]): number {
  let factor = 1;
  for (const t of terms) {
    const scale = Number.isFinite(t[1]) ? t[1] : 0;
    const exponent = Number.isFinite(t[2]) ? t[2] : 1;
    const multiplier = Number.isFinite(t[3]) ? t[3] : 1;
    factor *= Math.pow(multiplier * Math.pow(10, scale), exponent);
  }
  return factor;
}

/** Resolve a unit id to its numeric conversion factor. Unknown / base / empty → 1. */
export function resolveUnitFactor(unitId: string | undefined, model: SBMLModel): number {
  if (!unitId) return 1;
  const defs = model.unitDefinitions as Map<string, UnitTerm[]> | undefined;
  if (defs && defs.has(unitId)) {
    const f = unitConversionFactor(defs.get(unitId)!);
    return Number.isFinite(f) && f !== 0 ? f : 1;
  }
  if (SI_BASE_UNITY.has(unitId.toLowerCase())) return 1;
  return 1; // unknown unit id: no scaling rather than a wrong guess
}

/**
 * Scale parameters, species initial values, and compartment sizes into SI base units in place.
 * Returns the diagnostics for each non-trivial rescale.
 */
export function applyUnitScaling(model: SBMLModel): SBMLImportWarning[] {
  const warnings: SBMLImportWarning[] = [];
  const near1 = (f: number) => Math.abs(f - 1) < 1e-12;

  const substanceDefault = model.substanceUnits;
  const volumeDefault = model.volumeUnits;
  const areaDefault = model.areaUnits;
  const lengthDefault = model.lengthUnits;

  // Parameters (global and local).
  const scaleParam = (p: { units: string; value: number; id: string }, scope: string) => {
    const f = resolveUnitFactor(p.units, model);
    if (!near1(f) && Number.isFinite(p.value)) {
      p.value *= f;
      warnings.push({
        category: 'units',
        message: `Scaled ${scope} parameter "${p.id}" by ${f} (unit "${p.units}") to SI base units.`,
        count: 1, severity: 'info',
      });
    }
  };
  for (const p of model.parameters.values()) scaleParam(p, 'global');
  for (const r of model.reactions.values()) {
    if (r.kineticLaw) for (const lp of r.kineticLaw.localParameters) scaleParam(lp, `local (${r.id})`);
  }

  // Compartment sizes, by dimensionality.
  const compFactor = new Map<string, number>();
  for (const c of model.compartments.values()) {
    const dimDefault = c.spatialDimensions === 2 ? areaDefault
      : c.spatialDimensions === 1 ? lengthDefault
      : volumeDefault;
    const f = resolveUnitFactor(c.units || dimDefault, model);
    compFactor.set(c.id, f);
    if (!near1(f) && Number.isFinite(c.size)) {
      c.size *= f;
      warnings.push({
        category: 'units',
        message: `Scaled compartment "${c.id}" size by ${f} (unit "${c.units || dimDefault || ''}").`,
        count: 1, severity: 'info',
      });
    }
  }

  // Species initial values.
  for (const s of model.species.values()) {
    const sf = resolveUnitFactor(s.substanceUnits || substanceDefault, model);
    const vf = compFactor.get(s.compartment) ?? 1;
    if (!near1(sf) && s.initialAmount) {
      s.initialAmount *= sf;
      warnings.push({ category: 'units', message: `Scaled species "${s.id}" initialAmount by ${sf}.`, count: 1, severity: 'info' });
    }
    // Concentration has units substance/volume, so its factor is sf / vf.
    const concF = sf / (vf || 1);
    if (!near1(concF) && s.initialConcentration) {
      s.initialConcentration *= concF;
      warnings.push({ category: 'units', message: `Scaled species "${s.id}" initialConcentration by ${concF}.`, count: 1, severity: 'info' });
    }
  }

  if (warnings.length > 0) {
    warnings.push({
      category: 'units',
      message: `Applied SBML unit conversion to ${warnings.length} quantity/ies. If a model declares units inconsistently with its values, disable scaling or check these factors.`,
      count: 1, severity: 'info',
    });
  }
  return warnings;
}
