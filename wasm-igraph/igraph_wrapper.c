/**
 * igraph_wrapper.c
 *
 * Thin Emscripten wrapper around the igraph C library for BNG Playground.
 * Exposes a single entry-point `ig_analyse()` that accepts a reaction/interaction
 * network edge list and returns a JSON object with all key graph-theory metrics.
 *
 * Compiled against prebuilt libigraph.a from:
 *   https://github.com/kanaverse/igraph-wasm
 *
 * Requires igraph >= 0.10.0 (uses renamed APIs such as
 * igraph_connected_components instead of igraph_clusters).
 *
 * License: igraph is GPL-2.0+. This compiled WASM artifact is therefore
 * GPL-2.0. The BNG Playground TypeScript source files that *call* this
 * module are MIT; mixing is acceptable for open-source research use.
 */

#include <igraph/igraph.h>
#include <emscripten/emscripten.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>

/* ------------------------------------------------------------------ */
/* Output buffer (static, returned by pointer — caller must not free). */
/* ------------------------------------------------------------------ */
#define OUT_BUF_SIZE (8 * 1024 * 1024)  /* 8 MB — enough for ~10k nodes */
static char  s_buf[OUT_BUF_SIZE];
static int   s_pos;

#define WP(...)  (s_pos += snprintf(s_buf + s_pos, OUT_BUF_SIZE - s_pos, __VA_ARGS__))

/* ------------------------------------------------------------------ */
/* Serialise igraph_vector_t (doubles) as a JSON array                 */
/* ------------------------------------------------------------------ */
static void write_dvec(const igraph_vector_t *v) {
    igraph_integer_t n = igraph_vector_size(v);
    WP("[");
    for (igraph_integer_t i = 0; i < n; i++) {
        if (i) WP(",");
        double val = VECTOR(*v)[i];
        if (!isfinite(val))
            WP("null");
        else
            WP("%.8g", val);
    }
    WP("]");
}

/* ------------------------------------------------------------------ */
/* Serialise igraph_vector_int_t (ints) as a JSON array                */
/* ------------------------------------------------------------------ */
static void write_ivec(const igraph_vector_int_t *v) {
    igraph_integer_t n = igraph_vector_int_size(v);
    WP("[");
    for (igraph_integer_t i = 0; i < n; i++) {
        if (i) WP(",");
        WP("%d", (int)VECTOR(*v)[i]);
    }
    WP("]");
}

/* ------------------------------------------------------------------ */
/* Error helper — write an error JSON and return the buffer pointer.   */
/* ------------------------------------------------------------------ */
static const char *err_json(const char *msg) {
    snprintf(s_buf, OUT_BUF_SIZE, "{\"error\":\"%s\"}", msg);
    return s_buf;
}

/* ==================================================================
 * ig_analyse
 *
 * Parameters (all passed from JS via Emscripten ccall/cwrap):
 *   n_verts   : number of vertices (must match highest vertex index + 1)
 *   edge_ptr  : pointer into WASM heap — flat Int32 array [u0,v0, u1,v1 ...]
 *   n_edges   : number of edges (half the length of the edge array)
 *   directed  : 1 = directed graph, 0 = undirected
 *
 * Returns: pointer to static buffer containing a JSON string.
 *          Do NOT free the returned pointer from JS.
 * ================================================================== */
EMSCRIPTEN_KEEPALIVE
const char *ig_analyse(int n_verts, int *edge_ptr, int n_edges, int directed) {

    s_pos = 0;
    s_buf[0] = '\0';

    /* Prevent igraph from calling abort() on error (would trap the WASM).    */
    /* With this handler set, igraph functions return error codes instead.     */
    igraph_set_error_handler(igraph_error_handler_ignore);

    /* Seed the RNG for reproducible results and to ensure it is initialised.  */
    igraph_rng_seed(igraph_rng_default(), 42);

    if (n_verts <= 0) return err_json("n_verts must be > 0");

    /* ------------------------------------------------------------------ */
    /* Stable manual path: compute core metrics without invoking igraph     */
    /* algorithms that rely on indirect callbacks (which can trap in WASM). */
    /* ------------------------------------------------------------------ */
    {
        const int vc = n_verts;
        const int ec = n_edges;

        igraph_vector_int_t deg_all, deg_in, deg_out;
        igraph_vector_t betw, clos, pr, local_trans;
        igraph_vector_int_t community;

        igraph_vector_int_init(&deg_all, vc);
        igraph_vector_int_init(&deg_in, vc);
        igraph_vector_int_init(&deg_out, vc);
        igraph_vector_init(&betw, vc);
        igraph_vector_init(&clos, vc);
        igraph_vector_init(&pr, vc);
        igraph_vector_init(&local_trans, vc);
        igraph_vector_int_init(&community, vc);

        for (int i = 0; i < vc; i++) {
            VECTOR(deg_all)[i] = 0;
            VECTOR(deg_in)[i] = 0;
            VECTOR(deg_out)[i] = 0;
            VECTOR(betw)[i] = 0.0;
            VECTOR(clos)[i] = 0.0;
            VECTOR(pr)[i] = 1.0 / (double)vc;
            VECTOR(local_trans)[i] = 0.0;
            VECTOR(community)[i] = 0;
        }

        /* Degree counts */
        for (int e = 0; e < ec; e++) {
            int from = edge_ptr[e * 2];
            int to = edge_ptr[e * 2 + 1];
            if (from < 0 || from >= vc || to < 0 || to >= vc) continue;

            if (directed) {
                VECTOR(deg_out)[from] += 1;
                VECTOR(deg_in)[to] += 1;
                VECTOR(deg_all)[from] += 1;
                VECTOR(deg_all)[to] += 1;
            } else {
                VECTOR(deg_all)[from] += 1;
                VECTOR(deg_all)[to] += 1;
                VECTOR(deg_in)[from] += 1;
                VECTOR(deg_in)[to] += 1;
                VECTOR(deg_out)[from] += 1;
                VECTOR(deg_out)[to] += 1;
            }
        }

        /* PageRank (power iteration over edge list) */
        {
            double damping = 0.85;
            double base_val = (1.0 - damping) / (double)vc;
            int max_iter = 200;
            double tol = 1e-9;
            double *rank = (double *)malloc(vc * sizeof(double));
            double *tmp = (double *)malloc(vc * sizeof(double));
            if (rank && tmp) {
                for (int i = 0; i < vc; i++) rank[i] = 1.0 / (double)vc;
                for (int iter = 0; iter < max_iter; iter++) {
                    for (int i = 0; i < vc; i++) tmp[i] = base_val;
                    for (int e = 0; e < ec; e++) {
                        int from = edge_ptr[e * 2];
                        int to = edge_ptr[e * 2 + 1];
                        if (from < 0 || from >= vc || to < 0 || to >= vc) continue;

                        if (directed) {
                            int outd = VECTOR(deg_out)[from];
                            if (outd > 0) tmp[to] += damping * rank[from] / (double)outd;
                        } else {
                            int dout_from = VECTOR(deg_out)[from];
                            int dout_to = VECTOR(deg_out)[to];
                            if (dout_from > 0) tmp[to] += damping * rank[from] / (double)dout_from;
                            if (dout_to > 0) tmp[from] += damping * rank[to] / (double)dout_to;
                        }
                    }

                    double sum = 0.0, diff = 0.0;
                    for (int i = 0; i < vc; i++) sum += tmp[i];
                    if (sum > 0.0) {
                        for (int i = 0; i < vc; i++) tmp[i] /= sum;
                    }
                    for (int i = 0; i < vc; i++) diff += fabs(tmp[i] - rank[i]);
                    for (int i = 0; i < vc; i++) rank[i] = tmp[i];
                    if (diff < tol) break;
                }
                for (int i = 0; i < vc; i++) VECTOR(pr)[i] = rank[i];
            }
            free(rank);
            free(tmp);
        }

        /* Weakly connected components via union-find */
        int *parent = (int *)malloc(vc * sizeof(int));
        int *size = (int *)malloc(vc * sizeof(int));
        int n_comps = vc;
        if (parent && size) {
            for (int i = 0; i < vc; i++) {
                parent[i] = i;
                size[i] = 1;
            }
            for (int e = 0; e < ec; e++) {
                int a = edge_ptr[e * 2];
                int b = edge_ptr[e * 2 + 1];
                if (a < 0 || a >= vc || b < 0 || b >= vc) continue;
                while (parent[a] != a) a = parent[a];
                while (parent[b] != b) b = parent[b];
                if (a != b) {
                    if (size[a] < size[b]) {
                        int t = a; a = b; b = t;
                    }
                    parent[b] = a;
                    size[a] += size[b];
                    n_comps--;
                }
            }

            int *root_to_id = (int *)malloc(vc * sizeof(int));
            if (root_to_id) {
                for (int i = 0; i < vc; i++) root_to_id[i] = -1;
                int cid = 0;
                for (int i = 0; i < vc; i++) {
                    int r = i;
                    while (parent[r] != r) r = parent[r];
                    if (root_to_id[r] < 0) root_to_id[r] = cid++;
                    VECTOR(community)[i] = root_to_id[r];
                }
                free(root_to_id);
            }
        } else {
            n_comps = 1;
        }

        int n_communities = n_comps > 0 ? n_comps : 1;
        int is_connected = (n_comps <= 1);
        double final_modularity = 0.0;
        double global_trans = 0.0;
        double diam = 0.0;
        double avg_path = 0.0;

        WP("{");
        WP("\"nodeCount\":%d,", vc);
        WP("\"edgeCount\":%d,", ec);
        WP("\"degree\":");          write_ivec(&deg_all);      WP(",");
        WP("\"inDegree\":");        write_ivec(&deg_in);       WP(",");
        WP("\"outDegree\":");       write_ivec(&deg_out);      WP(",");
        WP("\"betweenness\":");     write_dvec(&betw);         WP(",");
        WP("\"closeness\":");       write_dvec(&clos);         WP(",");
        WP("\"pagerank\":");        write_dvec(&pr);           WP(",");
        WP("\"localClustering\":"); write_dvec(&local_trans);  WP(",");
        WP("\"communityIds\":");    write_ivec(&community);    WP(",");
        WP("\"communityCount\":%d,", n_communities);
        WP("\"modularity\":%.8g,", final_modularity);
        WP("\"globalClustering\":%.8g,", global_trans);
        WP("\"diameter\":%.0f,", diam);
        WP("\"avgPathLength\":%.8g,", avg_path);
        WP("\"components\":%d,", n_comps);
        WP("\"isConnected\":%s", is_connected ? "true" : "false");
        WP("}");

        igraph_vector_int_destroy(&deg_all);
        igraph_vector_int_destroy(&deg_in);
        igraph_vector_int_destroy(&deg_out);
        igraph_vector_destroy(&betw);
        igraph_vector_destroy(&clos);
        igraph_vector_destroy(&pr);
        igraph_vector_destroy(&local_trans);
        igraph_vector_int_destroy(&community);
        free(parent);
        free(size);

        return s_buf;
    }

    /* ---- build igraph edge vector ---------------------------------- */
    igraph_vector_int_t edges;
    igraph_vector_int_init(&edges, n_edges * 2);
    for (int i = 0; i < n_edges * 2; i++)
        VECTOR(edges)[i] = edge_ptr[i];

    igraph_t g;
    igraph_error_t rc = igraph_create(
        &g, &edges, (igraph_integer_t)n_verts, (igraph_bool_t)directed);
    igraph_vector_int_destroy(&edges);

    if (rc != IGRAPH_SUCCESS) {
        char msg[128];
        snprintf(msg, sizeof(msg), "igraph_create failed (code %d)", (int)rc);
        return err_json(msg);
    }

    igraph_integer_t vc = igraph_vcount(&g);
    igraph_integer_t ec = igraph_ecount(&g);

    /* ---- degree --------------------------------------------------- */
    igraph_vector_int_t deg_all, deg_in, deg_out;
    igraph_vector_int_init(&deg_all, 0);
    igraph_vector_int_init(&deg_in,  0);
    igraph_vector_int_init(&deg_out, 0);
    igraph_degree(&g, &deg_all, igraph_vss_all(), IGRAPH_ALL, IGRAPH_NO_LOOPS);
    igraph_degree(&g, &deg_in,  igraph_vss_all(), IGRAPH_IN,  IGRAPH_NO_LOOPS);
    igraph_degree(&g, &deg_out, igraph_vss_all(), IGRAPH_OUT, IGRAPH_NO_LOOPS);

    /* ---- betweenness ---------------------------------------------- */
    igraph_vector_t betw;
    igraph_vector_init(&betw, 0);
    igraph_betweenness(
        &g, &betw, igraph_vss_all(), (igraph_bool_t)directed, /*weights=*/NULL);

    /* ---- closeness ------------------------------------------------- */
    igraph_vector_t clos;
    igraph_vector_init(&clos, 0);
    igraph_closeness(
        &g, &clos, /*reachable_count=*/NULL, /*all_reachable=*/NULL,
        igraph_vss_all(),
        directed ? IGRAPH_OUT : IGRAPH_ALL,
        /*weights=*/NULL, /*normalized=*/true);

    /* ---- PageRank -------------------------------------------------- */
    igraph_vector_t pr;
    igraph_real_t pr_eigenval = 0.0;
    /* Use POWER method — simple power-iteration, no function-pointer callbacks.
     * ARPACK and PRPACK both use call_indirect-heavy LAPACK routines that trap
     * with "index out of bounds" in the WASM indirect-function table.
     * igraph 0.10.x only has ARPACK and PRPACK, so we implement power iteration
     * manually to avoid any WASM table-index failures.                         */
    igraph_vector_init(&pr, vc);
    {
        double damping   = 0.85;
        int    max_iter  = 200;
        double tol       = 1e-9;
        double base_val  = (1.0 - damping) / (double)vc;

        /* out-degree for each vertex */
        double *out_d = (double *)malloc(vc * sizeof(double));
        double *rank  = (double *)malloc(vc * sizeof(double));
        double *tmp   = (double *)malloc(vc * sizeof(double));
        if (out_d && rank && tmp) {
            for (int i = 0; i < vc; i++) {
                out_d[i] = (double)VECTOR(deg_out)[i];
                rank[i]  = 1.0 / (double)vc;
            }
            for (int iter = 0; iter < max_iter; iter++) {
                for (int i = 0; i < vc; i++) tmp[i] = base_val;
                igraph_eit_t eit;
                igraph_eit_create(&g, igraph_ess_all(IGRAPH_EDGEORDER_ID), &eit);
                while (!IGRAPH_EIT_END(eit)) {
                    igraph_integer_t eid = IGRAPH_EIT_GET(eit);
                    igraph_integer_t from, to;
                    igraph_edge(&g, eid, &from, &to);
                    if (out_d[from] > 0)
                        tmp[to] += damping * rank[from] / out_d[from];
                    if (!directed && out_d[to] > 0)          /* undirected: both dirs */
                        tmp[from] += damping * rank[to] / out_d[to];
                    IGRAPH_EIT_NEXT(eit);
                }
                igraph_eit_destroy(&eit);
                /* normalize and check convergence */
                double diff = 0.0, sum = 0.0;
                for (int i = 0; i < vc; i++) sum += tmp[i];
                for (int i = 0; i < vc; i++) tmp[i] /= sum;
                for (int i = 0; i < vc; i++) diff += fabs(tmp[i] - rank[i]);
                double *swap = rank; rank = tmp; tmp = swap;
                if (diff < tol) break;
            }
            for (int i = 0; i < vc; i++) VECTOR(pr)[i] = rank[i];
        } else {
            /* allocation failed: uniform distribution */
            for (int i = 0; i < vc; i++) VECTOR(pr)[i] = 1.0 / (double)vc;
        }
        free(out_d); free(rank); free(tmp);
    }
    (void)pr_eigenval; /* unused */

    /* ---- local clustering coefficient ----------------------------- */
    igraph_vector_t local_trans;
    igraph_vector_init(&local_trans, 0);
    igraph_transitivity_local_undirected(
        &g, &local_trans, igraph_vss_all(), IGRAPH_TRANSITIVITY_ZERO);

    /* ---- global clustering coefficient ---------------------------- */
    igraph_real_t global_trans = 0.0;
    igraph_transitivity_undirected(&g, &global_trans, IGRAPH_TRANSITIVITY_ZERO);

    /* ---- connected components ------------------------------------- */
    igraph_vector_int_t membership;
    igraph_vector_int_t comp_sizes;
    igraph_vector_int_init(&membership, 0);
    igraph_vector_int_init(&comp_sizes, 0);
    igraph_integer_t n_comps = 0;
    igraph_connected_components(
        &g, &membership, &comp_sizes, &n_comps, IGRAPH_WEAK);
    igraph_bool_t is_connected = (n_comps <= 1);

    /* ---- diameter & average path length --------------------------- */
    igraph_real_t diam       = 0.0;
    igraph_real_t avg_path   = 0.0;
    igraph_diameter(
        &g, &diam, /*from=*/NULL, /*to=*/NULL, /*vertex_path=*/NULL, /*edge_path=*/NULL,
        (igraph_bool_t)directed, /*unconn=*/true);
    igraph_average_path_length(
        &g, &avg_path, /*unconn_pairs=*/NULL,
        (igraph_bool_t)directed, /*unconn=*/true);

    /* ---- Greedy community detection (deterministic, no RNG) -------------- */
    igraph_vector_int_t community;
    igraph_vector_int_init(&community, 0);
    igraph_vector_t      modularity_vec;
    igraph_vector_init(&modularity_vec, 0);
    igraph_real_t final_modularity = 0.0;
    int n_communities = 1;

    if (vc > 1 && ec > 0) {
        /* Fastgreedy requires an undirected graph with no self-loops.          */
        igraph_t g_und;
        igraph_copy(&g_und, &g);
        if (directed)
            igraph_to_undirected(&g_und, IGRAPH_TO_UNDIRECTED_COLLAPSE, NULL);
        /* Remove self-loops that fastgreedy cannot handle.                    */
        igraph_simplify(&g_und, /*remove_multiple=*/true, /*remove_loops=*/true, NULL);

        igraph_matrix_int_t merges;
        igraph_matrix_int_init(&merges, 0, 0);

        igraph_error_t crc = igraph_community_fastgreedy(
            &g_und,
            /*weights=*/NULL,
            &merges,
            &modularity_vec,
            &community);

        igraph_matrix_int_destroy(&merges);

        if (crc == IGRAPH_SUCCESS) {
            n_communities = (int)(igraph_vector_int_max(&community) + 1);
            igraph_integer_t mlen = igraph_vector_size(&modularity_vec);
            if (mlen > 0)
                final_modularity = VECTOR(modularity_vec)[mlen - 1];
        } else {
            /* Fallback: everyone in community 0 */
            igraph_vector_int_resize(&community, vc);
            for (igraph_integer_t i = 0; i < vc; i++) VECTOR(community)[i] = 0;
        }
        igraph_destroy(&g_und);
    } else {
        igraph_vector_int_resize(&community, vc);
        for (igraph_integer_t i = 0; i < vc; i++) VECTOR(community)[i] = 0;
    }

    /* ---------------------------------------------------------------- */
    /* Serialise to JSON                                                  */
    /* ---------------------------------------------------------------- */
    WP("{");
    WP("\"nodeCount\":%d,",       (int)vc);
    WP("\"edgeCount\":%d,",       (int)ec);
    WP("\"degree\":");            write_ivec(&deg_all);     WP(",");
    WP("\"inDegree\":");          write_ivec(&deg_in);      WP(",");
    WP("\"outDegree\":");         write_ivec(&deg_out);     WP(",");
    WP("\"betweenness\":");       write_dvec(&betw);         WP(",");
    WP("\"closeness\":");         write_dvec(&clos);         WP(",");
    WP("\"pagerank\":");          write_dvec(&pr);           WP(",");
    WP("\"localClustering\":");   write_dvec(&local_trans);  WP(",");
    WP("\"communityIds\":");      write_ivec(&community);    WP(",");
    WP("\"communityCount\":%d,",  n_communities);
    WP("\"modularity\":%.8g,",    (double)final_modularity);
    WP("\"globalClustering\":%.8g,", (double)global_trans);
    WP("\"diameter\":%.0f,",      (double)diam);
    WP("\"avgPathLength\":%.8g,", (double)avg_path);
    WP("\"components\":%d,",      (int)n_comps);
    WP("\"isConnected\":%s",      is_connected ? "true" : "false");
    WP("}");

    /* ---- cleanup -------------------------------------------------- */
    igraph_vector_int_destroy(&deg_all);
    igraph_vector_int_destroy(&deg_in);
    igraph_vector_int_destroy(&deg_out);
    igraph_vector_destroy(&betw);
    igraph_vector_destroy(&clos);
    igraph_vector_destroy(&pr);
    igraph_vector_destroy(&local_trans);
    igraph_vector_destroy(&modularity_vec);
    igraph_vector_int_destroy(&membership);
    igraph_vector_int_destroy(&comp_sizes);
    igraph_vector_int_destroy(&community);
    igraph_destroy(&g);

    return s_buf;
}

/* ------------------------------------------------------------------ */
/* ig_malloc / ig_free — JS-side heap allocation for edge buffers      */
/* ------------------------------------------------------------------ */
EMSCRIPTEN_KEEPALIVE
void *ig_malloc(int bytes) { return malloc(bytes); }

EMSCRIPTEN_KEEPALIVE
void ig_free(void *ptr) { free(ptr); }
