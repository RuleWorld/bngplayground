#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <stdint.h>

// Ensure realtype is defined
typedef double realtype;

#include <cvode/cvode.h>
#include <cvode/cvode_ls.h>
#include <nvector/nvector_serial.h>
#include <sunmatrix/sunmatrix_dense.h>
#include <sunmatrix/sunmatrix_sparse.h>
#include <sunlinsol/sunlinsol_dense.h>
#include <sunlinsol/sunlinsol_klu.h>
#include <sunlinsol/sunlinsol_spgmr.h>
#include <sundials/sundials_context.h>
#include <sunnonlinsol/sunnonlinsol_newton.h>
#include <sunnonlinsol/sunnonlinsol_fixedpoint.h>

// Global callback to JS: f(t, y_ptr, ydot_ptr)
// Emscripten will link this to a JS function provided at library initialization
extern void js_f(double t, double* y, double* ydot);

// Jacobian callback to JS: jac(t, y_ptr, fy_ptr, Jac_ptr, neq)
// Jac is column-major dense matrix (neq x neq)
extern void js_jac(double t, double* y, double* fy, double* Jac, int neq);

// Root callback to JS: g(t, y_ptr, gout_ptr)
extern void js_g(double t, double* y, double* gout);

typedef struct {
    int nReactions;
    int nSpecies;
    double* rateConstants;
    int* nReactantsPerRxn;
    int* reactantOffsets;
    int* reactantIdx;
    int* reactantStoich;
    double* scalingVolumes;
    int* speciesOffsets;
    int* speciesRxnIdx;
    double* speciesStoich;
    double* speciesVolumes;
    int* jacRowPtr;
    int* jacColIdx;
    int* jacContribOffsets;
    int* jacContribRxnIdx;
    double* jacContribCoeffs;
    double* rates_cache;

    // --- Functional Rate Extensions ---
    int nObservables;
    int* obsOffsets;        // [nObservables+1]
    int* obsSpeciesIdx;     // [totalObsEntries]
    double* obsCoeffs;      // [totalObsEntries]
    double* obs_cache;      // [nObservables]

    int* exprBytecodeOffsets; // [nReactions+1]
    uint8_t* exprBytecode;    // [totalBytecodeLength]
    double* exprConstants;    // [totalConstantsLength]
} NetworkByteCode;

// Forward declaration of interpreter
static void network_dydt(NetworkByteCode* bc, int neq, double* y, double* ydot);
static int network_jac(realtype t, N_Vector y, N_Vector fy, SUNMatrix Jac,
                       void *user_data, N_Vector tmp1, N_Vector tmp2, N_Vector tmp3);

typedef struct {
    void* cvode_mem;
    N_Vector y;
    SUNMatrix A;         // NULL for SPGMR (matrix-free)
    SUNLinearSolver LS;
    SUNNonlinearSolver NLS;
    SUNContext sunctx;
    int use_sparse;      // 0 = dense, 1 = SPGMR
    int use_analytical_jac; // 1 = use js_jac callback
    long int max_num_steps; // CVODE mxstep (auto-grown on CV_TOO_MUCH_WORK)
    NetworkByteCode* network_bc;
} CvodeWrapper;

static int configure_sparse_spgmr_solver(CvodeWrapper* mem);
static int configure_klu_sparse_jacobian_solver(CvodeWrapper* mem, NetworkByteCode* bc);
static int configure_spgmr_sparse_jacobian_solver(CvodeWrapper* mem, NetworkByteCode* bc);
static int configure_sparse_jacobian_solver(CvodeWrapper* mem, NetworkByteCode* bc);

// RHS function that bridges CVODE -> JS or Bytecode
int f_bridge(realtype t, N_Vector y, N_Vector ydot, void *user_data) {
    CvodeWrapper* mem = (CvodeWrapper*)user_data;
    double* y_data = N_VGetArrayPointer(y);
    double* ydot_data = N_VGetArrayPointer(ydot);

    // If user_data is not yet attached, fall back to JS RHS callback.
    // This prevents null-deref traps when native network bytecode is unavailable.
    if (!mem) {
        js_f((double)t, y_data, ydot_data);
        return 0;
    }

    if (mem->network_bc) {
        // Fast path: interpret bytecode entirely in WASM
        network_dydt(mem->network_bc, (int)N_VGetLength(y), y_data, ydot_data);
    } else {
        // Fallback: call JS callback (original behavior)
        js_f((double)t, y_data, ydot_data);
    }
    return 0;
}

// Bytecode evaluator
static double evaluate_expression(NetworkByteCode* bc, int reactionIdx, double* y) {
    if (!bc->exprBytecode || bc->exprBytecodeOffsets[reactionIdx] == bc->exprBytecodeOffsets[reactionIdx+1]) {
        return 0.0;
    }

    double stack[64];
    int sp = 0;
    uint8_t* pc = bc->exprBytecode + bc->exprBytecodeOffsets[reactionIdx];
    uint8_t* end = bc->exprBytecode + bc->exprBytecodeOffsets[reactionIdx+1];

    while (pc < end) {
        uint8_t op = *pc++;
        if (op == 0xFF) break; // STOP

        switch (op) {
            case 0: { // PUSH_CONST
                double val;
                uint8_t* pval = (uint8_t*)&val;
                for (int i = 0; i < 8; i++) pval[i] = *pc++;
                stack[sp++] = val;
                break;
            }
            case 1: { // PUSH_SPEC
                int32_t idx;
                uint8_t* pidx = (uint8_t*)&idx;
                for (int i = 0; i < 4; i++) pidx[i] = *pc++;
                stack[sp++] = y[idx];
                break;
            }
            case 2: { // PUSH_OBS
                int32_t idx;
                uint8_t* pidx = (uint8_t*)&idx;
                for (int i = 0; i < 4; i++) pidx[i] = *pc++;
                stack[sp++] = bc->obs_cache[idx];
                break;
            }
            case 3: { double b = stack[--sp]; double a = stack[--sp]; stack[sp++] = a + b; break; } // ADD
            case 4: { double b = stack[--sp]; double a = stack[--sp]; stack[sp++] = a - b; break; } // SUB
            case 5: { double b = stack[--sp]; double a = stack[--sp]; stack[sp++] = a * b; break; } // MUL
            case 6: { double b = stack[--sp]; double a = stack[--sp]; stack[sp++] = a / b; break; } // DIV
            case 7: { double b = stack[--sp]; double a = stack[--sp]; stack[sp++] = pow(a, b); break; } // POW
            case 8: { stack[sp-1] = -stack[sp-1]; break; } // NEG
            case 9: { stack[sp-1] = exp(stack[sp-1]); break; } // EXP
            case 10: { stack[sp-1] = log(stack[sp-1]); break; } // LOG
            case 11: { stack[sp-1] = log10(stack[sp-1]); break; } // LOG10
            case 12: { stack[sp-1] = sqrt(stack[sp-1]); break; } // SQRT
            case 13: { stack[sp-1] = fabs(stack[sp-1]); break; } // ABS
            case 14: { stack[sp-1] = sin(stack[sp-1]); break; } // SIN
            case 15: { stack[sp-1] = cos(stack[sp-1]); break; } // COS
            case 16: { stack[sp-1] = ceil(stack[sp-1]); break; } // CEIL
            case 17: { stack[sp-1] = floor(stack[sp-1]); break; } // FLOOR
            case 18: { stack[sp-1] = nearbyint(stack[sp-1]); break; } // ROUND (rint in TS)
            case 19: { stack[sp-1] = tan(stack[sp-1]); break; } // TAN
            case 20: { stack[sp-1] = asin(stack[sp-1]); break; } // ASIN
            case 21: { stack[sp-1] = acos(stack[sp-1]); break; } // ACOS
            case 22: { stack[sp-1] = atan(stack[sp-1]); break; } // ATAN
            case 23: { double b = stack[--sp]; double a = stack[--sp]; stack[sp++] = fmax(a, b); break; } // MAX
            case 24: { double b = stack[--sp]; double a = stack[--sp]; stack[sp++] = fmin(a, b); break; } // MIN
            case 25: { // IF_ELSE
                double else_val = stack[--sp];
                double then_val = stack[--sp];
                double cond = stack[--sp];
                stack[sp++] = (cond != 0.0) ? then_val : else_val;
                break;
            }
            case 26: { double b = stack[--sp]; double a = stack[--sp]; stack[sp++] = (a < b) ? 1.0 : 0.0; break; } // LT
            case 27: { double b = stack[--sp]; double a = stack[--sp]; stack[sp++] = (a > b) ? 1.0 : 0.0; break; } // GT
            case 28: { double b = stack[--sp]; double a = stack[--sp]; stack[sp++] = (a <= b) ? 1.0 : 0.0; break; } // LE
            case 29: { double b = stack[--sp]; double a = stack[--sp]; stack[sp++] = (a >= b) ? 1.0 : 0.0; break; } // GE
            case 30: { double b = stack[--sp]; double a = stack[--sp]; stack[sp++] = (a == b) ? 1.0 : 0.0; break; } // EQ
            case 31: { double b = stack[--sp]; double a = stack[--sp]; stack[sp++] = (a != b) ? 1.0 : 0.0; break; } // NE
            case 32: { double b = stack[--sp]; double a = stack[--sp]; stack[sp++] = ((a != 0.0) && (b != 0.0)) ? 1.0 : 0.0; break; } // AND
            case 33: { double b = stack[--sp]; double a = stack[--sp]; stack[sp++] = ((a != 0.0) || (b != 0.0)) ? 1.0 : 0.0; break; } // OR
            case 34: { stack[sp-1] = (stack[sp-1] == 0.0) ? 1.0 : 0.0; break; } // NOT
            default: return 0.0;
        }
    }
    return (sp > 0) ? stack[sp-1] : 0.0;
}

// Compute all observables
static void compute_observables(NetworkByteCode* bc, double* y) {
    if (!bc->obs_cache) return;
    for (int i = 0; i < bc->nObservables; i++) {
        double sum = 0.0;
        for (int j = bc->obsOffsets[i]; j < bc->obsOffsets[i+1]; j++) {
            sum += bc->obsCoeffs[j] * y[bc->obsSpeciesIdx[j]];
        }
        bc->obs_cache[i] = sum;
    }
}

// Bytecode interpreter core
static void network_dydt(NetworkByteCode* bc, int neq, double* y, double* ydot) {
    // Zero output
    for (int i = 0; i < neq; i++) ydot[i] = 0.0;

    double* rates = bc->rates_cache;
    if (!rates) return;

    // 1. Update observables
    compute_observables(bc, y);

    // 2. Compute reaction rates
    for (int r = 0; r < bc->nReactions; r++) {
        // Base rate: either expression-evaluated or constant mass-action value.
        double rate;
        if (bc->exprBytecodeOffsets && bc->exprBytecodeOffsets[r] != bc->exprBytecodeOffsets[r+1]) {
            rate = evaluate_expression(bc, r, y);
        } else {
            rate = bc->rateConstants[r];
        }

        // Apply mass-action reactant multiplication for BOTH paths.
        // Expression rates in BNGL are rate factors that still multiply reactant terms.
        int start = bc->reactantOffsets[r];
        int end = bc->reactantOffsets[r + 1];
        
        for (int j = start; j < end; j++) {
            int idx = bc->reactantIdx[j];
            int stoich = bc->reactantStoich[j];
            double conc = y[idx];
            
            // Compartment scaling: conc * (speciesVol / scalingVol)
            double scale = bc->speciesVolumes[idx] / bc->scalingVolumes[r];
            if (scale != 1.0) {
                conc *= scale;
            }
            
            if (stoich == 1) {
                rate *= conc;
            } else if (stoich == 2) {
                rate *= conc * conc;
            } else {
                for (int s = 0; s < stoich; s++) rate *= conc;
            }
        }
        
        // Volume scaling for flux
        if (bc->scalingVolumes[r] != 1.0) {
            rate *= bc->scalingVolumes[r];
        }
        rates[r] = rate;
    }

    // Accumulate into dydt using stoichiometry matrix (CSC-like)
    for (int i = 0; i < neq; i++) {
        int start = bc->speciesOffsets[i];
        int end = bc->speciesOffsets[i + 1];
        double flux_sum = 0.0;
        for (int j = start; j < end; j++) {
            flux_sum += bc->speciesStoich[j] * rates[bc->speciesRxnIdx[j]];
        }
        ydot[i] = flux_sum / bc->speciesVolumes[i];
    }
}

// Jacobian interpreter (Analytical native path)
static int network_jac(realtype t, N_Vector y, N_Vector fy, SUNMatrix Jac,
                       void *user_data, N_Vector tmp1, N_Vector tmp2, N_Vector tmp3) {
    CvodeWrapper* mem = (CvodeWrapper*)user_data;
    NetworkByteCode* bc = mem->network_bc;
    if (!bc || !bc->jacRowPtr) return -1;
    
    double* y_data = N_VGetArrayPointer(y);
    
    // Explicitly zero matrix since we only fill nonzero entries from the sparsity pattern
    SUNMatZero(Jac);

    const int is_sparse = SUNMatGetID(Jac) == SUNMATRIX_SPARSE;
    sunrealtype* sparse_data = is_sparse ? SUNSparseMatrix_Data(Jac) : NULL;

    // CSR iteration over the Jacobian sparsity pattern.
    for (int i = 0; i < bc->nSpecies; i++) {
        for (int k = bc->jacRowPtr[i]; k < bc->jacRowPtr[i+1]; k++) {
            int j = bc->jacColIdx[k];
            double sum = 0.0;

            for (int l = bc->jacContribOffsets[k]; l < bc->jacContribOffsets[k+1]; l++) {
                int r = bc->jacContribRxnIdx[l];
                double coeff = bc->jacContribCoeffs[l];
                
                double rate_without_j = bc->rateConstants[r];
                int start = bc->reactantOffsets[r];
                int end = bc->reactantOffsets[r + 1];
                
                for (int m = start; m < end; m++) {
                    int ridx = bc->reactantIdx[m];
                    int stoich = bc->reactantStoich[m];
                    
                    double scale = bc->speciesVolumes[ridx] / bc->scalingVolumes[r];
                    double val = y_data[ridx] * scale;
                    
                    if (ridx == j) {
                        if (stoich == 1) {
                            rate_without_j *= scale; 
                        } else if (stoich == 2) {
                            rate_without_j *= val * scale;
                        } else {
                            rate_without_j *= pow(val, stoich - 1) * scale;
                        }
                    } else {
                        if (stoich == 1) {
                            rate_without_j *= val;
                        } else if (stoich == 2) {
                            rate_without_j *= (val * val);
                        } else {
                            rate_without_j *= pow(val, stoich);
                        }
                    }
                }
                
                if (bc->scalingVolumes[r] != 1.0) {
                    rate_without_j *= bc->scalingVolumes[r];
                }
                sum += coeff * rate_without_j;
            }
            if (is_sparse) {
                sparse_data[k] = sum / bc->speciesVolumes[i];
            } else {
                SM_ELEMENT_D(Jac, i, j) = sum / bc->speciesVolumes[i];
            }
        }
    }
    return 0;
}

static int configure_sparse_spgmr_solver(CvodeWrapper* mem) {
    if (!mem || !mem->y || !mem->sunctx) return -1;

    if (mem->LS) {
        SUNLinSolFree(mem->LS);
        mem->LS = NULL;
    }

    mem->LS = SUNLinSol_SPGMR(mem->y, SUN_PREC_NONE, 0, mem->sunctx);
    if (!mem->LS) return -1;

    if (mem->cvode_mem) {
        return CVodeSetLinearSolver(mem->cvode_mem, mem->LS, NULL);
    }

    return 0;
}

static int configure_klu_sparse_jacobian_solver(CvodeWrapper* mem, NetworkByteCode* bc) {
    if (!mem || !bc || !bc->jacRowPtr || !mem->cvode_mem) return -1;

    const sunindextype nnz = (sunindextype)bc->jacRowPtr[bc->nSpecies];
    if (nnz <= 0) return -1;

    if (mem->A) {
        SUNMatDestroy(mem->A);
        mem->A = NULL;
    }

    mem->A = SUNSparseMatrix((sunindextype)bc->nSpecies, (sunindextype)bc->nSpecies, nnz, CSR_MAT, mem->sunctx);
    if (!mem->A) return -1;

    sunindextype* row_ptr = SUNSparseMatrix_IndexPointers(mem->A);
    sunindextype* col_idx = SUNSparseMatrix_IndexValues(mem->A);
    sunrealtype* data = SUNSparseMatrix_Data(mem->A);
    if (!row_ptr || !col_idx || !data) {
        SUNMatDestroy(mem->A);
        mem->A = NULL;
        return -1;
    }

    for (int i = 0; i <= bc->nSpecies; i++) row_ptr[i] = (sunindextype)bc->jacRowPtr[i];
    for (sunindextype i = 0; i < nnz; i++) {
        col_idx[i] = (sunindextype)bc->jacColIdx[i];
        data[i] = 0.0;
    }

    if (mem->LS) {
        SUNLinSolFree(mem->LS);
        mem->LS = NULL;
    }

    mem->LS = SUNLinSol_KLU(mem->y, mem->A, mem->sunctx);
    if (!mem->LS) {
        SUNMatDestroy(mem->A);
        mem->A = NULL;
        return -1;
    }

    SUNLinSol_KLUSetOrdering(mem->LS, SUNKLU_ORDERING_DEFAULT);

    int flag = CVodeSetLinearSolver(mem->cvode_mem, mem->LS, mem->A);
    if (flag != 0) return flag;

    flag = CVodeSetJacFn(mem->cvode_mem, (CVLsJacFn)network_jac);
    if (flag != 0) return flag;

    mem->use_analytical_jac = 1;
    return 0;
}

static int configure_spgmr_sparse_jacobian_solver(CvodeWrapper* mem, NetworkByteCode* bc) {
    if (!mem || !bc || !bc->jacRowPtr || !mem->cvode_mem) return -1;

    const sunindextype nnz = (sunindextype)bc->jacRowPtr[bc->nSpecies];
    if (nnz <= 0) return -1;

    if (mem->A) {
        SUNMatDestroy(mem->A);
        mem->A = NULL;
    }

    mem->A = SUNSparseMatrix((sunindextype)bc->nSpecies, (sunindextype)bc->nSpecies, nnz, CSR_MAT, mem->sunctx);
    if (!mem->A) return -1;

    sunindextype* row_ptr = SUNSparseMatrix_IndexPointers(mem->A);
    sunindextype* col_idx = SUNSparseMatrix_IndexValues(mem->A);
    sunrealtype* data = SUNSparseMatrix_Data(mem->A);
    if (!row_ptr || !col_idx || !data) {
        SUNMatDestroy(mem->A);
        mem->A = NULL;
        return -1;
    }

    for (int i = 0; i <= bc->nSpecies; i++) row_ptr[i] = (sunindextype)bc->jacRowPtr[i];
    for (sunindextype i = 0; i < nnz; i++) {
        col_idx[i] = (sunindextype)bc->jacColIdx[i];
        data[i] = 0.0;
    }

    if (configure_sparse_spgmr_solver(mem) != 0) {
        SUNMatDestroy(mem->A);
        mem->A = NULL;
        return -1;
    }

    int flag = CVodeSetLinearSolver(mem->cvode_mem, mem->LS, mem->A);
    if (flag != 0) {
        SUNMatDestroy(mem->A);
        mem->A = NULL;
        return flag;
    }

    flag = CVodeSetJacFn(mem->cvode_mem, (CVLsJacFn)network_jac);
    if (flag != 0) {
        SUNMatDestroy(mem->A);
        mem->A = NULL;
        return flag;
    }

    mem->use_analytical_jac = 1;
    return 0;
}

static int configure_sparse_jacobian_solver(CvodeWrapper* mem, NetworkByteCode* bc) {
    int flag = configure_klu_sparse_jacobian_solver(mem, bc);
    if (flag == 0) return 0;
    return configure_spgmr_sparse_jacobian_solver(mem, bc);
}

// Jacobian function that bridges CVODE -> JS
// J is stored column-major (Fortran style) in SUNDIALS dense matrix
int jac_bridge(realtype t, N_Vector y, N_Vector fy, SUNMatrix J,
               void *user_data, N_Vector tmp1, N_Vector tmp2, N_Vector tmp3) {
    double* y_data = N_VGetArrayPointer(y);
    double* fy_data = N_VGetArrayPointer(fy);
    double* J_data = SUNDenseMatrix_Data(J);
    sunindextype neq = SUNDenseMatrix_Rows(J);
    js_jac((double)t, y_data, fy_data, J_data, (int)neq);
    return 0;
}

// Root function that bridges CVODE -> JS
int g_bridge(realtype t, N_Vector y, realtype *gout, void *user_data) {
    double* y_data = N_VGetArrayPointer(y);
    js_g((double)t, y_data, (double*)gout);
    return 0;
}

// Exported functions (available to JS)

#ifdef __cplusplus
extern "C" {
#endif

// Dense solver initialization (original)
void* init_solver(int neq, double t0, double* y0_data, double reltol, double abstol, int max_steps) {
    CvodeWrapper* mem = (CvodeWrapper*)malloc(sizeof(CvodeWrapper));
    if (!mem) return NULL;

    mem->use_sparse = 0;
    mem->network_bc = NULL;
    mem->use_analytical_jac = 0;
    mem->A = NULL;
    mem->LS = NULL;
    mem->NLS = NULL;

    // Create SUNDIALS context. Pass 0 for SUNComm (serial)
    if (SUNContext_Create(0, &mem->sunctx) != 0) {
        free(mem);
        return NULL;
    }

    // Create vector
    mem->y = N_VNew_Serial(neq, mem->sunctx);
    for (int i=0; i<neq; i++) NV_Ith_S(mem->y, i) = y0_data[i];

    // Create matrix and linear solver (DENSE)
    mem->A = SUNDenseMatrix(neq, neq, mem->sunctx);
    mem->LS = SUNLinSol_Dense(mem->y, mem->A, mem->sunctx);

    // Create CVODE memory
    mem->cvode_mem = CVodeCreate(CV_BDF, mem->sunctx);
    mem->NLS = SUNNonlinSol_Newton(mem->y, mem->sunctx);
    
    // Init and Attach
    CVodeInit(mem->cvode_mem, f_bridge, t0, mem->y);
    CVodeSetUserData(mem->cvode_mem, mem);
    CVodeSStolerances(mem->cvode_mem, reltol, abstol);
    CVodeSetNonlinearSolver(mem->cvode_mem, mem->NLS);
    CVodeSetLinearSolver(mem->cvode_mem, mem->LS, mem->A);

    // Match BNG2 defaults (see BNGOutput.pm generated CVODE code)
    // - max_num_steps default: 2000
    // - max_err_test_fails default: 7
    // - max_conv_fails default: 10
    // - max_step default: 0.0 (no limit)
    mem->max_num_steps = (max_steps > 0) ? (long int)max_steps : 2000;
    CVodeSetMaxNumSteps(mem->cvode_mem, mem->max_num_steps);
    CVodeSetMaxErrTestFails(mem->cvode_mem, 7);
    CVodeSetMaxConvFails(mem->cvode_mem, 10);
    CVodeSetMaxStep(mem->cvode_mem, 0.0);
    
    return (void*)mem;
}

// Adams-Moulton method for NON-STIFF systems (much better than BDF for non-stiff).
// CV_ADAMS uses lower-order polynomial interpolation, less computational work per step,
// and better stability for mildly oscillatory non-stiff systems.
// Uses functional (fixed-point) iteration — no matrix or linear solver needed.
void* init_solver_adams(int neq, double t0, double* y0_data, double reltol, double abstol, int max_steps) {
    CvodeWrapper* mem = (CvodeWrapper*)malloc(sizeof(CvodeWrapper));
    if (!mem) return NULL;

    mem->use_sparse = 0;
    mem->network_bc = NULL;
    mem->use_analytical_jac = 0;
    mem->A = NULL;
    mem->LS = NULL;
    mem->NLS = NULL;

    // Create SUNDIALS context
    if (SUNContext_Create(0, &mem->sunctx) != 0) {
        free(mem);
        return NULL;
    }

    // Create vector
    mem->y = N_VNew_Serial(neq, mem->sunctx);
    for (int i=0; i<neq; i++) NV_Ith_S(mem->y, i) = y0_data[i];

    // Create CVODE with Adams-Moulton method (CV_ADAMS = 1)
    mem->cvode_mem = CVodeCreate(CV_ADAMS, mem->sunctx);
    
    // Adams-Moulton with functional (fixed-point) iteration is the standard non-stiff configuration.
    // Skip CVodeSetLinearSolver entirely — no matrix or LS needed.
    // mem->NLS = SUNNonlinSol_FixedPoint(mem->y, 0, mem->sunctx);
    // CVodeSetNonlinearSolver(mem->cvode_mem, mem->NLS);

    // Init and Attach
    CVodeInit(mem->cvode_mem, f_bridge, t0, mem->y);
    CVodeSetUserData(mem->cvode_mem, mem);
    CVodeSStolerances(mem->cvode_mem, reltol, abstol);
    // CVodeSetNonlinearSolver(mem->cvode_mem, mem->NLS);

    // For Adams, use higher max order (default is 12, but CVODE caps at 12 for Adams)
    // Match BNG2 defaults for max_num_steps
    mem->max_num_steps = (max_steps > 0) ? (long int)max_steps : 2000;
    CVodeSetMaxNumSteps(mem->cvode_mem, mem->max_num_steps);
    CVodeSetMaxErrTestFails(mem->cvode_mem, 7);
    CVodeSetMaxConvFails(mem->cvode_mem, 10);
    CVodeSetMaxStep(mem->cvode_mem, 0.0);

    return (void*)mem;
}

// Dense solver with ANALYTICAL JACOBIAN (provided by JS callback)
void* init_solver_jac(int neq, double t0, double* y0_data, double reltol, double abstol, int max_steps) {
    CvodeWrapper* mem = (CvodeWrapper*)malloc(sizeof(CvodeWrapper));
    if (!mem) return NULL;

    mem->use_sparse = 0;
    mem->network_bc = NULL;
    mem->use_analytical_jac = 1;
    mem->A = NULL;
    mem->LS = NULL;
    mem->NLS = NULL;

    // Create SUNDIALS context
    if (SUNContext_Create(0, &mem->sunctx) != 0) {
        free(mem);
        return NULL;
    }

    // Create vector
    mem->y = N_VNew_Serial(neq, mem->sunctx);
    for (int i=0; i<neq; i++) NV_Ith_S(mem->y, i) = y0_data[i];

    // Create matrix and linear solver (DENSE)
    mem->A = SUNDenseMatrix(neq, neq, mem->sunctx);
    mem->LS = SUNLinSol_Dense(mem->y, mem->A, mem->sunctx);

    // Create CVODE memory
    mem->cvode_mem = CVodeCreate(CV_BDF, mem->sunctx);
    mem->NLS = SUNNonlinSol_Newton(mem->y, mem->sunctx);
    
    // Init and Attach
    CVodeInit(mem->cvode_mem, f_bridge, t0, mem->y);
    CVodeSetUserData(mem->cvode_mem, mem);
    CVodeSStolerances(mem->cvode_mem, reltol, abstol);
    CVodeSetNonlinearSolver(mem->cvode_mem, mem->NLS);
    CVodeSetLinearSolver(mem->cvode_mem, mem->LS, mem->A);

    // *** ANALYTICAL JACOBIAN - Key difference from init_solver ***
    CVodeSetJacFn(mem->cvode_mem, jac_bridge);

    // Match BNG2 defaults
    mem->max_num_steps = (max_steps > 0) ? (long int)max_steps : 2000;
    CVodeSetMaxNumSteps(mem->cvode_mem, mem->max_num_steps);
    CVodeSetMaxErrTestFails(mem->cvode_mem, 7);
    CVodeSetMaxConvFails(mem->cvode_mem, 10);
    CVodeSetMaxStep(mem->cvode_mem, 0.0);
    
    return (void*)mem;
}
// This is what BioNetGen uses when sparse=>1 is specified
void* init_solver_sparse(int neq, double t0, double* y0_data, double reltol, double abstol, int max_steps) {
    CvodeWrapper* mem = (CvodeWrapper*)malloc(sizeof(CvodeWrapper));
    if (!mem) return NULL;

    mem->use_sparse = 1;
    mem->network_bc = NULL;
    mem->use_analytical_jac = 0;
    mem->A = NULL;  // Bound later when a network with Jacobian sparsity is attached
    mem->LS = NULL;
    mem->NLS = NULL;

    // Create SUNDIALS context. Pass 0 for SUNComm (serial)
    if (SUNContext_Create(0, &mem->sunctx) != 0) {
        free(mem);
        return NULL;
    }

    // Create vector
    mem->y = N_VNew_Serial(neq, mem->sunctx);
    for (int i=0; i<neq; i++) NV_Ith_S(mem->y, i) = y0_data[i];

    // Start matrix-free and upgrade to KLU once a sparse Jacobian pattern is bound.
    // If KLU configuration fails at runtime, the wrapper falls back to the previous SPGMR path.
    if (configure_sparse_spgmr_solver(mem) != 0) {
        N_VDestroy(mem->y);
        SUNContext_Free(&mem->sunctx);
        free(mem);
        return NULL;
    }

    // Create CVODE memory
    mem->cvode_mem = CVodeCreate(CV_BDF, mem->sunctx);
    mem->NLS = SUNNonlinSol_Newton(mem->y, mem->sunctx);
    
    // Init and Attach
    CVodeInit(mem->cvode_mem, f_bridge, t0, mem->y);
    CVodeSetUserData(mem->cvode_mem, mem);
    CVodeSStolerances(mem->cvode_mem, reltol, abstol);
    CVodeSetNonlinearSolver(mem->cvode_mem, mem->NLS);
    
    // Keep SPGMR until bytecode Jacobian data is bound, then switch to KLU if available.
    CVodeSetLinearSolver(mem->cvode_mem, mem->LS, NULL);
    

    // Match BNG2 defaults
    mem->max_num_steps = (max_steps > 0) ? (long int)max_steps : 2000;
    CVodeSetMaxNumSteps(mem->cvode_mem, mem->max_num_steps);
    CVodeSetMaxErrTestFails(mem->cvode_mem, 7);
    CVodeSetMaxConvFails(mem->cvode_mem, 10);
    CVodeSetMaxStep(mem->cvode_mem, 0.0);
    
    return (void*)mem;
}

int solve_step(void* ptr, double tout, double* tret) {
    CvodeWrapper* mem = (CvodeWrapper*)ptr;
    realtype t_reached;
    int flag = CVode(mem->cvode_mem, tout, mem->y, &t_reached, CV_NORMAL);

    // Match BNG2 Network3 behavior: on CV_TOO_MUCH_WORK, increase mxstep and retry.
    // This preserves already-made progress in CVODE and avoids hard failure for stiff phases.
    while (flag == CV_TOO_MUCH_WORK) {
        if (mem->max_num_steps <= 0) mem->max_num_steps = 2000;
        // Prevent runaway overflow while still allowing very large stiff workloads.
        if (mem->max_num_steps > 1000000000L) break;
        mem->max_num_steps *= 2;
        CVodeSetMaxNumSteps(mem->cvode_mem, mem->max_num_steps);
        flag = CVode(mem->cvode_mem, tout, mem->y, &t_reached, CV_NORMAL);
    }

    *tret = (double)t_reached;
    return flag;
}

void get_y(void* ptr, double* destination) {
    CvodeWrapper* mem = (CvodeWrapper*)ptr;
    double* y_data = N_VGetArrayPointer(mem->y);
    int neq = NV_LENGTH_S(mem->y);
    for(int i=0; i<neq; i++) destination[i] = y_data[i];
}

void destroy_solver(void* ptr) {
    if (!ptr) return;
    CvodeWrapper* mem = (CvodeWrapper*)ptr;
    
    CVodeFree(&mem->cvode_mem);
    if (mem->NLS) SUNNonlinSolFree_Newton(mem->NLS);
    SUNLinSolFree(mem->LS);
    if (mem->A) SUNMatDestroy(mem->A);  // Only destroy if not matrix-free
    N_VDestroy(mem->y);
    SUNContext_Free(&mem->sunctx);
    free(mem);
}

// Set initial step size - can help CVODE bootstrap for stiff systems
int set_init_step(void* ptr, double h0) {
    if (!ptr) return -1;
    CvodeWrapper* mem = (CvodeWrapper*)ptr;
    return CVodeSetInitStep(mem->cvode_mem, (realtype)h0);
}

// Set maximum step size - can prevent overshooting in oscillatory systems
int set_max_step(void* ptr, double hmax) {
    if (!ptr) return -1;
    CvodeWrapper* mem = (CvodeWrapper*)ptr;
    return CVodeSetMaxStep(mem->cvode_mem, (realtype)hmax);
}

// Set minimum step size - can prevent CVODE from getting stuck with tiny steps
int set_min_step(void* ptr, double hmin) {
    if (!ptr) return -1;
    CvodeWrapper* mem = (CvodeWrapper*)ptr;
    return CVodeSetMinStep(mem->cvode_mem, (realtype)hmin);
}

// Set maximum BDF order (1-5, default 5)
// Lower orders (2-3) can be more stable for some stiff problems
int set_max_ord(void* ptr, int maxord) {
    if (!ptr) return -1;
    CvodeWrapper* mem = (CvodeWrapper*)ptr;
    return CVodeSetMaxOrd(mem->cvode_mem, maxord);
}

// Enable/disable BDF stability limit detection
// When enabled, CVODE will reduce BDF order when instability is detected
// Particularly useful for oscillatory systems
int set_stab_lim_det(void* ptr, int onoff) {
    if (!ptr) return -1;
    CvodeWrapper* mem = (CvodeWrapper*)ptr;
    return CVodeSetStabLimDet(mem->cvode_mem, onoff ? SUNTRUE : SUNFALSE);
}

// Set maximum number of nonlinear solver iterations per step (default 3)
// Increasing this can help convergence for highly nonlinear problems
int set_max_nonlin_iters(void* ptr, int maxcor) {
    if (!ptr) return -1;
    CvodeWrapper* mem = (CvodeWrapper*)ptr;
    return CVodeSetMaxNonlinIters(mem->cvode_mem, maxcor);
}

// Set nonlinear solver convergence coefficient (default 0.1)
// Smaller values require tighter convergence (more accurate but slower)
int set_nonlin_conv_coef(void* ptr, double nlscoef) {
    if (!ptr) return -1;
    CvodeWrapper* mem = (CvodeWrapper*)ptr;
    return CVodeSetNonlinConvCoef(mem->cvode_mem, (realtype)nlscoef);
}

// Set maximum number of error test failures per step (default 7)
int set_max_err_test_fails(void* ptr, int maxnef) {
    if (!ptr) return -1;
    CvodeWrapper* mem = (CvodeWrapper*)ptr;
    return CVodeSetMaxErrTestFails(mem->cvode_mem, maxnef);
}

// Set maximum number of nonlinear solver convergence failures per step (default 10)
int set_max_conv_fails(void* ptr, int maxncf) {
    if (!ptr) return -1;
    CvodeWrapper* mem = (CvodeWrapper*)ptr;
    return CVodeSetMaxConvFails(mem->cvode_mem, maxncf);
}

// Set maximum number of internal CVODE steps (mxstep)
int set_max_num_steps(void* ptr, int mxstep) {
    if (!ptr) return -1;
    CvodeWrapper* mem = (CvodeWrapper*)ptr;
    mem->max_num_steps = (mxstep > 0) ? (long int)mxstep : 2000;
    return CVodeSetMaxNumSteps(mem->cvode_mem, mem->max_num_steps);
}

// Reinitialize the solver at a new time point with new initial conditions
// Critical for multi-phase simulations with setConcentration commands
int reinit_solver(void* ptr, double t0, double* y0_data) {
    if (!ptr) return -1;
    CvodeWrapper* mem = (CvodeWrapper*)ptr;
    int neq = NV_LENGTH_S(mem->y);
    for (int i = 0; i < neq; i++) NV_Ith_S(mem->y, i) = y0_data[i];
    return CVodeReInit(mem->cvode_mem, (realtype)t0, mem->y);
}

// Get solver statistics for diagnostics
void get_solver_stats(void* ptr, long int* nsteps, long int* nfevals, 
                      long int* nlinsetups, long int* netfails) {
    if (!ptr) return;
    CvodeWrapper* mem = (CvodeWrapper*)ptr;
    CVodeGetNumSteps(mem->cvode_mem, nsteps);
    CVodeGetNumRhsEvals(mem->cvode_mem, nfevals);
    CVodeGetNumLinSolvSetups(mem->cvode_mem, nlinsetups);
    CVodeGetNumErrTestFails(mem->cvode_mem, netfails);
}

// Root-finding initialization
int init_roots(void* ptr, int nroots) {
    if (!ptr) return -1;
    CvodeWrapper* mem = (CvodeWrapper*)ptr;
    return CVodeRootInit(mem->cvode_mem, nroots, g_bridge);
}

// Get information on which root triggered
int get_root_info(void* ptr, int* rootsfound) {
    if (!ptr) return -1;
    CvodeWrapper* mem = (CvodeWrapper*)ptr;
    return CVodeGetRootInfo(mem->cvode_mem, rootsfound);
}

// ---- Network Bytecode API ----

void unload_network(uintptr_t handle) {
    if (!handle) return;
    NetworkByteCode* bc = (NetworkByteCode*)handle;
    if (bc->rateConstants) free(bc->rateConstants);
    if (bc->nReactantsPerRxn) free(bc->nReactantsPerRxn);
    if (bc->reactantOffsets) free(bc->reactantOffsets);
    if (bc->reactantIdx) free(bc->reactantIdx);
    if (bc->reactantStoich) free(bc->reactantStoich);
    if (bc->scalingVolumes) free(bc->scalingVolumes);
    if (bc->speciesOffsets) free(bc->speciesOffsets);
    if (bc->speciesRxnIdx) free(bc->speciesRxnIdx);
    if (bc->speciesStoich) free(bc->speciesStoich);
    if (bc->speciesVolumes) free(bc->speciesVolumes);
    if (bc->jacRowPtr) free(bc->jacRowPtr);
    if (bc->jacColIdx) free(bc->jacColIdx);
    if (bc->jacContribOffsets) free(bc->jacContribOffsets);
    if (bc->jacContribRxnIdx) free(bc->jacContribRxnIdx);
    if (bc->jacContribCoeffs) free(bc->jacContribCoeffs);
    if (bc->rates_cache) free(bc->rates_cache);

    if (bc->obsOffsets) free(bc->obsOffsets);
    if (bc->obsSpeciesIdx) free(bc->obsSpeciesIdx);
    if (bc->obsCoeffs) free(bc->obsCoeffs);
    if (bc->obs_cache) free(bc->obs_cache);
    if (bc->exprBytecodeOffsets) free(bc->exprBytecodeOffsets);
    if (bc->exprBytecode) free(bc->exprBytecode);
    if (bc->exprConstants) free(bc->exprConstants);

    free(bc);
}

uintptr_t load_network(
    int nReactions, int nSpecies,
    double* rateConstants,     // [nReactions]
    int* nReactantsPerRxn,     // [nReactions]
    int* reactantOffsets,      // [nReactions+1]
    int* reactantIdx,          // [totalReactantEntries]
    int* reactantStoich,       // [totalReactantEntries]
    double* scalingVolumes,    // [nReactions]
    int* speciesOffsets,       // [nSpecies+1]
    int* speciesRxnIdx,        // [totalStoichEntries]
    double* speciesStoich,     // [totalStoichEntries]
    double* speciesVolumes,    // [nSpecies]
    int* jacRowPtr,            // [nSpecies+1]
    int* jacColIdx,            // [totalJacEntries]
    int* jacContribOffsets,    // [totalJacEntries+1]
    int* jacContribRxnIdx,     // [totalContribEntries]
    double* jacContribCoeffs,  // [totalContribEntries]
    int nObservables,
    int* obsOffsets,           // [nObservables+1]
    int* obsSpeciesIdx,        // [totalObsEntries]
    double* obsCoeffs,         // [totalObsEntries]
    int* exprBytecodeOffsets,  // [nReactions+1]
    uint8_t* exprBytecode,     // [totalBytecodeLength]
    double* exprConstants      // [totalConstantsLength]
) {
    NetworkByteCode* bc = (NetworkByteCode*)malloc(sizeof(NetworkByteCode));
    if (!bc) return 0;

    bc->nReactions = nReactions;
    bc->nSpecies = nSpecies;

    bc->rateConstants = (double*)malloc(nReactions * sizeof(double));
    for (int i = 0; i < nReactions; i++) bc->rateConstants[i] = rateConstants[i];

    bc->nReactantsPerRxn = (int*)malloc(nReactions * sizeof(int));
    for (int i = 0; i < nReactions; i++) bc->nReactantsPerRxn[i] = nReactantsPerRxn[i];

    bc->reactantOffsets = (int*)malloc((nReactions + 1) * sizeof(int));
    for (int i = 0; i <= nReactions; i++) bc->reactantOffsets[i] = reactantOffsets[i];

    int totalReactantEntries = reactantOffsets[nReactions];
    bc->reactantIdx = (int*)malloc(totalReactantEntries * sizeof(int));
    for (int i = 0; i < totalReactantEntries; i++) bc->reactantIdx[i] = reactantIdx[i];

    bc->reactantStoich = (int*)malloc(totalReactantEntries * sizeof(int));
    for (int i = 0; i < totalReactantEntries; i++) bc->reactantStoich[i] = reactantStoich[i];

    bc->scalingVolumes = (double*)malloc(nReactions * sizeof(double));
    for (int i = 0; i < nReactions; i++) bc->scalingVolumes[i] = scalingVolumes[i];

    bc->speciesOffsets = (int*)malloc((nSpecies + 1) * sizeof(int));
    for (int i = 0; i <= nSpecies; i++) bc->speciesOffsets[i] = speciesOffsets[i];

    int totalStoichEntries = speciesOffsets[nSpecies];
    bc->speciesRxnIdx = (int*)malloc(totalStoichEntries * sizeof(int));
    for (int i = 0; i < totalStoichEntries; i++) bc->speciesRxnIdx[i] = speciesRxnIdx[i];

    bc->speciesStoich = (double*)malloc(totalStoichEntries * sizeof(double));
    for (int i = 0; i < totalStoichEntries; i++) bc->speciesStoich[i] = speciesStoich[i];

    bc->speciesVolumes = (double*)malloc(nSpecies * sizeof(double));
    for (int i = 0; i < nSpecies; i++) bc->speciesVolumes[i] = speciesVolumes[i];

    // Optional Jacobian Bytecode
    if (jacRowPtr && jacColIdx && jacContribOffsets && jacContribRxnIdx && jacContribCoeffs) {
        bc->jacRowPtr = (int*)malloc((nSpecies + 1) * sizeof(int));
        for (int i = 0; i <= nSpecies; i++) bc->jacRowPtr[i] = jacRowPtr[i];

        int totalJacEntries = jacRowPtr[nSpecies];
        bc->jacColIdx = (int*)malloc(totalJacEntries * sizeof(int));
        for (int i = 0; i < totalJacEntries; i++) bc->jacColIdx[i] = jacColIdx[i];

        bc->jacContribOffsets = (int*)malloc((totalJacEntries + 1) * sizeof(int));
        for (int i = 0; i <= totalJacEntries; i++) bc->jacContribOffsets[i] = jacContribOffsets[i];

        int totalContribEntries = jacContribOffsets[totalJacEntries];
        bc->jacContribRxnIdx = (int*)malloc(totalContribEntries * sizeof(int));
        for (int i = 0; i < totalContribEntries; i++) bc->jacContribRxnIdx[i] = jacContribRxnIdx[i];

        bc->jacContribCoeffs = (double*)malloc(totalContribEntries * sizeof(double));
        for (int i = 0; i < totalContribEntries; i++) bc->jacContribCoeffs[i] = jacContribCoeffs[i];
    } else {
        bc->jacRowPtr = NULL;
        bc->jacColIdx = NULL;
        bc->jacContribOffsets = NULL;
        bc->jacContribRxnIdx = NULL;
        bc->jacContribCoeffs = NULL;
    }
    bc->rates_cache = (double*)malloc(nReactions * sizeof(double));

    // Functional Rate Extensions
    bc->nObservables = nObservables;
    if (nObservables > 0) {
        bc->obsOffsets = (int*)malloc((nObservables + 1) * sizeof(int));
        for (int i = 0; i <= nObservables; i++) bc->obsOffsets[i] = obsOffsets[i];
        
        int totalObsEntries = obsOffsets[nObservables];
        bc->obsSpeciesIdx = (int*)malloc(totalObsEntries * sizeof(int));
        for (int i = 0; i < totalObsEntries; i++) bc->obsSpeciesIdx[i] = obsSpeciesIdx[i];
        
        bc->obsCoeffs = (double*)malloc(totalObsEntries * sizeof(double));
        for (int i = 0; i < totalObsEntries; i++) bc->obsCoeffs[i] = obsCoeffs[i];
        
        bc->obs_cache = (double*)malloc(nObservables * sizeof(double));
    } else {
        bc->obsOffsets = NULL;
        bc->obsSpeciesIdx = NULL;
        bc->obsCoeffs = NULL;
        bc->obs_cache = NULL;
    }

    if (exprBytecodeOffsets) {
        bc->exprBytecodeOffsets = (int*)malloc((nReactions + 1) * sizeof(int));
        for (int i = 0; i <= nReactions; i++) bc->exprBytecodeOffsets[i] = exprBytecodeOffsets[i];
        
        int totalBytecodeLength = exprBytecodeOffsets[nReactions];
        bc->exprBytecode = (uint8_t*)malloc(totalBytecodeLength * sizeof(uint8_t));
        for (int i = 0; i < totalBytecodeLength; i++) bc->exprBytecode[i] = exprBytecode[i];
        
        bc->exprConstants = NULL; // Not used yet
    } else {
        bc->exprBytecodeOffsets = NULL;
        bc->exprBytecode = NULL;
        bc->exprConstants = NULL;
    }

    return (uintptr_t)bc;
}

void bind_network(uintptr_t solver_ptr, uintptr_t network_ptr) {
    if (!solver_ptr || !network_ptr) return;
    CvodeWrapper* mem = (CvodeWrapper*)solver_ptr;
    NetworkByteCode* bc = (NetworkByteCode*)network_ptr;
    mem->network_bc = bc;
    
    // Set CVODE User Data explicitly 
    CVodeSetUserData(mem->cvode_mem, mem);

    if (mem->use_sparse && bc->jacRowPtr) {
        if (configure_sparse_jacobian_solver(mem, bc) != 0) {
            if (mem->A) {
                SUNMatDestroy(mem->A);
                mem->A = NULL;
            }
            CVodeSetLinearSolver(mem->cvode_mem, mem->LS, NULL);
            mem->use_analytical_jac = 0;
        }
        return;
    }

    // Dense/native analytical Jacobian path.
    if (mem->use_analytical_jac && bc->jacRowPtr) {
        CVodeSetJacFn(mem->cvode_mem, (CVLsJacFn)network_jac);
    }
}

void update_rate_constants(uintptr_t handle, double* rateConstants, int nReactions) {
    if (!handle) return;
    NetworkByteCode* bc = (NetworkByteCode*)handle;
    if (nReactions != bc->nReactions) return;
    for (int i = 0; i < nReactions; i++) bc->rateConstants[i] = rateConstants[i];
}

// Stable, uniquely-prefixed wrappers for JS/WASM interop.
// These avoid potential symbol/signature ambiguity with generic names.
uintptr_t cvode_load_network(
    int nReactions, int nSpecies,
    double* rateConstants,
    int* nReactantsPerRxn,
    int* reactantOffsets,
    int* reactantIdx,
    int* reactantStoich,
    double* scalingVolumes,
    int* speciesOffsets,
    int* speciesRxnIdx,
    double* speciesStoich,
    double* speciesVolumes,
    int* jacRowPtr,
    int* jacColIdx,
    int* jacContribOffsets,
    int* jacContribRxnIdx,
    double* jacContribCoeffs,
    int nObservables,
    int* obsOffsets,
    int* obsSpeciesIdx,
    double* obsCoeffs,
    int* exprBytecodeOffsets,
    uint8_t* exprBytecode,
    double* exprConstants
) {
    return load_network(
        nReactions, nSpecies,
        rateConstants, nReactantsPerRxn, reactantOffsets, reactantIdx, reactantStoich,
        scalingVolumes, speciesOffsets, speciesRxnIdx, speciesStoich, speciesVolumes,
        jacRowPtr, jacColIdx, jacContribOffsets, jacContribRxnIdx, jacContribCoeffs,
        nObservables, obsOffsets, obsSpeciesIdx, obsCoeffs,
        exprBytecodeOffsets, exprBytecode, exprConstants
    );
}

void cvode_unload_network(uintptr_t handle) {
    unload_network(handle);
}

void cvode_bind_network(uintptr_t solver_ptr, uintptr_t network_ptr) {
    bind_network(solver_ptr, network_ptr);
}

void cvode_update_rate_constants(uintptr_t handle, double* rateConstants, int nReactions) {
    update_rate_constants(handle, rateConstants, nReactions);
}

#ifdef __cplusplus
}
#endif
