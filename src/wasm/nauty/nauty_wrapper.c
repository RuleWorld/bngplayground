
#include "nauty.h"
#include <stdlib.h>
#include <stdio.h>


// Global options and stats
DEFAULTOPTIONS_GRAPH(options);
statsblk stats;

/**
 * Compute canonical labeling for a graph using Nauty.
 * 
 * n: number of vertices
 * flat_adj: adjacency matrix flattened (n x n), 1 if edge, 0 otherwise
 * colors: vertex coloring array (size n), vertices with same color are in same partition
 *         Use NULL or all same values for no coloring
 * lab_out: output array of size n to store canonical labeling (permutation)
 *          After calling, lab_out[i] gives the vertex that should be at position i
 *          in the canonical ordering
 * orbits_out: output array of size n to store orbit indices
 */
void getCanonicalLabeling(int n, int* flat_adj, int* colors, int* lab_out, int* orbits_out) {
    int m = (n + WORDSIZE - 1) / WORDSIZE;
    
    // Declare dynamic arrays using Nauty macros
    DYNALLSTAT(graph, g, g_sz);
    DYNALLSTAT(graph, cg, cg_sz);  // Canonical graph (not used but required for getcanon)
    DYNALLSTAT(int, lab, lab_sz);
    DYNALLSTAT(int, ptn, ptn_sz);
    DYNALLSTAT(int, orbits, orbits_sz);
    DYNALLSTAT(set, workspace, workspace_sz);
    
    // Initialize options for canonical labeling
    options.getcanon = TRUE;    // CRITICAL: Enable canonical labeling
    options.digraph = FALSE;    // Undirected graph for species
    options.defaultptn = TRUE;  // Will be overridden if colors provided
    
    // Allocate memory
    DYNALLOC2(graph, g, g_sz, m, n, "malloc g");
    DYNALLOC2(graph, cg, cg_sz, m, n, "malloc cg");
    DYNALLOC1(int, lab, lab_sz, n, "malloc lab");
    DYNALLOC1(int, ptn, ptn_sz, n, "malloc ptn");
    DYNALLOC1(int, orbits, orbits_sz, n, "malloc orbits");
    DYNALLOC1(set, workspace, workspace_sz, 100 * m, "malloc workspace");
    
    // Build graph from adjacency matrix
    EMPTYSET(g, (size_t)m * (size_t)n);
    
    for (int i = 0; i < n; i++) {
        set *gv = GRAPHROW(g, i, m);
        for (int j = 0; j < n; j++) {
            if (flat_adj[i * n + j]) {
                ADDELEMENT(gv, j);
            }
        }
    }
    
    // Set up vertex coloring if provided
    if (colors != NULL) {
        options.defaultptn = FALSE;
        
        // Sort vertices by color to create initial partition
        // Build (lab, ptn) from colors
        // lab = vertices sorted by color
        // ptn = 1 if next vertex has same color, 0 otherwise
        
        // Create array of (color, vertex) pairs for sorting
        int* pairs = (int*)malloc(2 * n * sizeof(int));
        for (int i = 0; i < n; i++) {
            pairs[2*i] = colors[i];
            pairs[2*i + 1] = i;
        }
        
        // Simple bubble sort by color (n is typically small)
        for (int i = 0; i < n - 1; i++) {
            for (int j = 0; j < n - i - 1; j++) {
                if (pairs[2*j] > pairs[2*(j+1)]) {
                    int tc = pairs[2*j]; pairs[2*j] = pairs[2*(j+1)]; pairs[2*(j+1)] = tc;
                    int tv = pairs[2*j+1]; pairs[2*j+1] = pairs[2*(j+1)+1]; pairs[2*(j+1)+1] = tv;
                }
            }
        }
        
        // Build lab and ptn from sorted pairs
        for (int i = 0; i < n; i++) {
            lab[i] = pairs[2*i + 1];
            ptn[i] = (i < n - 1 && pairs[2*i] == pairs[2*(i+1)]) ? 1 : 0;
        }
        
        free(pairs);
    } else {
        // Default: all vertices in same partition
        for (int i = 0; i < n; i++) {
            lab[i] = i;
            ptn[i] = (i < n - 1) ? 1 : 0;
        }
        ptn[n-1] = 0;
    }
    
    // Call nauty with canonical labeling enabled
    nauty(g, lab, ptn, NULL, orbits, &options, &stats, workspace, 100 * m, m, n, cg);
    
    // Copy results
    for (int i = 0; i < n; i++) {
        lab_out[i] = lab[i];
        orbits_out[i] = orbits[i];
    }
    
    // Clean up
    DYNFREE(g, g_sz);
    DYNFREE(cg, cg_sz);
    DYNFREE(lab, lab_sz);
    DYNFREE(ptn, ptn_sz);
    DYNFREE(orbits, orbits_sz);
    DYNFREE(workspace, workspace_sz);
}

/**
 * Legacy function for backwards compatibility - just computes orbits
 */
void getCanonicalOrbits(int n, int* flat_adj, int* orbits_out) {
    int* lab_out = (int*)malloc(n * sizeof(int));
    getCanonicalLabeling(n, flat_adj, NULL, lab_out, orbits_out);
    free(lab_out);
}

// Entry point for testing or basic usage
int main() {
    return 0;
}

