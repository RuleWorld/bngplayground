// fs-shim.js
// Browser stub for Node.js 'fs' module
// This prevents "bare specifier" errors when TensorFlow.js dependencies
// conditionally import 'fs' for Node.js compatibility

// Export empty stubs for common fs methods that might be probed
export const readFileSync = () => {
    throw new Error('fs.readFileSync is not available in the browser');
};

export const writeFileSync = () => {
    throw new Error('fs.writeFileSync is not available in the browser');
};

export const existsSync = () => false;

export const readdirSync = () => [];

export const statSync = () => {
    throw new Error('fs.statSync is not available in the browser');
};

export const promises = {
    readFile: () => Promise.reject(new Error('fs.promises.readFile is not available in the browser')),
    writeFile: () => Promise.reject(new Error('fs.promises.writeFile is not available in the browser')),
};

// Default export for CommonJS compatibility
export default {
    readFileSync,
    writeFileSync,
    existsSync,
    readdirSync,
    statSync,
    promises,
};
