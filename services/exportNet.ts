import { BNGLParser, GraphCanonicalizer, NetworkExporter, Species, Rxn } from '@bngplayground/engine';
import type { BNGLModel, BNGLSpecies } from '../types';

export const exportToNet = async (model: BNGLModel, evalParamMap?: Map<string, number>): Promise<string> => {
  const expandedSpecies = model.species ?? [];
  const expandedReactions = (model as any).reactions ?? [];

  const species: Species[] = expandedSpecies.map((s: BNGLSpecies, idx: number) => {
    const graph = BNGLParser.parseSpeciesGraph(s.name, true);
    const concentration = Number(s.initialConcentration ?? 0);
    const sp = new Species(graph, idx, concentration);
    sp.initialConcentration = concentration;
    (sp as Species & { isConstant?: boolean }).isConstant = !!s.isConstant;
    return sp;
  });

  const speciesNameToIndex = new Map<string, number>();
  species.forEach((sp, idx) => {
    const canonical = GraphCanonicalizer.canonicalize(sp.graph);
    speciesNameToIndex.set(canonical, idx);
    speciesNameToIndex.set(sp.graph.toString(), idx);
  });

  const toIndex = (name: string): number => {
    const direct = speciesNameToIndex.get(name);
    if (direct !== undefined) return direct;
    const canonical = GraphCanonicalizer.canonicalize(BNGLParser.parseSpeciesGraph(name, true));
    const mapped = speciesNameToIndex.get(canonical);
    if (mapped === undefined) {
      throw new Error(`Unable to map generated species "${name}" to index`);
    }
    return mapped;
  };

  const defaultEvalMap = evalParamMap ?? new Map<string, number>(
    Object.entries(model.parameters).map(([k, v]) => [k, Number(v)])
  );

  const reactions: Rxn[] = expandedReactions.map((reaction: any) => {
    const reactants = Array.isArray(reaction.reactants)
      ? reaction.reactants.map((name: string) => toIndex(name))
      : [];
    const products = Array.isArray(reaction.products)
      ? reaction.products.map((name: string) => toIndex(name))
      : [];

    const numericRate = Number(
      Number.isFinite(reaction.rateConstant)
        ? reaction.rateConstant
        : reaction.rate
    );

    const symbolicRateExpression = typeof reaction.rate === 'string'
      ? reaction.rate
      : reaction.rateExpression;

    let inferredStatFactor = 1;
    if (!Number.isFinite(reaction.statFactor) && typeof symbolicRateExpression === 'string' && symbolicRateExpression.trim().length > 0) {
      const expr = symbolicRateExpression.trim();
      let exprValue = Number(expr);
      if (!Number.isFinite(exprValue)) {
        try {
          exprValue = BNGLParser.evaluateExpression(expr, defaultEvalMap);
        } catch {
          exprValue = NaN;
        }
      }
      if (Number.isFinite(exprValue) && Math.abs(exprValue) > 1e-15 && Number.isFinite(numericRate)) {
        const ratio = numericRate / exprValue;
        if (Number.isFinite(ratio) && Math.abs(ratio) > 1e-15) {
          inferredStatFactor = Number(ratio.toPrecision(12));
        }
      }
    }

    return new Rxn(
      reactants,
      products,
      Number.isFinite(numericRate) ? numericRate : 0,
      reaction.name ?? '',
      {
        degeneracy: reaction.degeneracy,
        propensityFactor: reaction.propensityFactor,
        statFactor: Number.isFinite(reaction.statFactor) ? reaction.statFactor : inferredStatFactor,
        rateExpression: symbolicRateExpression,
        productStoichiometries: Array.isArray(reaction.productStoichiometries)
          ? reaction.productStoichiometries
          : undefined,
        scalingVolume: reaction.scalingVolume ?? undefined,
        totalRate: reaction.totalRate,
      }
    );
  });

  return NetworkExporter.export(model, species, reactions);
};

export default exportToNet;
