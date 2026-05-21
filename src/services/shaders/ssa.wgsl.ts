/**
 * ssa.wgsl.ts - WGSL compute shader template for GPU-accelerated SSA (Gillespie algorithm)
 *
 * Template placeholders:
 *   {{N_SPECIES}}          - number of chemical species
 *   {{N_REACTIONS}}        - number of reactions
 *   {{N_OUTPUT_POINTS}}    - number of output time points
 *   {{MAX_STEPS}}          - maximum SSA steps per trajectory
 *   {{PROPENSITY_FUNCTION}} - inline propensity computation for each reaction
 *   {{SPARSE_APPLY_STOICHIOMETRY}} - per-reaction switch for sparse state updates
 */

export const SSA_SHADER_TEMPLATE = /* wgsl */ `
// =============================================================================
// WebGPU SSA (Gillespie) Compute Shader - Auto-generated
// =============================================================================

const N_SPECIES: u32 = {{N_SPECIES}}u;
const N_REACTIONS: u32 = {{N_REACTIONS}}u;
const N_OUTPUT_POINTS: u32 = {{N_OUTPUT_POINTS}}u;
const MAX_STEPS: u32 = {{MAX_STEPS}}u;

// -----------------------------------------------------------------------------
// Bindings
// -----------------------------------------------------------------------------

struct Params {
  n_trajectories: u32,
  t_end: f32,
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> initial_state: array<f32>;
@group(0) @binding(2) var<storage, read_write> output: array<f32>;
@group(0) @binding(3) var<storage, read_write> prng_state: array<u32>;
@group(0) @binding(4) var<storage, read> output_times: array<f32>;
@group(0) @binding(5) var<storage, read_write> total_reactions: array<u32>;

// -----------------------------------------------------------------------------
// xoshiro128** PRNG — operates on private (register) state
//
// The PRNG state is loaded from storage once at kernel start and written back
// once at kernel end.  This eliminates 8 storage reads + 4 storage writes per
// random number that the previous version incurred via prng_state[].
// -----------------------------------------------------------------------------

var<private> ps0: u32;
var<private> ps1: u32;
var<private> ps2: u32;
var<private> ps3: u32;

fn rotl(x: u32, k: u32) -> u32 {
  return (x << k) | (x >> (32u - k));
}

fn xoshiro128ss() -> u32 {
  let result = rotl(ps1 * 5u, 7u) * 9u;
  let t = ps1 << 9u;

  var ns2 = ps2 ^ ps0;
  var ns3 = ps3 ^ ps1;
  let ns1 = ps1 ^ ns2;
  let ns0 = ps0 ^ ns3;

  ns2 = ns2 ^ t;
  ns3 = rotl(ns3, 11u);

  ps0 = ns0;
  ps1 = ns1;
  ps2 = ns2;
  ps3 = ns3;

  return result;
}

fn rand_uniform() -> f32 {
  let bits = xoshiro128ss();
  return f32((bits >> 9u) + 1u) / f32(0x800001u);
}

fn rand_exponential(lambda: f32) -> f32 {
  let u = rand_uniform();
  return -log(u) / lambda;
}

// -----------------------------------------------------------------------------
// Propensity computation (generated per-model)
// -----------------------------------------------------------------------------

fn compute_propensities(state: ptr<function, array<f32, {{RAW_N_SPECIES}}>>, propensities: ptr<function, array<f32, {{RAW_N_REACTIONS}}>>) {
{{PROPENSITY_FUNCTION}}
}

// -----------------------------------------------------------------------------
// Main SSA kernel - one invocation per trajectory
// -----------------------------------------------------------------------------

@compute @workgroup_size(1)
fn ssa_main(@builtin(global_invocation_id) global_id: vec3u) {
  let tid = global_id.x;
  if (tid >= params.n_trajectories) {
    return;
  }

  // Load PRNG state from storage into private registers (once)
  let prng_base = tid * 4u;
  ps0 = prng_state[prng_base + 0u];
  ps1 = prng_state[prng_base + 1u];
  ps2 = prng_state[prng_base + 2u];
  ps3 = prng_state[prng_base + 3u];

  // Initialize state from initial conditions
  var state: array<f32, {{RAW_N_SPECIES}}>;
  for (var i = 0u; i < N_SPECIES; i = i + 1u) {
    state[i] = initial_state[i];
  }

  var propensities: array<f32, {{RAW_N_REACTIONS}}>;
  var t: f32 = 0.0;
  var output_idx: u32 = 0u;
  var reaction_count: u32 = 0u;

  // Output offset for this trajectory
  let traj_output_base = tid * N_OUTPUT_POINTS * N_SPECIES;

  // Record state at output times <= 0
  for (var oi = output_idx; oi < N_OUTPUT_POINTS; oi = oi + 1u) {
    if (output_times[oi] > t) {
      break;
    }
    for (var s = 0u; s < N_SPECIES; s = s + 1u) {
      output[traj_output_base + oi * N_SPECIES + s] = state[s];
    }
    output_idx = oi + 1u;
  }

  // Main SSA loop
  for (var step = 0u; step < MAX_STEPS; step = step + 1u) {
    if (t >= params.t_end || output_idx >= N_OUTPUT_POINTS) {
      break;
    }

    // Compute propensities
    compute_propensities(&state, &propensities);

    // Total propensity
    var a0: f32 = 0.0;
    for (var j = 0u; j < N_REACTIONS; j = j + 1u) {
      a0 = a0 + propensities[j];
    }

    // If total propensity is zero, system is absorbed - fill remaining outputs
    if (a0 <= 0.0) {
      for (var oi = output_idx; oi < N_OUTPUT_POINTS; oi = oi + 1u) {
        for (var s = 0u; s < N_SPECIES; s = s + 1u) {
          output[traj_output_base + oi * N_SPECIES + s] = state[s];
        }
      }
      output_idx = N_OUTPUT_POINTS;
      break;
    }

    // Generate wait time (exponential with rate a0)
    let tau = rand_exponential(a0);
    let t_next = t + tau;

    // Record output at any scheduled time points between t and t_next
    for (var oi = output_idx; oi < N_OUTPUT_POINTS; oi = oi + 1u) {
      if (output_times[oi] > t_next) {
        break;
      }
      for (var s = 0u; s < N_SPECIES; s = s + 1u) {
        output[traj_output_base + oi * N_SPECIES + s] = state[s];
      }
      output_idx = oi + 1u;
    }

    // Select reaction: find j such that sum(a_0..a_j) > r * a0
    let r = rand_uniform() * a0;
    var cumsum: f32 = 0.0;
    var selected_rxn: u32 = 0u;
    for (var j = 0u; j < N_REACTIONS; j = j + 1u) {
      cumsum = cumsum + propensities[j];
      if (cumsum > r) {
        selected_rxn = j;
        break;
      }
      selected_rxn = j;
    }

    // Apply stoichiometry update (sparse — only non-zero entries)
{{SPARSE_APPLY_STOICHIOMETRY}}

    t = t_next;
    reaction_count = reaction_count + 1u;
  }

  // Fill any remaining output points with final state
  for (var oi = output_idx; oi < N_OUTPUT_POINTS; oi = oi + 1u) {
    for (var s = 0u; s < N_SPECIES; s = s + 1u) {
      output[traj_output_base + oi * N_SPECIES + s] = state[s];
    }
  }

  // Store total reaction count
  total_reactions[tid] = reaction_count;

  // Write PRNG state back to storage (once)
  prng_state[prng_base + 0u] = ps0;
  prng_state[prng_base + 1u] = ps1;
  prng_state[prng_base + 2u] = ps2;
  prng_state[prng_base + 3u] = ps3;
}
`;