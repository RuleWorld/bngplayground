// graph/core/Rxn.ts

export class Rxn {
  reactants: number[];  // species indices
  products: number[];   // species indices
  rate: number;
  name?: string;
  degeneracy: number;
  propensityFactor?: number;

  constructor(
    reactants: number[],
    products: number[],
    rate: number,
    name?: string,
    options: { degeneracy?: number; propensityFactor?: number; rateExpression?: string; productStoichiometries?: number[] } = {}
  ) {
    this.reactants = reactants;
    this.products = products;
    this.rate = rate;
    this.name = name;
    this.degeneracy = options.degeneracy ?? 1;
    this.propensityFactor = options.propensityFactor;
    this.rateExpression = options.rateExpression;
    this.productStoichiometries = options.productStoichiometries;
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