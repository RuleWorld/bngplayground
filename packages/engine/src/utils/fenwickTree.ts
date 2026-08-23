/**
 * Fenwick Tree (Binary Indexed Tree) for O(log N) weighted selection and updates.
 * Used in SSA/PSA reaction selection to replace O(R) cumulative-sum search.
 *
 * @invariant Must remain free of browser APIs (browser-API-free).
 */
export class FenwickTree {
  private tree: Float64Array;
  /**
   * The number of elements in the underlying array.
   */
  readonly size: number;
  private highBit: number;

  /**
   * Creates a new FenwickTree of the specified size.
   *
   * @param size - The number of entries in the tree.
   */
  constructor(size: number) {
    this.size = size;
    this.tree = new Float64Array(size + 1);
    this.highBit = 1 << (Math.floor(Math.log2(size)) + 1);
  }

  /**
   * Adds a delta value to the element at the specified 0-based index.
   * Updates all dependent ancestor nodes in O(log N) time.
   *
   * @param idx - The 0-based index of the element to modify.
   * @param delta - The value to add to the element.
   */
  add(idx: number, delta: number): void {
    let i = idx + 1;
    const tree = this.tree;
    const n = this.size;
    while (i <= n) {
      tree[i] += delta;
      i += i & -i;
    }
  }

  /**
   * Sets the element at the specified index to a new value.
   * Internally computes the difference from the current value and performs a delta update in O(log N) time.
   *
   * @param idx - The 0-based index of the element to set.
   * @param value - The new value to set.
   */
  set(idx: number, value: number): void {
    const old = this.prefixSum(idx) - (idx > 0 ? this.prefixSum(idx - 1) : 0);
    this.add(idx, value - old);
  }

  /**
   * Computes the cumulative sum of elements from index 0 up to and including the specified index.
   * Runs in O(log N) time by traversing active tree bits.
   *
   * @param idx - The 0-based end index for the prefix sum.
   * @returns The prefix sum up to the given index.
   */
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

  /**
   * Returns the total sum of all elements in the tree.
   *
   * @returns The total sum of all entries.
   */
  total(): number {
    return this.prefixSum(this.size - 1);
  }

  /**
   * Finds the smallest 0-based index such that the prefix sum of elements up to that index is strictly greater than target.
   * Uses a binary lifting search on the tree structure to run in O(log N) time.
   *
   * @param target - The target value to search for.
   * @returns The smallest 0-based index where prefixSum(index) > target, or `size` if not found.
   */
  find(target: number): number {
    const tree = this.tree;
    const n = this.size;
    let idx = 0;
    let bitMask = this.highBit;
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
   * Builds the tree structure in-place from initial values in O(N) time.
   *
   * @param values - An array or Float64Array of initial values.
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
