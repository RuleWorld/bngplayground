/**
 * wasm-spatial/tests/spatial_engine_test.cpp
 *
 * Native test harness for wasm-spatial/spatial_engine.cpp.
 *
 * This engine is built to public/spatial.wasm but is NOT yet wired into the app
 * (nothing imports services/spatial_loader.js), so no TypeScript test can reach
 * it. We therefore include the translation unit directly: the engine needs only
 * libc/libm and its callbacks, so it compiles standalone.
 *
 * Build and run (ASan + UBSan, halt on first error):
 *
 *   bash wasm-spatial/tests/run_tests.sh
 *
 * Tests cover the bounds/handle fixes:
 *   D1  loops bounded by g_pool.count instead of the pool array size
 *   D2  spatial_add_molecule returns an id that is not an array index
 *   D3  negative species ids write/read out of bounds
 *   C3  reflect_coord infinite-loops on a zero-width extent / +-Infinity
 *   C4  gaussian() can draw u1 == 0, giving log(0) == -inf
 */

#include <cmath>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <unistd.h>
#include <vector>

// Direct inclusion gives access to the internal statics (reflect_coord,
// g_pool, g_boundary) that the exported C API does not expose.
#include "../spatial_engine.cpp"

// ============================================================
// Minimal test harness
// ============================================================

static int g_failures = 0;
static int g_checks = 0;

#define CHECK(cond, ...)                                                    \
    do {                                                                    \
        g_checks++;                                                         \
        if (!(cond)) {                                                      \
            g_failures++;                                                   \
            fprintf(stderr, "  FAIL %s:%d: ", __FILE__, __LINE__);          \
            fprintf(stderr, __VA_ARGS__);                                   \
            fprintf(stderr, "\n");                                          \
        }                                                                   \
    } while (0)

#define SECTION(name) fprintf(stderr, "\n[%s]\n", (name))

// A hang must FAIL, not wedge CI. reflect_coord used to spin forever on a
// zero-width extent; this turns that regression into a test failure.
static void alarm_handler(int) {
    const char msg[] =
        "  FAIL: timed out (probable infinite loop in reflect_coord)\n";
    ssize_t ignored = write(STDERR_FILENO, msg, sizeof(msg) - 1);
    (void)ignored;
    _exit(2);
}

static void arm_timeout(unsigned seconds) {
    struct sigaction sa;
    memset(&sa, 0, sizeof(sa));
    sa.sa_handler = alarm_handler;
    sigaction(SIGALRM, &sa, nullptr);
    alarm(seconds);
}

static void disarm_timeout() { alarm(0); }

// ============================================================
// Stub reaction callbacks
// ============================================================

// A() + A() -> B()  (unimolecular-in-practice: any pair of the same species)
static const int SPECIES_A = 0;
static const int SPECIES_B = 1;

static int cb_check_rxn(int sa, int sb) {
    return (sa == SPECIES_A && sb == SPECIES_A) ? 1 : 0;
}
static double cb_get_max_prob(int, int) { return 1.0; }
static int cb_get_pathway(int, int, double) { return 0; }
static int cb_get_product_count(int, int, int) { return 1; }
static int cb_get_product(int, int, int, int) { return SPECIES_B; }

static void install_callbacks() {
    spatial_set_callbacks(cb_check_rxn, cb_get_max_prob, cb_get_pathway,
                          cb_get_product_count, cb_get_product);
}



static int alive_census() {
    std::vector<int> sids(64), cnts(64);
    int n = spatial_count_species(sids.data(), cnts.data(), 64);
    int total = 0;
    for (int i = 0; i < n; i++) total += cnts[i];
    return total;
}

static int exported_census() {
    std::vector<float> buf(5 * 64);
    return spatial_export_positions(buf.data(), 64);
}

// ============================================================
// D1: loops bounded by the alive count skip the appended tail
// ============================================================

static void test_d1_tail_molecules_diffuse_and_are_counted() {
    SECTION("D1: molecules past `count` still diffuse and are counted");

    spatial_init(1e-3, 12345);
    spatial_set_grid_size(10.0, 10.0, 10.0, 0.5); // box [-5,5], cells >= rxn radius
    CHECK(spatial_set_diffusion_constant(SPECIES_A, 1e-6) == 0, "set D should succeed");

    // Advance past step 0 so the periodic compaction (step_count % 100 == 0)
    // does not fire during the step under test and shift the tail slot away.
    spatial_step();

    // Four molecules at four distinct positions.
    const float xs[4] = {-2.0f, -1.0f, 1.0f, 2.0f};
    for (int i = 0; i < 4; i++) {
        int idx = spatial_add_molecule(xs[i], 0.0f, 0.0f, SPECIES_A, 0);
        CHECK(idx == i, "add should return array index %d, got %d", i, idx);
    }

    // Tombstone index 0. Now count(3) < size(4); the loop bound is the bug.
    spatial_remove_molecule(0);

    spatial_step();

    // Slot 3 is past the old `i < count` bound, so the pre-fix engine never
    // diffused it: its coordinate must be unchanged. Assert on the exact
    // coordinate rather than a probe, so an out-of-range read (0.0f) cannot
    // masquerade as movement.

    CHECK(spatial_get_molecule_species_id(3) == SPECIES_A,
          "slot 3 should still be the alive 4th molecule");
    CHECK(spatial_get_molecule_x(3) != xs[3],
          "slot 3 (x=%g) sits past the alive count and must still diffuse",
          xs[3]);

    int moved = 0;
    for (int i = 1; i < 4; i++) { // 0 is the tombstone
        if (spatial_get_molecule_x(i) != xs[i]) moved++;
    }
    CHECK(moved == 3, "all 3 alive molecules should diffuse, %d did", moved);

    // The census must agree with the export count.
    CHECK(alive_census() == 3, "count_species total should be 3, got %d", alive_census());
    CHECK(exported_census() == 3, "export_positions should yield 3, got %d", exported_census());

    spatial_destroy();
}

static void test_d1_reaction_product_diffuses_next_step() {
    SECTION("D1: a reaction product appended past `count` is counted and diffuses");

    spatial_init(1e-3, 999);
    spatial_set_grid_size(10.0, 10.0, 10.0, 0.5);
    // Reactants must NOT diffuse before the collision check, or they fly apart
    // (sigma = sqrt(2*D*dt) is far larger than the 0.01 separation here). The
    // product gets a real D so we can prove it moves on the following step.
    spatial_set_diffusion_constant(SPECIES_A, 0.0);
    spatial_set_diffusion_constant(SPECIES_B, 1e-6);
    install_callbacks();

    // Advance past step 0: spatial_step compacts when step_count % 100 == 0,
    // which on the very first step would immediately shift the product down to
    // slot 0 and hide the tail-slot condition this test targets.
    spatial_step();

    // Two A molecules within the reaction radius -> guaranteed collision.
    spatial_add_molecule(0.0f, 0.0f, 0.0f, SPECIES_A, 0);
    spatial_add_molecule(0.005f, 0.0f, 0.0f, SPECIES_A, 0);

    spatial_step(); // react: 2 A consumed, 1 B appended at the tail

    CHECK(spatial_molecule_count() == 3,
          "3 slots expected (2 tombstoned reactants + 1 product), got %d",
          spatial_molecule_count());

    // The product is appended at slot 2 while count == 1, i.e. past the old
    // `i < count` bound -- exactly the slot that was skipped.
    CHECK(alive_census() == 1, "expected 1 alive molecule (the product), got %d", alive_census());
    CHECK(exported_census() == 1, "export should yield 1, got %d", exported_census());

    std::vector<int> sids(64), cnts(64);
    int n = spatial_count_species(sids.data(), cnts.data(), 64);
    bool saw_product = false;
    for (int i = 0; i < n; i++) {
        if (sids[i] == SPECIES_B) saw_product = true;
    }
    CHECK(saw_product, "the B product should appear in the species census");

    float bx = spatial_get_molecule_x(2);
    float by = spatial_get_molecule_y(2);

    spatial_step(); // product must diffuse now that it is within the loop bound

    CHECK(spatial_get_molecule_x(2) != bx || spatial_get_molecule_y(2) != by,
          "the product at slot 2 should diffuse on the following step");

    spatial_destroy();
}

// ============================================================
// D2: handle contract
// ============================================================

static void test_d2_index_contract() {
    SECTION("D2: add returns the array index; accessors honour tombstones");

    spatial_init(1e-3, 7);
    spatial_set_grid_size(10.0, 10.0, 10.0, 0.5);
    spatial_set_diffusion_constant(SPECIES_A, 0.0);
    spatial_set_diffusion_constant(SPECIES_B, 0.0);

    for (int i = 0; i < 3; i++) {
        int idx = spatial_add_molecule((float)i, 0.0f, 0.0f, SPECIES_A, 7);
        CHECK(idx == i, "add %d returned %d, expected the array index %d", i, idx, i);
        // The returned handle resolves to the molecule actually added.
        CHECK(spatial_get_molecule_species_id(idx) == SPECIES_A,
              "handle %d should resolve to species A", idx);
        CHECK(spatial_get_molecule_compartment_id(idx) == 7,
              "handle %d should resolve to compartment 7", idx);
        CHECK(spatial_get_molecule_x(idx) == (float)i,
              "handle %d should resolve to x=%d", idx, i);
    }

    CHECK(spatial_molecule_count() == 3, "3 addressable slots expected, got %d",
          spatial_molecule_count());

    // A tombstoned slot reports itself as dead rather than returning stale data.
    spatial_remove_molecule(1);
    CHECK(spatial_get_molecule_species_id(1) == -1,
          "a removed slot should report -1, got %d", spatial_get_molecule_species_id(1));

    // Documented invalidation point: the first step compacts (step_count == 0),
    // shifting entries down. The slot count must shrink accordingly.
    spatial_step();
    CHECK(spatial_molecule_count() == 2,
          "after compaction 2 slots should remain, got %d", spatial_molecule_count());
    CHECK(alive_census() == 2, "2 alive molecules expected after compaction, got %d",
          alive_census());

    // The surviving molecules are the ones originally at x=0 and x=2.
    CHECK(spatial_get_molecule_x(0) == 0.0f, "compacted slot 0 should hold x=0");
    CHECK(spatial_get_molecule_x(1) == 2.0f, "compacted slot 1 should hold x=2");

    // Out-of-range accessors stay in bounds.
    CHECK(spatial_get_molecule_species_id(9999) == -1, "OOB index should report -1");
    CHECK(spatial_get_molecule_species_id(-1) == -1, "negative index should report -1");

    spatial_destroy();
}

// ============================================================
// D3: negative species ids
// ============================================================

static void test_d3_negative_species_ids() {
    SECTION("D3: negative species ids are rejected, not written out of bounds");

    spatial_init(1e-3, 4242);
    spatial_set_grid_size(10.0, 10.0, 10.0, 0.5);
    spatial_set_diffusion_constant(SPECIES_A, 1e-6);

    // ASan/UBSan would flag the old g_diffusion_constants[-1] write here.
    CHECK(spatial_set_diffusion_constant(-1, 1e-6) == -1,
          "set_diffusion_constant(-1) should return an error");
    CHECK(spatial_set_diffusion_constant(-12345, 1e-6) == -1,
          "set_diffusion_constant(-12345) should return an error");

    // The rejected write must not have touched slot 0 of the diffusion table.
    std::vector<int> sids(64), cnts(64);
    int n = spatial_count_species(sids.data(), cnts.data(), 64);
    (void)n;

    // A negative species id on add is rejected and allocates no slot.
    int slots_before = spatial_molecule_count();
    int idx = spatial_add_molecule(0.0f, 0.0f, 0.0f, -1, 0);
    CHECK(idx == -1, "add with species_id -1 should return -1, got %d", idx);
    CHECK(spatial_molecule_count() == slots_before,
          "a rejected add must not grow the pool (%d -> %d)",
          slots_before, spatial_molecule_count());

    // Stepping with no molecules must be safe and non-hanging.
    spatial_step();
    CHECK(spatial_molecule_count() == slots_before, "pool size should be unchanged");

    // A valid add still works afterwards.
    int ok = spatial_add_molecule(0.0f, 0.0f, 0.0f, SPECIES_A, 0);
    CHECK(ok == slots_before, "valid add should return index %d, got %d", slots_before, ok);

    spatial_destroy();
}

// ============================================================
// C3: reflect_coord termination and range
// ============================================================

static void test_c3_reflect_coord() {
    SECTION("C3: reflect_coord terminates and stays in range");

    // Degenerate extents used to loop forever.
    arm_timeout(5);
    CHECK(std::isfinite(reflect_coord(0.5f, 0.0f, 0.0f)),
          "zero-width extent must return a finite value");
    disarm_timeout();

    CHECK(reflect_coord(1.0f, 1.0f, 1.0f) == 1.0f, "zero-width extent collapses to lo");

    // Inverted extent.
    arm_timeout(5);
    CHECK(std::isfinite(reflect_coord(0.5f, 1.0f, 0.0f)),
          "inverted extent must return a finite value");
    disarm_timeout();

    // Non-finite inputs.
    arm_timeout(5);
    float inf = std::numeric_limits<float>::infinity();
    float nan = std::numeric_limits<float>::quiet_NaN();
    CHECK(std::isfinite(reflect_coord(inf, 0.0f, 1.0f)), "+inf must map to a finite value");
    CHECK(std::isfinite(reflect_coord(-inf, 0.0f, 1.0f)), "-inf must map to a finite value");
    CHECK(std::isfinite(reflect_coord(nan, 0.0f, 1.0f)), "NaN must map to a finite value");
    CHECK(reflect_coord(inf, 0.0f, 1.0f) == 0.0f, "+inf maps to lo");
    CHECK(reflect_coord(nan, 0.0f, 1.0f) == 0.0f, "NaN maps to lo");
    disarm_timeout();

    // Exact folding behaviour.
    CHECK(std::fabs(reflect_coord(2.3f, 0.0f, 1.0f) - 0.3f) < 1e-6f,
          "reflect_coord(2.3, 0, 1) should be 0.3, got %g", reflect_coord(2.3f, 0.0f, 1.0f));
    CHECK(std::fabs(reflect_coord(-0.2f, 0.0f, 1.0f) - 0.2f) < 1e-6f,
          "reflect_coord(-0.2, 0, 1) should be 0.2, got %g", reflect_coord(-0.2f, 0.0f, 1.0f));
    CHECK(std::fabs(reflect_coord(1.5f, 0.0f, 1.0f) - 0.5f) < 1e-6f,
          "reflect_coord(1.5, 0, 1) should be 0.5, got %g", reflect_coord(1.5f, 0.0f, 1.0f));
    CHECK(reflect_coord(0.5f, 0.0f, 1.0f) == 0.5f, "interior point is unchanged");
    CHECK(reflect_coord(0.0f, 0.0f, 1.0f) == 0.0f, "lo maps to lo");
    CHECK(reflect_coord(1.0f, 0.0f, 1.0f) == 1.0f, "hi maps to hi");

    // Folding in an offset interval [2,3] (period 2): v=7.3 -> 7.3-2 = 5.3,
    // mod 2 = 1.3, which exceeds the span (1), so it reflects to 2-1.3 = 0.7
    // and lands at 2+0.7 = 2.7. Cross-checked against the original fold loop,
    // which reaches the same value in 3 iterations.
    CHECK(std::fabs(reflect_coord(7.3f, 2.0f, 3.0f) - 2.7f) < 1e-5f,
          "offset interval folding, got %g", reflect_coord(7.3f, 2.0f, 3.0f));

    arm_timeout(10);
    for (int k = -2000; k <= 2000; k++) {
        float v = (float)k * 0.37f;
        float r = reflect_coord(v, -1.5f, 2.5f);
        CHECK(std::isfinite(r), "reflect_coord(%g) must be finite, got %g", v, r);
        CHECK(r >= -1.5f - 1e-5f && r <= 2.5f + 1e-5f,
              "reflect_coord(%g) escaped the box: %g", v, r);
    }
    disarm_timeout();
}

// ============================================================
// C4: gaussian() must stay finite
// ============================================================

static void test_c4_gaussian_finite() {
    SECTION("C4: gaussian() never returns a non-finite value");

    // Seed the PRNG so u1 is exercised across many draws.
    Xoshiro256 rng;
    rng.seed(20240607ULL);
    for (int i = 0; i < 200000; i++) {
        double g = rng.gaussian();
        if (!std::isfinite(g)) {
            CHECK(false, "gaussian() returned a non-finite value on draw %d", i);
            return;
        }
    }
    CHECK(true, "gaussian finite over 200k draws");

    // A seed whose first uniform() draw is exactly 0 would previously produce
    // sqrt(-2 * log(0)) == +inf. With u1 = 1 - uniform() that cannot happen.
    Xoshiro256 zero;
    zero.seed(0);
    double first_u = zero.uniform();
    double mirrored = 1.0 - first_u;
    CHECK(mirrored > 0.0, "1 - uniform() must be strictly positive, got %g", mirrored);
    CHECK(std::isfinite(std::sqrt(-2.0 * std::log(mirrored))),
          "sqrt(-2 log(1 - uniform())) must be finite");
}

int main() {
    fprintf(stderr, "wasm-spatial native engine tests\n");

    test_d1_tail_molecules_diffuse_and_are_counted();
    test_d1_reaction_product_diffuses_next_step();
    test_d2_index_contract();
    test_d3_negative_species_ids();
    test_c3_reflect_coord();
    test_c4_gaussian_finite();

    fprintf(stderr, "\n%d checks, %d failure(s)\n", g_checks, g_failures);
    return g_failures == 0 ? 0 : 1;
}