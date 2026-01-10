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

// Global callback to JS: f(t, y_ptr, ydot_ptr)
// Emscripten will link this to a JS function provided at library initialization
extern void js_f(double t, double* y, double* ydot);

// Jacobian callback to JS: jac(t, y_ptr, fy_ptr, Jac_ptr, neq)
// Jac is column-major dense matrix (neq x neq)
extern void js_jac(double t, double* y, double* fy, double* Jac, int neq);

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
} CvodeWrapper;

// RHS function that bridges CVODE -> JS
int f_bridge(realtype t, N_Vector y, N_Vector ydot, void *user_data) {
    double* y_data = N_VGetArrayPointer(y);
    double* ydot_data = N_VGetArrayPointer(ydot);
    js_f((double)t, y_data, ydot_data);
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

// Exported functions (available to JS)

#ifdef __cplusplus
extern "C" {
#endif

// Dense solver initialization (original)
void* init_solver(int neq, double t0, double* y0_data, double reltol, double abstol, int max_steps) {
    CvodeWrapper* mem = (CvodeWrapper*)malloc(sizeof(CvodeWrapper));
    if (!mem) return NULL;

    mem->use_sparse = 0;
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

// Dense solver with ANALYTICAL JACOBIAN (provided by JS callback)
void* init_solver_jac(int neq, double t0, double* y0_data, double reltol, double abstol, int max_steps) {
    CvodeWrapper* mem = (CvodeWrapper*)malloc(sizeof(CvodeWrapper));
    if (!mem) return NULL;

    mem->use_sparse = 0;
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
    // This preserves progress CVODE already made and avoids treating it as fatal.
    while (flag == CV_TOO_MUCH_WORK) {
        if (mem->max_num_steps <= 0) mem->max_num_steps = 2000;
        // Prevent runaway overflow; still huge enough for pathological stiff models.
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


#ifdef __cplusplus
}
#endif
