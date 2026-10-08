/**
 * wasm-spatial/spatial_engine.cpp
 *
 * C++ spatial Monte Carlo engine for WebAssembly.
 * Phase 2: Moves the performance-critical inner loop (diffusion + collision detection)
 * from TypeScript to C++ WASM for 10-50x speedup.
 *
 * Architecture:
 * - Flat arrays for molecule data (SoA layout: [x0,x1,...,y0,y1,...,z0,z1,...,species0,...])
 * - Uniform spatial grid for O(N) collision detection
 * - Xoshiro256** PRNG for reproducibility
 * - Box-Muller transform for Gaussian displacements
 * - Calls back to libBNG via C function pointers for reaction resolution
 *
 * Handle contract (molecule indices)
 * -----------------------------------
 * `spatial_add_molecule` returns the new molecule's ARRAY INDEX, and every
 * `spatial_get_molecule_*` / `spatial_remove_molecule` call takes that same
 * array index. Indices are NOT stable identities:
 *
 * - Dead molecules are tombstoned (`alive = 0`) but keep their slot until the
 *   periodic compaction in `spatial_step`. A dead slot still has a valid index;
 *   the `spatial_get_molecule_*` accessors report -1 / 0.0f for it, which is how
 *   callers detect liveness when iterating by index.
 * - `spatial_step` may compact the pool (every 100 steps), shifting entries down.
 *   ANY index previously returned by `spatial_add_molecule` is therefore
 *   invalidated by `spatial_step`. Re-enumerate after every step.
 * - `spatial_molecule_count` reports the number of ADDRESSABLE SLOTS (the pool
 *   array size), not the number of alive molecules, so that
 *   `for (i = 0; i < spatial_molecule_count(); i++)` covers every valid index.
 *   Use `spatial_count_species` or `spatial_export_positions` to count ALIVE
 *   molecules.
 * - `spatial_add_molecule` returns -1 for an invalid (negative) species id.
 *
 * Loops inside this file always iterate `g_pool.x.size()`, never `g_pool.count`.
 * `count` is the alive total only, and trails the array length between
 * compactions.
 */

#include <cstdint>
#include <cmath>
#include <cstring>
#include <vector>
#include <unordered_map>
#include <algorithm>

// ============================================================
// Xoshiro256** PRNG — Matches the TypeScript implementation exactly
// ============================================================
struct Xoshiro256 {
    uint64_t s[4];

    void seed(uint64_t seed_val) {
        // SplitMix64 initialization
        uint64_t z = seed_val;
        for (int i = 0; i < 4; i++) {
            z += 0x9e3779b97f4a7c15ULL;
            z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ULL;
            z = (z ^ (z >> 27)) * 0x94d049bb133111ebULL;
            z = z ^ (z >> 31);
            s[i] = z;
        }
    }

    uint64_t rotl(uint64_t x, int k) {
        return (x << k) | (x >> (64 - k));
    }

    uint64_t next() {
        const uint64_t result = rotl(s[1] * 5, 7) * 9;
        const uint64_t t = s[1] << 17;
        s[2] ^= s[0];
        s[3] ^= s[1];
        s[1] ^= s[2];
        s[0] ^= s[3];
        s[2] ^= t;
        s[3] = rotl(s[3], 45);
        return result;
    }

    // [0, 1)
    double uniform() {
        return (double)(next() >> 11) / (double)(1ULL << 53);
    }

    // Standard normal via Box-Muller
    double gaussian() {
        // u1 in (0, 1]: uniform() can return exactly 0, and log(0) = -inf would
        // produce an infinite displacement that then poisons reflect_coord.
        double u1 = 1.0 - uniform();
        double u2 = uniform();
        return sqrt(-2.0 * log(u1)) * cos(2.0 * M_PI * u2);
    }
};

// ============================================================
// Molecule storage — Structure of Arrays for cache efficiency
// ============================================================
struct MoleculePool {
    std::vector<float> x, y, z;
    std::vector<int32_t> species_id;
    std::vector<int32_t> compartment_id;
    std::vector<uint8_t> alive; // 1 = active, 0 = marked for removal
    // Alive total only. The addressable index range is [0, x.size()).
    int32_t count = 0;

    void reserve(int n) {
        x.reserve(n); y.reserve(n); z.reserve(n);
        species_id.reserve(n);
        compartment_id.reserve(n);
        alive.reserve(n);
    }
    // Returns the new molecule's ARRAY INDEX (see the handle contract in the
    // file header). Not a stable identity.
    int add(float px, float py, float pz, int sid, int cid) {
        x.push_back(px);
        y.push_back(py);
        z.push_back(pz);
        species_id.push_back(sid);
        compartment_id.push_back(cid);
        alive.push_back(1);
        count++;
        return (int)x.size() - 1;
    }

    void compact() {
        // Remove dead molecules by compacting arrays
        int write = 0;
        for (int read = 0; read < (int)x.size(); read++) {
            if (alive[read]) {
                if (write != read) {
                    x[write] = x[read];
                    y[write] = y[read];
                    z[write] = z[read];
                    species_id[write] = species_id[read];
                    compartment_id[write] = compartment_id[read];
                    alive[write] = alive[read];
                }
                write++;
            }
        }
        count = write;
        x.resize(write); y.resize(write); z.resize(write);
        species_id.resize(write);
        compartment_id.resize(write);
        alive.resize(write);
    }
};

// ============================================================
// Spatial grid — Uniform partition for O(N) collision detection
// ============================================================
struct GridCell {
    std::vector<int32_t> molecule_indices;
};

struct SpatialGrid {
    float cell_size;
    // Using hash map for sparse grid
    std::unordered_map<int64_t, GridCell> cells;

    int64_t hash_key(int ix, int iy, int iz) {
        // Combine three ints into one 64-bit key
        // Each coordinate gets 21 bits → ±1M cells per axis
        return ((int64_t)(ix + 1048576) << 42) |
               ((int64_t)(iy + 1048576) << 21) |
               ((int64_t)(iz + 1048576));
    }

    void clear() { cells.clear(); }

    void insert(int mol_idx, float x, float y, float z) {
        int ix = (int)floor(x / cell_size);
        int iy = (int)floor(y / cell_size);
        int iz = (int)floor(z / cell_size);
        cells[hash_key(ix, iy, iz)].molecule_indices.push_back(mol_idx);
    }

    // Get all molecules in the neighborhood (27 cells)
    void get_neighbors(float x, float y, float z,
                       std::vector<int32_t>& out) {
        int ix = (int)floor(x / cell_size);
        int iy = (int)floor(y / cell_size);
        int iz = (int)floor(z / cell_size);

        out.clear();
        for (int dx = -1; dx <= 1; dx++) {
            for (int dy = -1; dy <= 1; dy++) {
                for (int dz = -1; dz <= 1; dz++) {
                    int64_t key = hash_key(ix + dx, iy + dy, iz + dz);
                    auto it = cells.find(key);
                    if (it != cells.end()) {
                        out.insert(out.end(),
                                   it->second.molecule_indices.begin(),
                                   it->second.molecule_indices.end());
                    }
                }
            }
        }
    }
};

// ============================================================
// Box geometry for boundary reflection
// ============================================================
struct BoundaryBox {
    float cx, cy, cz; // center
    float hx, hy, hz; // half-extents
};

/**
 * Mirror `v` into [lo, hi], reflecting off both walls (period 2 * (hi - lo)).
 *
 * Closed form rather than a fold loop: the loop never terminates for a
 * zero-width box, alternates forever for +-Infinity, and returns NaN for NaN.
 * This form is total — it returns a value for every input bit pattern, and
 * always lands inside [lo, hi] for a well-formed box.
 *
 * Kept bit-for-bit in sync with reflectCoord() in
 * packages/engine/src/services/spatial/SpatialSimulation.ts.
 */
static float reflect_coord(float v, float lo, float hi) {
    const float w = hi - lo;
    if (!std::isfinite(w) || !(w > 0.0f)) return std::isfinite(lo) ? lo : 0.0f;
    if (!std::isfinite(v)) return lo;
    const float p = 2.0f * w;
    float t = std::fmod(v - lo, p);
    if (t < 0.0f) t += p;
    return t <= w ? lo + t : lo + (p - t);
}

// ============================================================
// Diffusion constant lookup (species_id → D in µm²/s)
// ============================================================
static std::vector<double> g_diffusion_constants; // indexed by species_id

// ============================================================
// Engine state
// ============================================================
static MoleculePool g_pool;
static SpatialGrid g_grid;
static Xoshiro256 g_rng;
static BoundaryBox g_boundary;
static double g_dt = 1e-6;
static float g_rxn_radius = 0.01f;
static int g_step_count = 0;

// Callback to libBNG for reaction resolution (set from JS via function pointers)
typedef int (*check_rxn_fn)(int species_a, int species_b);
typedef double (*get_max_prob_fn)(int species_a, int species_b);
typedef int (*get_pathway_fn)(int species_a, int species_b, double prob);
typedef int (*get_product_count_fn)(int species_a, int species_b, int pathway);
typedef int (*get_product_fn)(int species_a, int species_b, int pathway, int prod_idx);

static check_rxn_fn g_check_rxn = nullptr;
static get_max_prob_fn g_get_max_prob = nullptr;
static get_pathway_fn g_get_pathway = nullptr;
static get_product_count_fn g_get_product_count = nullptr;
static get_product_fn g_get_product = nullptr;

extern "C" {

// ============================================================
// Initialization & Config
// ============================================================

int spatial_init(double dt, uint32_t seed) {
    g_rng.seed((uint64_t)seed);
    g_dt = dt;
    g_pool = MoleculePool();
    g_pool.reserve(10000);
    g_step_count = 0;
    g_diffusion_constants.clear();
    return 0;
}

void spatial_set_rxn_radius(double rxn_radius) {
    g_rxn_radius = (float)rxn_radius;
}

void spatial_set_grid_size(double side_x, double side_y, double side_z, double cell_size) {
    g_boundary.cx = 0; g_boundary.cy = 0; g_boundary.cz = 0;
    g_boundary.hx = (float)(side_x * 0.5);
    g_boundary.hy = (float)(side_y * 0.5);
    g_boundary.hz = (float)(side_z * 0.5);
    g_grid.cell_size = (float)cell_size;
}

void spatial_destroy() {
    g_pool = MoleculePool();
    g_grid.clear();
    g_diffusion_constants.clear();
    g_check_rxn = nullptr;
    g_get_max_prob = nullptr;
    g_get_pathway = nullptr;
    g_get_product_count = nullptr;
    g_get_product = nullptr;
}

// ============================================================
// Molecule management
// ============================================================

// Returns the new molecule's array index, or -1 if species_id is negative.
// (A species with no registered diffusion constant is legal; it simply does
// not diffuse.)
int spatial_add_molecule(float x, float y, float z, int species_id, int compartment_id) {
    if (species_id < 0) return -1;
    return g_pool.add(x, y, z, species_id, compartment_id);
}

void spatial_clear_molecules() {
    g_pool = MoleculePool();
    g_pool.reserve(10000);
}

// Returns 0 on success, -1 if species_id is negative. The previous guard was
// `species_id >= size`, which is false for negatives and so wrote
// g_diffusion_constants[negative] — an out-of-bounds heap write.
int spatial_set_diffusion_constant(int species_id, double D_cm2_per_s) {
    if (species_id < 0) return -1;
    if (species_id >= (int)g_diffusion_constants.size()) {
        g_diffusion_constants.resize(species_id + 1, 0.0);
    }
    // Convert cm²/s → µm²/s (* 1e8)
    g_diffusion_constants[species_id] = D_cm2_per_s * 1e8;
    return 0;
}

// Number of ADDRESSABLE SLOTS (pool array size), not the alive total, so that
// `for (i = 0; i < spatial_molecule_count(); i++)` covers every valid index.
// Use spatial_count_species / spatial_export_positions for the alive census.
int spatial_molecule_count() {
    return (int)g_pool.x.size();
}

void spatial_remove_molecule(int index) {
    if (index >= 0 && index < (int)g_pool.x.size()) {
        if (g_pool.alive[index]) {
            g_pool.alive[index] = 0;
            g_pool.count--;
        }
    }
}

// Accessors below report -1 (ids) / 0.0f (coords) for both out-of-range indices
// AND live-but-dead (tombstoned) slots. That is what lets a caller enumerate
// [0, spatial_molecule_count()) and skip tombstones without a separate query.
int spatial_get_molecule_species_id(int index) {
    if (index >= 0 && index < (int)g_pool.x.size() && g_pool.alive[index]) {
        return g_pool.species_id[index];
    }
    return -1;
}

int spatial_get_molecule_compartment_id(int index) {
    if (index >= 0 && index < (int)g_pool.x.size() && g_pool.alive[index]) {
        return g_pool.compartment_id[index];
    }
    return -1;
}

float spatial_get_molecule_x(int index) {
    if (index >= 0 && index < (int)g_pool.x.size() && g_pool.alive[index]) {
        return g_pool.x[index];
    }
    return 0.0f;
}

float spatial_get_molecule_y(int index) {
    if (index >= 0 && index < (int)g_pool.x.size() && g_pool.alive[index]) {
        return g_pool.y[index];
    }
    return 0.0f;
}

float spatial_get_molecule_z(int index) {
    if (index >= 0 && index < (int)g_pool.x.size() && g_pool.alive[index]) {
        return g_pool.z[index];
    }
    return 0.0f;
}

// ============================================================
// Set reaction callbacks (from JS)
// ============================================================

void spatial_set_callbacks(
    check_rxn_fn check, get_max_prob_fn max_prob,
    get_pathway_fn pathway, get_product_count_fn prod_count,
    get_product_fn product
) {
    g_check_rxn = check;
    g_get_max_prob = max_prob;
    g_get_pathway = pathway;
    g_get_product_count = prod_count;
    g_get_product = product;
}

// ============================================================
// Simulation step
// ============================================================

void spatial_step() {
    double dt = g_dt;

    // 1. Diffuse all molecules.
    // Iterate the ARRAY SIZE, not the alive count: tombstones keep their slots
    // until the periodic compaction, so `count` trails x.size() and would skip
    // the appended tail entirely.
    const int n_slots = (int)g_pool.x.size();
    for (int i = 0; i < n_slots; i++) {
        if (!g_pool.alive[i]) continue;

        int sid = g_pool.species_id[i];
        // Guard BOTH ends: a negative sid fails the upper bound and would read
        // g_diffusion_constants[sid] out of bounds.
        double D = (sid >= 0 && sid < (int)g_diffusion_constants.size())
                     ? g_diffusion_constants[sid]
                     : 0.0;
        if (D <= 0) continue;

        double sigma = sqrt(2.0 * D * dt);
        g_pool.x[i] += (float)(g_rng.gaussian() * sigma);
        g_pool.y[i] += (float)(g_rng.gaussian() * sigma);
        g_pool.z[i] += (float)(g_rng.gaussian() * sigma);

        // Reflective boundaries
        float lo_x = g_boundary.cx - g_boundary.hx;
        float hi_x = g_boundary.cx + g_boundary.hx;
        float lo_y = g_boundary.cy - g_boundary.hy;
        float hi_y = g_boundary.cy + g_boundary.hy;
        float lo_z = g_boundary.cz - g_boundary.hz;
        float hi_z = g_boundary.cz + g_boundary.hz;
        g_pool.x[i] = reflect_coord(g_pool.x[i], lo_x, hi_x);
        g_pool.y[i] = reflect_coord(g_pool.y[i], lo_y, hi_y);
        g_pool.z[i] = reflect_coord(g_pool.z[i], lo_z, hi_z);
    }

    // 2. Rebuild grid. Same array-size bound as the diffusion loop: a molecule
    // omitted here is invisible to collisions and can never react.
    g_grid.clear();
    for (int i = 0; i < n_slots; i++) {
        if (g_pool.alive[i]) {
            g_grid.insert(i, g_pool.x[i], g_pool.y[i], g_pool.z[i]);
        }
    }

    // 3. Bimolecular reactions
    if (g_check_rxn && g_get_max_prob && g_get_pathway &&
        g_get_product_count && g_get_product) {

        std::vector<int32_t> neighbors;
        float rxn_radius_sq = g_rxn_radius * g_rxn_radius;

        for (auto& [key, cell] : g_grid.cells) {
            for (int ii = 0; ii < (int)cell.molecule_indices.size(); ii++) {
                int i = cell.molecule_indices[ii];
                if (!g_pool.alive[i]) continue;

                // Check neighbors
                g_grid.get_neighbors(g_pool.x[i], g_pool.y[i], g_pool.z[i], neighbors);

                for (int j : neighbors) {
                    if (j <= i) continue; // avoid double-checking
                    if (!g_pool.alive[j]) continue;

                    // Distance check
                    float dx = g_pool.x[i] - g_pool.x[j];
                    float dy = g_pool.y[i] - g_pool.y[j];
                    float dz = g_pool.z[i] - g_pool.z[j];
                    float dist_sq = dx*dx + dy*dy + dz*dz;

                    if (dist_sq > rxn_radius_sq) continue;

                    int sa = g_pool.species_id[i];
                    int sb = g_pool.species_id[j];

                    if (!g_check_rxn(sa, sb)) continue;

                    double max_p = g_get_max_prob(sa, sb);
                    if (max_p <= 0) continue;

                    double prob = g_rng.uniform() * max_p;
                    int pathway = g_get_pathway(sa, sb, prob);
                    if (pathway < 0) continue;

                    int n_products = g_get_product_count(sa, sb, pathway);

                    // Remove reactants
                    g_pool.alive[i] = 0;
                    g_pool.alive[j] = 0;
                    g_pool.count -= 2;

                    // Add products at midpoint
                    float mx = (g_pool.x[i] + g_pool.x[j]) * 0.5f;
                    float my = (g_pool.y[i] + g_pool.y[j]) * 0.5f;
                    float mz = (g_pool.z[i] + g_pool.z[j]) * 0.5f;

                    for (int p = 0; p < n_products; p++) {
                        int pid = g_get_product(sa, sb, pathway, p);
                        if (pid >= 0) {
                            g_pool.add(
                                mx + (float)(g_rng.gaussian() * 0.01),
                                my + (float)(g_rng.gaussian() * 0.01),
                                mz + (float)(g_rng.gaussian() * 0.01),
                                pid, g_pool.compartment_id[i]
                            );
                        }
                    }
                    break; // molecule i is consumed
                }
            }
        }
    }

    // 4. Compact dead molecules periodically
    if (g_step_count % 100 == 0) {
        g_pool.compact();
    }

    g_step_count++;
}

// ============================================================
// Data Export
// ============================================================

int spatial_export_positions(float* out_buffer, int max_molecules) {
    int written = 0;
    int total_slots = (int)g_pool.x.size();
    for (int i = 0; i < total_slots && written < max_molecules; i++) {
        if (!g_pool.alive[i]) continue;
        out_buffer[written * 5 + 0] = g_pool.x[i];
        out_buffer[written * 5 + 1] = g_pool.y[i];
        out_buffer[written * 5 + 2] = g_pool.z[i];
        out_buffer[written * 5 + 3] = (float)g_pool.species_id[i];
        out_buffer[written * 5 + 4] = (float)g_pool.compartment_id[i];
        written++;
    }
    return written;
}

int spatial_count_species(int* species_ids, int* counts, int max_species) {
    // Array-size bound, matching spatial_export_positions: otherwise the
    // species census disagrees with the exported positions.
    std::unordered_map<int, int> counts_map;
    for (int i = 0; i < (int)g_pool.x.size(); i++) {
        if (g_pool.alive[i]) {
            counts_map[g_pool.species_id[i]]++;
        }
    }

    int written = 0;
    for (auto const& [sid, count] : counts_map) {
        if (written >= max_species) break;
        species_ids[written] = sid;
        counts[written] = count;
        written++;
    }
    return written;
}

} // extern "C"
