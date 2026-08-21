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

export const requiresCompartmentResolution = (model: BNGLModel): boolean => {
  return !!(model.compartments && model.compartments.length > 0);
};

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
