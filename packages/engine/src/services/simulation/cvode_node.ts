import { createRequire } from 'node:module';

type CvodeLoader = (moduleArg?: unknown) => Promise<unknown>;

const require = createRequire(import.meta.url);
const loaderModule = require('../../../../../services/cvode_loader.cjs') as
  | CvodeLoader
  | { default?: CvodeLoader };

const createCVodeModuleDefault =
  (typeof loaderModule === 'function' ? loaderModule : loaderModule.default) ?? null;

if (typeof createCVodeModuleDefault !== 'function') {
  throw new Error('Failed to resolve CVODE loader from CJS module');
}

export const createCVodeModule: CvodeLoader = createCVodeModuleDefault;
export default createCVodeModuleDefault;
