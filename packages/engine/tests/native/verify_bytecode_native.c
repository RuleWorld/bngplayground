/*
 * Native acceptance harness for the load-time bytecode verifier in
 * wasm-sundials/cvode_wrapper.c.
 *
 * It compiles the VERIFIER SOURCE VERBATIM out of cvode_wrapper.c (see
 * generate_native_harness.sh) and links it against this driver, so these tests
 * exercise the exact C text that ships in the WASM build rather than a port of
 * it. Built with -fsanitize=address,undefined so any residual out-of-bounds
 * access in the verifier itself is a hard failure.
 *
 * Cases covered (per the A1/A2/A4 bug report):
 *   - a valid program is accepted
 *   - stack depth 65 is rejected (and depth exactly 64 is accepted)
 *   - MAX with one operand is rejected (stack underflow)
 *   - IF_ELSE with two operands is rejected
 *   - truncated PUSH_CONST is rejected
 *   - unknown opcode 99 is rejected
 *   - PUSH_SPEC index == nSpecies is rejected
 *   - PUSH_OBS index == nObservables is rejected
 * plus monotonicity and non-expression-array validation (A2).
 */

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <stdint.h>

typedef struct {
    int nObservables;
    int* exprBytecodeOffsets;
    uint8_t* exprBytecode;
    double* obs_cache;
} NetworkByteCode;

/* --- verifier and evaluator source injected by generate_native_harness.sh --- */
#include "verifier_under_test.inc"
/* --- end injected source --- */

static int failures = 0;
static int checks = 0;

/* --- Bytecode builder ----------------------------------------------------- */

typedef struct { uint8_t b[8192]; int n; } Code;

static void emit(Code* c, uint8_t v) { c->b[c->n++] = v; }

static void emit_i32(Code* c, int32_t v) {
    emit(c, (uint8_t)(v & 0xff));
    emit(c, (uint8_t)((v >> 8) & 0xff));
    emit(c, (uint8_t)((v >> 16) & 0xff));
    emit(c, (uint8_t)((v >> 24) & 0xff));
}

/* PUSH_CONST with a real IEEE-754 double payload. Only the verifier's *bounds*
 * matter, but writing true bytes keeps the fixture faithful to what
 * JITCompiler.compileToByteCode emits. */
static void emit_const(Code* c, double v) {
    uint8_t tmp[8];
    memcpy(tmp, &v, 8);
    emit(c, 0);
    for (int i = 0; i < 8; i++) emit(c, tmp[i]);
}

/* --- Fixtures ------------------------------------------------------------- */
/* One reaction, two species, zero observables. speciesOffsets {0,1,1} means
 * one stoich entry total, so speciesRxnIdx holds exactly one value. */
static const int R1_REACTANT_OFFSETS[] = {0, 1};
static const int R1_REACTANT_IDX[] = {0};
static const int R1_SPECIES_OFFSETS[] = {0, 1, 1};
static const int R1_SPECIES_RXN_IDX[] = {0};
static const int NO_OBS_OFFSETS[] = {0};

/* Two reactions, two species: one stoich entry per species. */
static const int R2_REACTANT_OFFSETS[] = {0, 1, 2};
static const int R2_REACTANT_IDX[] = {0, 1};
static const int R2_SPECIES_OFFSETS[] = {0, 1, 2};
static const int R2_SPECIES_RXN_IDX[] = {0, 1};
static const double RXN_RATES[] = {1.0, 1.0};
static const int RXN_REACTANT_COUNTS[] = {1, 1};
static const int REACTANT_STOICH[] = {1, 1};
static const double RXN_VOLUMES[] = {1.0, 1.0};
static const double SPECIES_STOICH[] = {1.0, 1.0};
static const double SPECIES_VOLUMES[] = {1.0, 1.0};
static const double OBS_COEFFICIENTS[] = {1.0, 1.0};
static const double JAC_COEFFICIENTS[] = {1.0, 1.0};
static const int R1_EXPR_OFFSETS[] = {0, 0};
static const int R2_EXPR_OFFSETS[] = {0, 0, 0};
static const int R0_EXPR_OFFSETS[] = {0};

/* --- Assertions ----------------------------------------------------------- */

typedef struct {
    int nRxn, nSpec, nObs;
    const int* reactantOffsets;
    const int* reactantIdx;
    const int* speciesOffsets;
    const int* speciesRxnIdx;
    const int* obsOffsets;
    const int* obsSpeciesIdx;
    const int* exprOffsets;
    const uint8_t* exprCode;
} Net;

static int verify_test_network(
    int nRxn, int nSpec, int nObs,
    const int* reactantOffsets, const int* reactantIdx,
    const int* speciesOffsets, const int* speciesRxnIdx,
    const int* jacRowPtr, const int* jacColIdx,
    const int* jacContribOffsets, const int* jacContribRxnIdx,
    const int* obsOffsets, const int* obsSpeciesIdx,
    const int* exprOffsets, const uint8_t* exprCode
) {
    const int* offsets = exprOffsets ? exprOffsets : (nRxn == 2 ? R2_EXPR_OFFSETS : nRxn == 0 ? R0_EXPR_OFFSETS : R1_EXPR_OFFSETS);
    return verify_network(
        nRxn, nSpec, nObs,
        nRxn > 0 ? RXN_RATES : NULL, nRxn > 0 ? RXN_REACTANT_COUNTS : NULL,
        reactantOffsets, reactantIdx, REACTANT_STOICH, nRxn > 0 ? RXN_VOLUMES : NULL,
        speciesOffsets, speciesRxnIdx, SPECIES_STOICH, nSpec > 0 ? SPECIES_VOLUMES : NULL,
        jacRowPtr, jacColIdx, jacContribOffsets, jacContribRxnIdx,
        jacRowPtr ? JAC_COEFFICIENTS : NULL,
        obsOffsets, obsSpeciesIdx, OBS_COEFFICIENTS,
        offsets, exprCode
    );
}

static int verify_missing_pointer_case(int missing) {
    static const int reactantOffsets[] = {0, 1};
    static const int reactantIdx[] = {0};
    static const int speciesOffsets[] = {0, 1, 1};
    static const int speciesRxnIdx[] = {0};
    static const int obsOffsets[] = {0, 1};
    static const int obsSpeciesIdx[] = {0};
    static const int jacRowPtr[] = {0, 1, 1};
    static const int jacColIdx[] = {0};
    static const int jacContribOffsets[] = {0, 1};
    static const int jacContribRxnIdx[] = {0};
    static const int exprOffsets[] = {0, 0};
    return verify_network(
        1, 2, 1,
        missing == 1 ? NULL : RXN_RATES,
        missing == 2 ? NULL : RXN_REACTANT_COUNTS,
        missing == 3 ? NULL : reactantOffsets,
        missing == 4 ? NULL : reactantIdx,
        missing == 5 ? NULL : REACTANT_STOICH,
        missing == 6 ? NULL : RXN_VOLUMES,
        missing == 7 ? NULL : speciesOffsets,
        missing == 8 ? NULL : speciesRxnIdx,
        missing == 9 ? NULL : SPECIES_STOICH,
        missing == 10 ? NULL : SPECIES_VOLUMES,
        missing == 11 ? NULL : jacRowPtr,
        missing == 12 ? NULL : jacColIdx,
        missing == 13 ? NULL : jacContribOffsets,
        missing == 14 ? NULL : jacContribRxnIdx,
        missing == 15 ? NULL : JAC_COEFFICIENTS,
        missing == 16 ? NULL : obsOffsets,
        missing == 17 ? NULL : obsSpeciesIdx,
        missing == 18 ? NULL : OBS_COEFFICIENTS,
        missing == 19 ? NULL : exprOffsets,
        NULL
    );
}

static int verify_zero_entry_arrays(void) {
    static const int reactantOffsets[] = {0, 0};
    static const int speciesOffsets[] = {0, 0};
    static const int obsOffsets[] = {0, 0};
    static const int jacRowPtr[] = {0, 0};
    static const int jacContribOffsets[] = {0};
    static const int exprOffsets[] = {0, 0};
    static const int reactantCounts[] = {0};
    static const double rates[] = {1.0};
    static const double volumes[] = {1.0};
    static const double speciesVolumes[] = {1.0};
    return verify_network(
        1, 1, 1, rates, reactantCounts,
        reactantOffsets, NULL, NULL, volumes,
        speciesOffsets, NULL, NULL, speciesVolumes,
        jacRowPtr, NULL, jacContribOffsets, NULL, NULL,
        obsOffsets, NULL, NULL, exprOffsets, NULL
    );
}

/* `expectReason` is a substring the rejection reason must contain. Asserting it
 * matters: without it, a case like "MAX with one operand" can still be reported
 * as rejected by some *other* check, so the test would keep passing even with
 * the specific guard deleted. */
static void check_ex(const char* name, int shouldAccept, const char* expectReason, const Net* net) {
    checks++;
    int ok = verify_test_network(net->nRxn, net->nSpec, net->nObs,
                                 net->reactantOffsets, net->reactantIdx,
                                 net->speciesOffsets, net->speciesRxnIdx,
                                 NULL, NULL, NULL, NULL,
                                 net->obsOffsets, net->obsSpeciesIdx,
                                 net->exprOffsets, net->exprCode);
    const char* err = get_last_load_error();

    if (ok != shouldAccept) {
        failures++;
        printf("FAIL %s: expected %s, got %s (\"%s\")\n", name,
               shouldAccept ? "accept" : "reject",
               ok ? "accept" : "reject", err);
        return;
    }
    if (ok) {
        if (!err || *err) {
            failures++;
            printf("FAIL %s: accepted but stale error string \"%s\" remained\n", name, err);
            return;
        }
        printf("ok   %s\n", name);
        return;
    }
    if (!err || !*err) {
        failures++;
        printf("FAIL %s: rejected but no reason recorded\n", name);
        return;
    }
    if (expectReason && strstr(err, expectReason) == NULL) {
        failures++;
        printf("FAIL %s: rejected, but not for the expected reason\n"
               "       wanted substring: \"%s\"\n"
               "       actual reason:    \"%s\"\n", name, expectReason, err);
        return;
    }
    printf("ok   %s  [%s]\n", name, err);
}

static void check(const char* name, int shouldAccept, const Net* net) {
    check_ex(name, shouldAccept, NULL, net);
}

/* One-reaction bytecode fixture. `offsets` must have 2 entries (nRxn + 1). */
static Net net1(const int* offsets, const uint8_t* code) {
    Net n;
    n.nRxn = 1; n.nSpec = 2; n.nObs = 0;
    n.reactantOffsets = R1_REACTANT_OFFSETS; n.reactantIdx = R1_REACTANT_IDX;
    n.speciesOffsets = R1_SPECIES_OFFSETS; n.speciesRxnIdx = R1_SPECIES_RXN_IDX;
    n.obsOffsets = NO_OBS_OFFSETS; n.obsSpeciesIdx = NULL;
    n.exprOffsets = offsets; n.exprCode = code;
    return n;
}

static void accept_bc(const char* name, const int* offsets, const uint8_t* code) {
    Net n = net1(offsets, code); check(name, 1, &n);
}

/* Rejection that must be reported with `reason`. */
static void reject_bc_why(const char* name, const char* reason, const int* offsets, const uint8_t* code) {
    Net n = net1(offsets, code); check_ex(name, 0, reason, &n);
}


static void check_round_value(const char* name, double input, double expected) {
    Code program;
    memset(&program, 0, sizeof(program));
    emit_const(&program, input);
    emit(&program, 18);   /* ROUND */
    emit(&program, 0xFF); /* STOP */
    int offsets[] = {0, program.n};
    NetworkByteCode bc;
    bc.nObservables = 0;
    bc.exprBytecodeOffsets = offsets;
    bc.exprBytecode = program.b;
    bc.obs_cache = NULL;
    const double actual = evaluate_expression(&bc, 0, NULL);
    checks++;
    if (actual != expected) {
        failures++;
        printf("FAIL %s: expected %.17g, got %.17g\n", name, expected, actual);
    } else {
        printf("ok   %s\n", name);
    }
}


int main(void) {
    check_round_value("ROUND 0.5 -> 1", 0.5, 1.0);
    check_round_value("ROUND 1.5 -> 2", 1.5, 2.0);
    check_round_value("ROUND 2.5 -> 3", 2.5, 3.0);
    check_round_value("ROUND -0.5 -> 0", -0.5, 0.0);
    check_round_value("ROUND -1.5 -> -1", -1.5, -1.0);
    check_round_value("ROUND -2.5 -> -2", -2.5, -2.0);
    check_round_value("ROUND near-half -> 1", 0.49999999999999994, 1.0);
    Code c;
    uint8_t code[8192];
    int offsets[2];

    /* 1. valid program: PUSH_CONST 2, PUSH_CONST 3, ADD, STOP */
    memset(&c, 0, sizeof(c));
    emit_const(&c, 2.0);
    emit_const(&c, 3.0);
    emit(&c, 3);      /* ADD */
    emit(&c, 0xFF);   /* STOP */
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    accept_bc("valid program (PUSH_CONST, PUSH_CONST, ADD, STOP)", offsets, code);

    /* 1b. empty expression program is legal (means "no expression") */
    offsets[0] = 0; offsets[1] = 0;
    accept_bc("empty program (no expression)", offsets, NULL);

    /* 1c. valid program using PUSH_SPEC and a real observable */
    memset(&c, 0, sizeof(c));
    emit(&c, 1); emit_i32(&c, 1);      /* PUSH_SPEC 1 */
    emit(&c, 2); emit_i32(&c, 0);      /* PUSH_OBS 0  */
    emit(&c, 5);                        /* MUL */
    emit(&c, 0xFF);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    {
        static const int obsOffsets[] = {0, 1};
        static const int obsSpeciesIdx[] = {0};
        Net n = net1(offsets, code);
        n.nObs = 1; n.obsOffsets = obsOffsets; n.obsSpeciesIdx = obsSpeciesIdx;
        check("valid program with PUSH_SPEC/PUSH_OBS", 1, &n);
    }

    /* 1d. valid IF_ELSE with all three operands */
    memset(&c, 0, sizeof(c));
    emit_const(&c, 1.0);
    emit_const(&c, 2.0);
    emit_const(&c, 3.0);
    emit(&c, 25);     /* IF_ELSE */
    emit(&c, 0xFF);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    accept_bc("valid IF_ELSE with three operands", offsets, code);

    /* 2. stack depth 65: 65 PUSH_CONST then STOP */
    memset(&c, 0, sizeof(c));
    for (int i = 0; i < 65; i++) emit_const(&c, 1.0);
    emit(&c, 0xFF);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    reject_bc_why("depth 65 exceeds max 64", "exceeds max 64", offsets, code);

    /* 2b. A program that PEAKS at exactly 64 is accepted: push 64 constants
     * (depth 64), fold down to 1 with 63 MULs, then STOP. This is the boundary
     * case that depth 65 must be measured against. */
    memset(&c, 0, sizeof(c));
    for (int i = 0; i < 64; i++) emit_const(&c, 2.0);
    for (int i = 0; i < 63; i++) emit(&c, 5);  /* MUL */
    emit(&c, 0xFF);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    accept_bc("peak depth exactly 64 accepted", offsets, code);


    /* 3. MAX with one operand */
    memset(&c, 0, sizeof(c));
    emit_const(&c, 2.0);
    emit(&c, 23);     /* MAX */
    emit(&c, 0xFF);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    reject_bc_why("MAX with one operand", "needs stack depth 2", offsets, code);

    /* 3b. MAX with no operands at all */
    memset(&c, 0, sizeof(c));
    emit(&c, 23);
    emit(&c, 0xFF);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    reject_bc_why("MAX with zero operands", "needs stack depth 2", offsets, code);
    /* Unary underflow is rejected. */
    memset(&c, 0, sizeof(c));
    emit(&c, 9); emit(&c, 0xFF);  /* EXP */
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    reject_bc_why("EXP with no operand", "needs stack depth 1", offsets, code);

    /* 4. IF_ELSE with two operands */
    memset(&c, 0, sizeof(c));
    emit_const(&c, 1.0);
    emit_const(&c, 2.0);
    emit(&c, 25);     /* IF_ELSE */
    emit(&c, 0xFF);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    reject_bc_why("IF_ELSE with two operands", "needs stack depth 3", offsets, code);

    /* 5. truncated PUSH_CONST: opcode 0 with only 4 operand bytes before end */
    memset(&c, 0, sizeof(c));
    emit(&c, 0);
    emit(&c, 1); emit(&c, 2); emit(&c, 3); emit(&c, 4);
    emit(&c, 0xFF);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    reject_bc_why("truncated PUSH_CONST (4 of 8 operand bytes)", "truncated", offsets, code);

    /* 5b. PUSH_SPEC with only 3 operand bytes before the end of the program.
     * There is deliberately no STOP: a trailing STOP would itself be read as
     * the 4th operand byte, so the index check rather than the truncation check
     * would be what fired. */
    memset(&c, 0, sizeof(c));
    emit(&c, 1);
    emit(&c, 1); emit(&c, 2); emit(&c, 3);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    reject_bc_why("truncated PUSH_SPEC (3 of 4 operand bytes)", "truncated", offsets, code);
    /* PUSH_OBS with only two operand bytes before program end. */
    memset(&c, 0, sizeof(c));
    emit(&c, 2); emit(&c, 1); emit(&c, 2);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    reject_bc_why("truncated PUSH_OBS", "truncated", offsets, code);


    /* 5c. PUSH_CONST with zero operand bytes before the end of the program. */
    memset(&c, 0, sizeof(c));
    emit(&c, 0);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    reject_bc_why("PUSH_CONST with no operand bytes", "truncated", offsets, code);

    /* 6. unknown opcode 99 */
    memset(&c, 0, sizeof(c));
    emit_const(&c, 1.0);
    emit(&c, 99);
    emit(&c, 0xFF);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    reject_bc_why("unknown opcode 99", "unknown opcode 99", offsets, code);

    /* 6b. opcode 35 -- one past NOT, i.e. numeric opcode drift territory */
    memset(&c, 0, sizeof(c));
    emit_const(&c, 1.0);
    emit(&c, 35);
    emit(&c, 0xFF);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    reject_bc_why("unknown opcode 35 (drift territory)", "unknown opcode 35", offsets, code);

    /* 7. PUSH_SPEC index == nSpecies (2) */
    memset(&c, 0, sizeof(c));
    emit(&c, 1); emit_i32(&c, 2);
    emit(&c, 0xFF);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    reject_bc_why("PUSH_SPEC index == nSpecies", "index 2 out of range", offsets, code);

    /* 7b. PUSH_SPEC negative index */
    memset(&c, 0, sizeof(c));
    emit(&c, 1); emit_i32(&c, -1);
    emit(&c, 0xFF);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    reject_bc_why("PUSH_SPEC negative index", "index -1 out of range", offsets, code);

    /* 7c. PUSH_SPEC far out of range */
    memset(&c, 0, sizeof(c));
    emit(&c, 1); emit_i32(&c, 1000);
    emit(&c, 0xFF);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    reject_bc_why("PUSH_SPEC index 1000", "index 1000 out of range", offsets, code);

    /* 8. PUSH_OBS index == nObservables (1) */
    memset(&c, 0, sizeof(c));
    emit(&c, 2); emit_i32(&c, 1);
    emit(&c, 0xFF);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    {
        static const int obsOffsets[] = {0, 1};
        static const int obsSpeciesIdx[] = {0};
        Net n = net1(offsets, code);
        n.nObs = 1; n.obsOffsets = obsOffsets; n.obsSpeciesIdx = obsSpeciesIdx;
        check("PUSH_OBS index == nObservables", 0, &n);
    }

    /* 8b. PUSH_OBS when there are no observables at all */
    memset(&c, 0, sizeof(c));
    emit(&c, 2); emit_i32(&c, 0);
    emit(&c, 0xFF);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    reject_bc_why("PUSH_OBS with nObservables == 0", "out of range [0, 0)", offsets, code);

    /* 8c. final stack depth != 1 at STOP (two values left) */
    memset(&c, 0, sizeof(c));
    emit_const(&c, 1.0);
    emit_const(&c, 2.0);
    emit(&c, 0xFF);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    reject_bc_why("final stack depth 2 at STOP", "expected exactly 1", offsets, code);


    /* 8e. lone STOP: empty stack at STOP */
    memset(&c, 0, sizeof(c));
    emit(&c, 0xFF);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    reject_bc_why("lone STOP leaves empty stack", "expected exactly 1", offsets, code);

    /* STOP must be the final byte of its reaction's program. */
    memset(&c, 0, sizeof(c));
    emit_const(&c, 1.0);
    emit(&c, 0xFF);
    emit(&c, 99);
    memcpy(code, c.b, c.n);
    offsets[0] = 0; offsets[1] = c.n;
    reject_bc_why("trailing byte after STOP", "not the final byte", offsets, code);

    /* 8g. second reaction carries the bad program (index reported is 1) */
    {
        static const int twoRxnReactantOffsets[] = {0, 0, 0};
        memset(&c, 0, sizeof(c));
        emit_const(&c, 1.0);
        emit(&c, 99);
        emit(&c, 0xFF);
        memcpy(code, c.b, c.n);
        static const int twoOffsets[] = {0, 0, 0};
        Net n;
        n.nRxn = 2; n.nSpec = 2; n.nObs = 0;
        n.reactantOffsets = twoRxnReactantOffsets; n.reactantIdx = R1_REACTANT_IDX;
        n.speciesOffsets = R2_SPECIES_OFFSETS; n.speciesRxnIdx = R2_SPECIES_RXN_IDX;
        n.obsOffsets = NO_OBS_OFFSETS; n.obsSpeciesIdx = NULL;
        /* reaction 0 empty, reaction 1 spans the whole buffer */
        n.exprOffsets = twoOffsets;
        static int dyn[3];
        dyn[0] = 0; dyn[1] = 0; dyn[2] = c.n;
        n.exprOffsets = dyn;
        n.exprCode = code;
        checks++;
        int ok = verify_test_network(n.nRxn, n.nSpec, n.nObs,
                                     n.reactantOffsets, n.reactantIdx,
                                     n.speciesOffsets, n.speciesRxnIdx,
                                     NULL, NULL, NULL, NULL,
                                     n.obsOffsets, n.obsSpeciesIdx,
                                     n.exprOffsets, n.exprCode);
        if (ok) {
            failures++;
            printf("FAIL bad program in reaction 1: expected reject\n");
        } else if (strstr(get_last_load_error(), "reaction 1") == NULL) {
            failures++;
            printf("FAIL bad program in reaction 1: reason does not name the reaction: \"%s\"\n",
                   get_last_load_error());
        } else {
            printf("ok   bad program in reaction 1 reports the index  [%s]\n", get_last_load_error());
        }
    }

    /* --- A2: non-expression array validation --- */

    /* 9. non-monotonic reactantOffsets */
    {
        static const int bad[] = {0, 2, 1};
        Net n;
        n.nRxn = 2; n.nSpec = 2; n.nObs = 0;
        n.reactantOffsets = bad; n.reactantIdx = R2_REACTANT_IDX;
        n.speciesOffsets = R2_SPECIES_OFFSETS; n.speciesRxnIdx = R2_SPECIES_RXN_IDX;
        n.obsOffsets = NO_OBS_OFFSETS; n.obsSpeciesIdx = NULL;
        n.exprOffsets = NULL; n.exprCode = NULL;
        check("non-monotonic reactantOffsets", 0, &n);
    }

    /* 9b. negative offset */
    {
        static const int bad[] = {0, -1, 0};
        Net n;
        n.nRxn = 2; n.nSpec = 2; n.nObs = 0;
        n.reactantOffsets = bad; n.reactantIdx = R2_REACTANT_IDX;
        n.speciesOffsets = R2_SPECIES_OFFSETS; n.speciesRxnIdx = R2_SPECIES_RXN_IDX;
        n.obsOffsets = NO_OBS_OFFSETS; n.obsSpeciesIdx = NULL;
        n.exprOffsets = NULL; n.exprCode = NULL;
        check("negative reactantOffsets entry", 0, &n);
    }

    /* 9c. non-monotonic speciesOffsets */
    {
        static const int bad[] = {0, 2, 1};
        Net n;
        n.nRxn = 2; n.nSpec = 2; n.nObs = 0;
        n.reactantOffsets = R2_REACTANT_OFFSETS; n.reactantIdx = R2_REACTANT_IDX;
        n.speciesOffsets = bad; n.speciesRxnIdx = R2_SPECIES_RXN_IDX;
        n.obsOffsets = NO_OBS_OFFSETS; n.obsSpeciesIdx = NULL;
        n.exprOffsets = NULL; n.exprCode = NULL;
        check("non-monotonic speciesOffsets", 0, &n);
    }

    /* 10. reactantIdx == nSpecies */
    {
        static const int badIdx[] = {0, 5};
        Net n;
        n.nRxn = 2; n.nSpec = 2; n.nObs = 0;
        n.reactantOffsets = R2_REACTANT_OFFSETS; n.reactantIdx = badIdx;
        n.speciesOffsets = R2_SPECIES_OFFSETS; n.speciesRxnIdx = R2_SPECIES_RXN_IDX;
        n.obsOffsets = NO_OBS_OFFSETS; n.obsSpeciesIdx = NULL;
        n.exprOffsets = NULL; n.exprCode = NULL;
        check("reactantIdx out of range", 0, &n);
    }

    /* 11. speciesRxnIdx == nReactions (this is the one-reaction trap) */
    {
        static const int badIdx[] = {0, 2};
        Net n;
        n.nRxn = 2; n.nSpec = 2; n.nObs = 0;
        n.reactantOffsets = R2_REACTANT_OFFSETS; n.reactantIdx = R2_REACTANT_IDX;
        n.speciesOffsets = R2_SPECIES_OFFSETS; n.speciesRxnIdx = badIdx;
        n.obsOffsets = NO_OBS_OFFSETS; n.obsSpeciesIdx = NULL;
        n.exprOffsets = NULL; n.exprCode = NULL;
        check("speciesRxnIdx == nReactions", 0, &n);
    }

    /* 12. obsSpeciesIdx == nSpecies (the compute_observables OOB read) */
    {
        static const int obsOffsets[] = {0, 1};
        static const int badIdx[] = {2};
        Net n;
        n.nRxn = 2; n.nSpec = 2; n.nObs = 1;
        n.reactantOffsets = R2_REACTANT_OFFSETS; n.reactantIdx = R2_REACTANT_IDX;
        n.speciesOffsets = R2_SPECIES_OFFSETS; n.speciesRxnIdx = R2_SPECIES_RXN_IDX;
        n.obsOffsets = obsOffsets; n.obsSpeciesIdx = badIdx;
        n.exprOffsets = NULL; n.exprCode = NULL;
        check("obsSpeciesIdx == nSpecies", 0, &n);
    }

    /* 12b. valid observable, for contrast */
    {
        static const int obsOffsets[] = {0, 1};
        static const int goodIdx[] = {1};
        Net n;
        n.nRxn = 2; n.nSpec = 2; n.nObs = 1;
        n.reactantOffsets = R2_REACTANT_OFFSETS; n.reactantIdx = R2_REACTANT_IDX;
        n.speciesOffsets = R2_SPECIES_OFFSETS; n.speciesRxnIdx = R2_SPECIES_RXN_IDX;
        n.obsOffsets = obsOffsets; n.obsSpeciesIdx = goodIdx;
        n.exprOffsets = NULL; n.exprCode = NULL;
        check("valid obsSpeciesIdx accepted", 1, &n);
    }

    /* 13. negative dimensions */
    {
        Net n;
        n.nRxn = 2; n.nSpec = -1; n.nObs = 0;
        n.reactantOffsets = R2_REACTANT_OFFSETS; n.reactantIdx = R2_REACTANT_IDX;
        n.speciesOffsets = R2_SPECIES_OFFSETS; n.speciesRxnIdx = R2_SPECIES_RXN_IDX;
        n.obsOffsets = NO_OBS_OFFSETS; n.obsSpeciesIdx = NULL;
        n.exprOffsets = NULL; n.exprCode = NULL;
        check("negative nSpecies", 0, &n);
    }

    /* Non-monotonic observable CSR offsets are rejected. */
    {
        static const int badObsOffsets[] = {0, 2, 1};
        static const int obsIdx[] = {0, 1};
        Net n;
        n.nRxn = 1; n.nSpec = 2; n.nObs = 2;
        n.reactantOffsets = R1_REACTANT_OFFSETS; n.reactantIdx = R1_REACTANT_IDX;
        n.speciesOffsets = R1_SPECIES_OFFSETS; n.speciesRxnIdx = R1_SPECIES_RXN_IDX;
        n.obsOffsets = badObsOffsets; n.obsSpeciesIdx = obsIdx;
        n.exprOffsets = NULL; n.exprCode = NULL;
        check("non-monotonic observable offsets rejected", 0, &n);
    }
    {
        static const int rowPtr[] = {0, 1, 1};
        static const int badCol[] = {2};
        static const int contribOffsets[] = {0, 1};
        static const int contribRxn[] = {0};
        checks++;
        int ok = verify_test_network(1, 2, 0, R1_REACTANT_OFFSETS, R1_REACTANT_IDX,
                                     R1_SPECIES_OFFSETS, R1_SPECIES_RXN_IDX,
                                     rowPtr, badCol, contribOffsets, contribRxn,
                                     NO_OBS_OFFSETS, NULL, NULL, NULL);
        if (ok || strstr(get_last_load_error(), "jacColIdx") == NULL) {
            failures++; printf("FAIL out-of-range jacColIdx not rejected correctly\n");
        } else printf("ok   out-of-range jacColIdx [%s]\n", get_last_load_error());
    }
    {
        static const int rowPtr[] = {0, 1, 2};
        static const int col[] = {0, 1};
        static const int badContribOffsets[] = {0, 2, 1};
        static const int contribRxn[] = {0, 0};
        checks++;
        int ok = verify_test_network(1, 2, 0, R1_REACTANT_OFFSETS, R1_REACTANT_IDX,
                                     R1_SPECIES_OFFSETS, R1_SPECIES_RXN_IDX,
                                     rowPtr, col, badContribOffsets, contribRxn,
                                     NO_OBS_OFFSETS, NULL, NULL, NULL);
        if (ok || strstr(get_last_load_error(), "jacContribOffsets") == NULL) {
            failures++; printf("FAIL out-of-range jacContribOffsets not rejected correctly\n");
        } else printf("ok   out-of-range jacContribOffsets [%s]\n", get_last_load_error());
    }
    {
        static const int rowPtr[] = {0, 1, 1};
        static const int col[] = {1};
        static const int contribOffsets[] = {0, 1};
        static const int badContribRxn[] = {1};
        checks++;
        int ok = verify_test_network(1, 2, 0, R1_REACTANT_OFFSETS, R1_REACTANT_IDX,
                                     R1_SPECIES_OFFSETS, R1_SPECIES_RXN_IDX,
                                     rowPtr, col, contribOffsets, badContribRxn,
                                     NO_OBS_OFFSETS, NULL, NULL, NULL);
        if (ok || strstr(get_last_load_error(), "jacContribRxnIdx") == NULL) {
            failures++; printf("FAIL out-of-range jacContribRxnIdx not rejected correctly\n");
        } else printf("ok   out-of-range jacContribRxnIdx [%s]\n", get_last_load_error());
    }
    {
        static const int negativeEmptyOffset[] = {-1};
        static const int zeroOffset[] = {0};
        checks++;
        int ok = verify_test_network(0, 0, 0, negativeEmptyOffset, NULL,
                                     zeroOffset, NULL, NULL, NULL, NULL, NULL,
                                     zeroOffset, NULL, NULL, NULL);
        if (ok || strstr(get_last_load_error(), "reactantOffsets") == NULL) {
            failures++; printf("FAIL negative zero-segment offset was not rejected\n");
        } else printf("ok   negative zero-segment offset [%s]\n", get_last_load_error());
    }

    {
        checks++;
        int ok = verify_test_network(1, 2, 0, R1_REACTANT_OFFSETS, R1_REACTANT_IDX,
                                     R1_SPECIES_OFFSETS, R1_SPECIES_RXN_IDX,
                                     NULL, R1_REACTANT_IDX, NULL, NULL,
                                     NO_OBS_OFFSETS, NULL, NULL, NULL);
        if (ok || strstr(get_last_load_error(), "incomplete Jacobian") == NULL) {
            failures++; printf("FAIL partial Jacobian arrays were not rejected\n");
        } else printf("ok   partial Jacobian arrays [%s]\n", get_last_load_error());
    }

    {
        static const char* names[] = {
            "rateConstants", "nReactantsPerRxn", "reactantOffsets", "reactantIdx",
            "reactantStoich", "scalingVolumes", "speciesOffsets", "speciesRxnIdx",
            "speciesStoich", "speciesVolumes", "jacRowPtr", "jacColIdx",
            "jacContribOffsets", "jacContribRxnIdx", "jacContribCoeffs",
            "obsOffsets", "obsSpeciesIdx", "obsCoeffs", "exprBytecodeOffsets"
        };
        static const char* reasons[] = {
            "reaction arrays", "reaction arrays", "network offsets", "reactant indices",
            "reactant indices", "reaction arrays", "network offsets", "species reaction indices",
            "species reaction indices", "speciesVolumes", "Jacobian offsets", "jacColIdx",
            "Jacobian offsets", "Jacobian contribution indices", "Jacobian contribution indices",
            "obsOffsets", "observable indices", "observable indices", "network offsets"
        };
        for (int i = 0; i < (int)(sizeof(names) / sizeof(names[0])); i++) {
            checks++;
            int ok = verify_missing_pointer_case(i + 1);
            if (ok || strstr(get_last_load_error(), reasons[i]) == NULL) {
                failures++;
                printf("FAIL missing %s was not rejected correctly: %s\n", names[i], get_last_load_error());
            } else {
                printf("ok   missing %s [%s]\n", names[i], get_last_load_error());
            }
        }
    }
    checks++;
    if (!verify_zero_entry_arrays()) {
        failures++;
        printf("FAIL zero-entry observable and Jacobian arrays rejected: %s\n", get_last_load_error());
    } else {
        printf("ok   zero-entry observable and Jacobian arrays accepted\n");
    }

    printf("\n%d checks, %d failures\n", checks, failures);
    return failures ? 1 : 0;
}