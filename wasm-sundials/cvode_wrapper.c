#include <stdio.h>
#include <stdlib.h>
#include <math.h>

// Ensure realtype is defined
typedef double realtype;

#include <cvode/cvode.h>
#include <cvode/cvode_ls.h>
#include <nvector/nvector_serial.h>
#include <sunmatrix/sunmatrix_dense.h>
#include <sunlinsol/sunlinsol_dense.h>
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

// ---- Network bytecode storage struct ----
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
} NetworkByteCode;

// Forward declaration of interpreter
static void network_dydt(NetworkByteCode* bc, int neq, double* y, double* ydot);
static int network_jac(long int N, realtype t, N_Vector y, N_Vector fy, SUNMatrix Jac, 
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

// RHS function that bridges CVODE -> JS or Bytecode
int f_bridge(realtype t, N_Vector y, N_Vector ydot, void *user_data) {
    CvodeWrapper* mem = (CvodeWrapper*)user_data;
    double* y_data = N_VGetArrayPointer(y);
    double* ydot_data = N_VGetArrayPointer(ydot);
    
    if (mem->network_bc) {
        // Fast path: interpret bytecode entirely in WASM
        network_dydt(mem->network_bc, (int)N_VGetLength(y), y_data, ydot_data);
    } else {
        // Fallback: call JS callback (original behavior)
        js_f((double)t, y_data, ydot_data);
    }
    return 0;
}

// Bytecode interpreter core
static void network_dydt(NetworkByteCode* bc, int neq, double* y, double* ydot) {
    // Zero output
    for (int i = 0; i < neq; i++) ydot[i] = 0.0;

    double* rates = bc->rates_cache;
    if (!rates) return;

    for (int r = 0; r < bc->nReactions; r++) {
        double rate = bc->rateConstants[r];
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
static int network_jac(long int N, realtype t, N_Vector y, N_Vector fy, SUNMatrix Jac, 
                       void *user_data, N_Vector tmp1, N_Vector tmp2, N_Vector tmp3) {
    CvodeWrapper* mem = (CvodeWrapper*)user_data;
    NetworkByteCode* bc = mem->network_bc;
    if (!bc || !bc->jacRowPtr) return -1;
    
    double* y_data = N_VGetArrayPointer(y);
    
    // Explicitly zero matrix since we only fill nonzero entries from the sparsity pattern
    SUNMatZero(Jac);

    // CSR iteration (assuming Dense matrix output for now)
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
            SM_ELEMENT_D(Jac, i, j) = sum / bc->speciesVolumes[i];
        }
    }
    return 0;
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
    mem->A = NULL;  // Matrix-free method - no matrix needed
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

    // Create SPGMR linear solver (Scaled Preconditioned GMRES)
    // Match BNG2's CVSpgmr(..., PREC_NONE, 0) behavior by using maxl=0 (library default)
    mem->LS = SUNLinSol_SPGMR(mem->y, SUN_PREC_NONE, 0, mem->sunctx);

    // Create CVODE memory
    mem->cvode_mem = CVodeCreate(CV_BDF, mem->sunctx);
    mem->NLS = SUNNonlinSol_Newton(mem->y, mem->sunctx);
    
    // Init and Attach
    CVodeInit(mem->cvode_mem, f_bridge, t0, mem->y);
    CVodeSStolerances(mem->cvode_mem, reltol, abstol);
    CVodeSetNonlinearSolver(mem->cvode_mem, mem->NLS);
    
    // For SPGMR, pass NULL for the matrix (matrix-free)
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

void unload_network(void* handle) {
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
    free(bc);
}

void* load_network(
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
    double* jacContribCoeffs   // [totalContribEntries]
) {
    NetworkByteCode* bc = (NetworkByteCode*)malloc(sizeof(NetworkByteCode));
    if (!bc) return NULL;

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

    return (void*)bc;
}

void bind_network(void* solver_ptr, void* network_ptr) {
    if (!solver_ptr || !network_ptr) return;
    CvodeWrapper* mem = (CvodeWrapper*)solver_ptr;
    NetworkByteCode* bc = (NetworkByteCode*)network_ptr;
    mem->network_bc = bc;
    
    // Set CVODE User Data explicitly 
    CVodeSetUserData(mem->cvode_mem, mem);

    // Swap to analytical Jacobian
    if (mem->use_analytical_jac && bc->jacRowPtr) {
        CVodeSetJacFn(mem->cvode_mem, (CVLsJacFn)network_jac);
    }
}

void update_rate_constants(void* handle, double* rateConstants, int nReactions) {
    if (!handle) return;
    NetworkByteCode* bc = (NetworkByteCode*)handle;
    if (nReactions != bc->nReactions) return;
    for (int i = 0; i < nReactions; i++) bc->rateConstants[i] = rateConstants[i];
}

#ifdef __cplusplus
}
#endif
