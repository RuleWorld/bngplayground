import type { BNGLCompartment, BNGLModel } from '../../types';

const normalizeSize = (size: number | undefined): number => {
  if (typeof size !== 'number' || Number.isNaN(size) || !Number.isFinite(size) || size <= 0) {
    return 1.0;
  }
  return size;
};

const buildChildrenMap = (compartments: BNGLCompartment[]): Map<string, string[]> => {
  const children = new Map<string, string[]>();
  for (const comp of compartments) {
    if (!comp.parent) continue;
    const list = children.get(comp.parent) ?? [];
    list.push(comp.name);
    children.set(comp.parent, list);
  }
  return children;
};

const computeResolvedVolumes = (compartments: BNGLCompartment[]): Map<string, number> => {
  const byName = new Map(compartments.map((c) => [c.name, c] as const));
  const children = buildChildrenMap(compartments);
  const resolved = new Map<string, number>();

  const visit = (name: string, stack: Set<string>): number => {
    if (resolved.has(name)) return resolved.get(name)!;
    if (stack.has(name)) {
      console.warn(`[CompartmentResolver] Cycle detected in compartments: ${[...stack, name].join(' -> ')}`);
      return 1.0;
    }

    const comp = byName.get(name);
    if (!comp) return 1.0;

    const base = normalizeSize(comp.size);
    const nextStack = new Set(stack);
    nextStack.add(name);

    let childrenSum = 0;
    for (const childName of children.get(name) ?? []) {
      const child = byName.get(childName);
      if (!child) continue;
      const childResolved = visit(childName, nextStack);
      if (child.dimension === comp.dimension) {
        childrenSum += childResolved;
      }
    }

    const total = base + childrenSum;
    resolved.set(name, total);
    return total;
  };

  for (const comp of compartments) {
    visit(comp.name, new Set());
  }

  return resolved;
};

/**
 * Determines whether a BioNetGen model defines one or more compartments that require volume resolution.
 *
 * @param model - The parsed BNGL model object to inspect.
 * @returns `true` if the model contains at least one defined compartment entry; `false` otherwise.
 *
 * @invariant Must remain free of browser APIs (browser-API-free) as a core engine package utility.
 */
export const requiresCompartmentResolution = (model: BNGLModel): boolean => {
  return !!(model.compartments && model.compartments.length > 0);
};

/**
 * Asynchronously resolves hierarchical 3D/2D compartment volumes for a BNGL model.
 *
 * In BioNetGen, nested compartments form a hierarchy where parent volumes can enclose child
 * compartments of the same spatial dimension. This function performs a depth-first search (DFS)
 * over the compartment tree to compute the cumulative `resolvedVolume` for each compartment
 * by adding the resolved volumes of all direct child compartments matching the parent's dimension
 * to its own normalized base `size` (defaulting non-positive/missing sizes to 1.0).
 *
 * It guards against circular parent-child relationships by detecting cycles during graph traversal
 * and issuing a warning while defaulting cyclic entries to volume 1.0.
 *
 * Each compartment in the returned model is updated with:
 * - `size`: The normalized base volume.
 * - `resolvedVolume`: The cumulative resolved volume (base size + sum of same-dimension children resolved volumes).
 * - `scalingFactor`: The ratio `resolvedVolume / base` (or 1.0 if base size <= 0).
 *
 * @param model - The BNGL model containing compartment definitions to resolve.
 * @returns A Promise resolving to a copy of the BNGL model with updated compartment properties, or the original model if no compartments exist.
 *
 * @invariant Must remain free of browser APIs (browser-API-free) as a core engine package utility.
 */
export const resolveCompartmentVolumes = async (model: BNGLModel): Promise<BNGLModel> => {
  if (!model.compartments || model.compartments.length === 0) return model;

  const resolvedMap = computeResolvedVolumes(model.compartments);

  const compartments = model.compartments.map((comp) => {
    const resolvedVolume = resolvedMap.get(comp.name) ?? normalizeSize(comp.size);
    const base = normalizeSize(comp.size);
    const scalingFactor = base > 0 ? resolvedVolume / base : 1.0;

    return {
      ...comp,
      size: base,
      resolvedVolume,
      scalingFactor
    };
  });

  return {
    ...model,
    compartments
  };
};
