// graph/core/Rxn.ts

export class Rxn {
  reactants: number[];  // species indices
  products: number[];   // species indices
  rate: number;
  name?: string;
  degeneracy: number;
  propensityFactor?: number;

  scalingVolume?: number;
  totalRate?: boolean;

  constructor(
    reactants: number[],
    products: number[],
    rate: number,
    name?: string,
    options: { degeneracy?: number; propensityFactor?: number; rateExpression?: string; productStoichiometries?: number[]; scalingVolume?: number; totalRate?: boolean } = {}
  ) {
    this.reactants = reactants;
    this.products = products;
    this.rate = rate;
    this.name = name;
    this.degeneracy = options.degeneracy ?? 1;
    this.propensityFactor = options.propensityFactor;
    this.rateExpression = options.rateExpression;
    this.productStoichiometries = options.productStoichiometries;
    this.scalingVolume = options.scalingVolume;
    this.totalRate = (options as any).totalRate;
  }

  rateExpression?: string;
  productStoichiometries?: number[];

  /**
   * BioNetGen: Rxn::toString()
   */
  toString(): string {
    const reactantStr = this.reactants.join(' + ');
    const productStr = this.products.join(' + ');
    return `${reactantStr} -> ${productStr} ${this.rateExpression || this.rate}`;
  }
}