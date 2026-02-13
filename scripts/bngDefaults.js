import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Default to system-installed BioNetGen (Anaconda environment).
// Update this path if your BNG2.pl is located elsewhere.
export const DEFAULT_BNG2_PATH = 'C:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\BNG2.pl';
export const DEFAULT_PERL_CMD = 'perl';

// PERL5LIB path for BNG2.pl to find its modules (BNGUtils.pm etc.)
// Using forward slashes which work for Perl on Windows and avoid escape character issues
export const DEFAULT_PERL5LIB = 'C:/Users/Achyudhan/anaconda3/envs/Research/Lib/site-packages/bionetgen/bng-win/Perl2';

// Path to BNG bin directory containing run_network executable
export const DEFAULT_BNG_BIN = 'C:/Users/Achyudhan/anaconda3/envs/Research/Lib/site-packages/bionetgen/bng-win/bin';
