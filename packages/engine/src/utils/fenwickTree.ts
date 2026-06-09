/**
 * Fenwick Tree (Binary Indexed Tree) for O(log N) weighted selection and updates.
 * Used in SSA/PSA reaction selection to replace O(R) cumulative-sum search.
 */
export class FenwickTree {
  private tree: Float64Array;
  readonly size: number;

  constructor(size: number) {
    this.size = size;
    this.tree = new Float64Array(size + 1);
  }

  add(idx: number, delta: number): void {
    let i = idx + 1;
    const tree = this.tree;
    const n = this.size;
    while (i <= n) {
      tree[i] += delta;
      i += i & -i;
    }
  }

  set(idx: number, value: number): void {
    const old = this.prefixSum(idx) - (idx > 0 ? this.prefixSum(idx - 1) : 0);
    this.add(idx, value - old);
  }

  prefixSum(idx: number): number {
    let i = idx + 1;
    const tree = this.tree;
    let sum = 0;
    while (i > 0) {
      sum += tree[i];
      i -= i & -i;
    }
    return sum;
  }

  total(): number {
    return this.prefixSum(this.size - 1);
  }

  /**
   * Find smallest index such that prefixSum(index) > target.
   * If target >= total, returns size (meaning "not found").
   */
  find(target: number): number {
    const tree = this.tree;
    const n = this.size;
    let idx = 0;
    let bitMask = 1 << (Math.floor(Math.log2(n)) + 1);
    while (bitMask !== 0) {
      const next = idx + bitMask;
      if (next <= n && tree[next] <= target) {
        target -= tree[next];
        idx = next;
      }
      bitMask >>= 1;
    }
    return idx; // 0-based index
  }

  /**
   * Build tree from initial values in O(n) time.
   */
  build(values: Float64Array | number[]): void {
    const n = this.size;
    const tree = this.tree;
    for (let i = 1; i <= n; i++) {
      tree[i] = values[i - 1];
    }
    for (let i = 1; i <= n; i++) {
      const j = i + (i & -i);
      if (j <= n) {
        tree[j] += tree[i];
      }
    }
  }
}
