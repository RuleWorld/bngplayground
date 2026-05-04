import { Example } from '../types.ts';

export { CHART_COLORS } from './utils/chartColors';

// Set AB model as default
export const INITIAL_BNGL_CODE = `begin model
begin parameters
  k_bind 1
  k_unbind 0.1
end parameters

begin molecule types
  A(b)
  B(a)
end molecule types

begin seed species
  A(b) 100
  B(a) 100
end seed species

begin observables
  Molecules FreeA A(b)
  Molecules BoundAB A(b!1).B(a!1)
end observables

begin reaction rules
  A(b) + B(a) <-> A(b!1).B(a!1) k_bind,k_unbind
end reaction rules

simulate({method=>"ode",t_end=>10,n_steps=>10})
end model`;

// Model data — generated from RuleHub gallery.json + manifest-slim.json
// Run `npm run sync-gallery` to regenerate
export {
  MODEL_CATEGORIES,
  EXAMPLES,
  BNG2_COMPATIBLE,
  NFSIM_COMPATIBLE,
  EXCLUDED,
} from './generated/gallery-data';

// Re-export under old names for backward compatibility
export { BNG2_COMPATIBLE as BNG2_COMPATIBLE_MODELS } from './generated/gallery-data';
export { NFSIM_COMPATIBLE as NFSIM_MODELS } from './generated/gallery-data';
export { EXCLUDED as BNG2_EXCLUDED_MODELS } from './generated/gallery-data';

// Type re-export
export type { ModelCategory } from './generated/gallery-data';
