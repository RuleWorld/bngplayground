/**
 * SpatialGeometry.ts — Auto-generate compartment geometry from BNGL definitions.
 *
 * The simplest path: users write standard BNGL compartments with volumes,
 * and we auto-generate nested sphere/box geometry for spatial simulation.
 */

import type { CompartmentGeometry } from './SpatialConfig';

/** Parsed compartment from BNGL (mirrors BNG Playground's parser output) */
export interface ParsedCompartment {
  name: string;
  dimension: 2 | 3;
  /** Volume in µm³ (3D) or area in µm² (2D) */
  size: number;
  parent?: string;
}

/**
 * Generate nested sphere geometry from BNGL compartment definitions.
 * Outermost compartment centered at origin. Children nested concentrically.
 *
 * Algorithm:
 * 1. Build hierarchy tree from parent-child relationships
 * 2. Compute sphere radius from volume: r = (3V / (4π))^(1/3)
 * 3. Place children concentrically within parents
 * 4. 2D compartments use the surface of the enclosing 3D sphere
 */
export function autoGenerateGeometry(
  compartments: ParsedCompartment[]
): CompartmentGeometry[] {
  if (compartments.length === 0) {
    // No compartments — create a single default box
    return [createDefaultBox()];
  }

  // Build name-to-index and parent-child maps
  const nameToIndex = new Map<string, number>();
  compartments.forEach((c, i) => nameToIndex.set(c.name, i));

  // Find root compartments (no parent)
  const roots = compartments.filter(c => !c.parent);
  if (roots.length === 0) {
    // Circular hierarchy — treat first compartment as root
    roots.push(compartments[0]);
  }

  const result: CompartmentGeometry[] = [];
  let nextId = 0;

  // Recursive function to place compartments
  function placeCompartment(
    comp: ParsedCompartment,
    parentCenter: [number, number, number],
    _parentRadius: number,
    parentId: number | null
  ): void {
    const id = nextId++;

    if (comp.dimension === 3) {
      // Volume compartment → sphere
      const radius = volumeToRadius(comp.size);

      result.push({
        compartmentId: id,
        name: comp.name,
        dimension: 3,
        volume: comp.size,
        parentId,
        shape: 'sphere',
        center: [...parentCenter],
        radius,
      });

      // Find 2D children (surface compartments) and 3D children
      const children = compartments.filter(c => c.parent === comp.name);
      for (const child of children) {
        if (child.dimension === 2) {
          // Surface compartment — uses the sphere surface of the current volume
          const surfId = nextId++;
          result.push({
            compartmentId: surfId,
            name: child.name,
            dimension: 2,
            volume: child.size,
            parentId: id,
            shape: 'sphere',
            center: [...parentCenter],
            radius,
          });

          // Find 3D children nested inside this surface
          const innerChildren = compartments.filter(c => c.parent === child.name);
          for (const inner of innerChildren) {
            placeCompartment(inner, parentCenter, radius, surfId);
          }
        } else {
          // 3D child nested inside current
          placeCompartment(child, parentCenter, radius, id);
        }
      }
    } else {
      // 2D compartment without a 3D parent — generate a thin disk (unusual)
      const radius = areaToRadius(comp.size);
      result.push({
        compartmentId: id,
        name: comp.name,
        dimension: 2,
        volume: comp.size,
        parentId,
        shape: 'sphere',
        center: [...parentCenter],
        radius,
      });
    }
  }

  // Place each root
  for (const root of roots) {
    placeCompartment(root, [0, 0, 0], Infinity, null);
  }

  return result;
}

/**
 * Compute sphere radius from volume.
 * V = (4/3)πr³ → r = (3V / (4π))^(1/3)
 */
function volumeToRadius(volumeUm3: number): number {
  return Math.pow((3 * volumeUm3) / (4 * Math.PI), 1 / 3);
}

/**
 * Compute equivalent radius from surface area.
 * A = 4πr² → r = √(A / (4π))
 */
function areaToRadius(areaUm2: number): number {
  return Math.sqrt(areaUm2 / (4 * Math.PI));
}

/** Create a default simulation box when no compartments are defined */
function createDefaultBox(): CompartmentGeometry {
  const halfExtent = 5; // 5 µm → 10x10x10 µm box = 1000 µm³
  return {
    compartmentId: 0,
    name: 'default',
    dimension: 3,
    volume: (2 * halfExtent) ** 3,
    parentId: null,
    shape: 'box',
    center: [0, 0, 0],
    halfExtents: [halfExtent, halfExtent, halfExtent],
  };
}

/**
 * Generate icosphere vertices and faces for high-quality sphere meshes.
 * Used when the spatial engine needs triangulated geometry.
 *
 * @param center Center point
 * @param radius Sphere radius
 * @param subdivisions Number of subdivision iterations (0 = icosahedron, 1 = 42 verts, 2 = 162 verts)
 */
export function generateIcosphere(
  center: [number, number, number],
  radius: number,
  subdivisions: number = 2
): { vertices: Float32Array; faces: Uint32Array } {
  // Start with icosahedron
  const t = (1 + Math.sqrt(5)) / 2;

  let vertices: number[][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];

  let faces: number[][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  // Normalize vertices to unit sphere
  vertices = vertices.map(v => {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [v[0] / len, v[1] / len, v[2] / len];
  });

  // Subdivide
  for (let s = 0; s < subdivisions; s++) {
    const midpointCache = new Map<string, number>();
    const newFaces: number[][] = [];

    function getMidpoint(a: number, b: number): number {
      const key = Math.min(a, b) + '-' + Math.max(a, b);
      if (midpointCache.has(key)) return midpointCache.get(key)!;

      const va = vertices[a];
      const vb = vertices[b];
      const mid = [(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2];
      const len = Math.sqrt(mid[0] ** 2 + mid[1] ** 2 + mid[2] ** 2);
      mid[0] /= len; mid[1] /= len; mid[2] /= len;

      const idx = vertices.length;
      vertices.push(mid);
      midpointCache.set(key, idx);
      return idx;
    }

    for (const face of faces) {
      const a = getMidpoint(face[0], face[1]);
      const b = getMidpoint(face[1], face[2]);
      const c = getMidpoint(face[2], face[0]);
      newFaces.push(
        [face[0], a, c],
        [face[1], b, a],
        [face[2], c, b],
        [a, b, c]
      );
    }
    faces = newFaces;
  }

  // Scale and translate
  const verts = new Float32Array(vertices.length * 3);
  for (let i = 0; i < vertices.length; i++) {
    verts[i * 3] = vertices[i][0] * radius + center[0];
    verts[i * 3 + 1] = vertices[i][1] * radius + center[1];
    verts[i * 3 + 2] = vertices[i][2] * radius + center[2];
  }

  const faceArr = new Uint32Array(faces.length * 3);
  for (let i = 0; i < faces.length; i++) {
    faceArr[i * 3] = faces[i][0];
    faceArr[i * 3 + 1] = faces[i][1];
    faceArr[i * 3 + 2] = faces[i][2];
  }

  return { vertices: verts, faces: faceArr };
}
