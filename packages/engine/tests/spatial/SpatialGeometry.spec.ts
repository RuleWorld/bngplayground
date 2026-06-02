import { describe, it, expect } from 'vitest';
import { autoGenerateGeometry, generateIcosphere } from '../../src/services/spatial/SpatialGeometry';
import type { ParsedCompartment } from '../../src/services/spatial/SpatialGeometry';

describe('SpatialGeometry', () => {
  describe('autoGenerateGeometry', () => {
    it('creates a default box when no compartments are provided', () => {
      const geom = autoGenerateGeometry([]);
      expect(geom).toHaveLength(1);
      expect(geom[0].name).toBe('default');
      expect(geom[0].shape).toBe('box');
      expect(geom[0].dimension).toBe(3);
    });

    it('generates a 3D sphere from a single 3D compartment', () => {
      const volume = (4 / 3) * Math.PI * Math.pow(2, 3); // r = 2
      const comp: ParsedCompartment = { name: 'Cell', dimension: 3, size: volume };
      const geom = autoGenerateGeometry([comp]);

      expect(geom).toHaveLength(1);
      expect(geom[0].name).toBe('Cell');
      expect(geom[0].shape).toBe('sphere');
      expect(geom[0].dimension).toBe(3);
      expect(geom[0].radius).toBeCloseTo(2);
    });

    it('generates a 2D sphere from a single 2D compartment', () => {
      const area = 4 * Math.PI * Math.pow(3, 2); // r = 3
      const comp: ParsedCompartment = { name: 'PM', dimension: 2, size: area };
      const geom = autoGenerateGeometry([comp]);

      expect(geom).toHaveLength(1);
      expect(geom[0].name).toBe('PM');
      expect(geom[0].shape).toBe('sphere');
      expect(geom[0].dimension).toBe(2);
      expect(geom[0].radius).toBeCloseTo(3);
    });

    it('handles nested compartments (3D inside 2D inside 3D)', () => {
      const volEC = (4 / 3) * Math.PI * Math.pow(10, 3);
      const areaPM = 4 * Math.PI * Math.pow(5, 2); // nested in EC, but has its own surface area logic in BNG
      const volCP = (4 / 3) * Math.PI * Math.pow(4, 3);

      const comps: ParsedCompartment[] = [
        { name: 'EC', dimension: 3, size: volEC },
        { name: 'PM', dimension: 2, size: areaPM, parent: 'EC' },
        { name: 'CP', dimension: 3, size: volCP, parent: 'PM' },
      ];

      const geom = autoGenerateGeometry(comps);
      expect(geom).toHaveLength(3);

      // EC
      const ec = geom.find(g => g.name === 'EC')!;
      expect(ec.radius).toBeCloseTo(10);
      expect(ec.parentId).toBeNull();

      // PM (child of EC)
      const pm = geom.find(g => g.name === 'PM')!;
      expect(pm.radius).toBeCloseTo(10); // inherits radius from 3D parent EC
      expect(pm.parentId).toBe(ec.compartmentId);

      // CP (child of PM)
      const cp = geom.find(g => g.name === 'CP')!;
      expect(cp.radius).toBeCloseTo(4);
      expect(cp.parentId).toBe(pm.compartmentId);
    });

    it('handles nested 3D inside 3D directly', () => {
      const volEC = (4 / 3) * Math.PI * Math.pow(10, 3);
      const volCP = (4 / 3) * Math.PI * Math.pow(4, 3);

      const comps: ParsedCompartment[] = [
        { name: 'EC', dimension: 3, size: volEC },
        { name: 'CP', dimension: 3, size: volCP, parent: 'EC' },
      ];

      const geom = autoGenerateGeometry(comps);
      expect(geom).toHaveLength(2);

      const ec = geom.find(g => g.name === 'EC')!;
      const cp = geom.find(g => g.name === 'CP')!;

      expect(cp.parentId).toBe(ec.compartmentId);
      expect(cp.radius).toBeCloseTo(4);
    });

    it('handles circular parent references gracefully by making first compartment root', () => {
       const comps: ParsedCompartment[] = [
        { name: 'A', dimension: 3, size: 10, parent: 'B' },
        { name: 'B', dimension: 3, size: 20, parent: 'A' },
      ];

      const geom = autoGenerateGeometry(comps);
      expect(geom).toHaveLength(2);
      expect(geom[0].parentId).toBeNull(); // A becomes root
    });
  });

  describe('generateIcosphere', () => {
    it('generates an icosahedron when subdivisions is 0', () => {
      const { vertices, faces } = generateIcosphere([0, 0, 0], 1, 0);
      expect(vertices.length).toBe(12 * 3); // 12 vertices
      expect(faces.length).toBe(20 * 3);    // 20 faces
    });

    it('generates a subdivided sphere when subdivisions is 1', () => {
      const { vertices, faces } = generateIcosphere([0, 0, 0], 1, 1);
      // V = V_prev + E_prev = 12 + 30 = 42
      // F = 4 * F_prev = 4 * 20 = 80
      expect(vertices.length).toBe(42 * 3);
      expect(faces.length).toBe(80 * 3);
    });

    it('generates a subdivided sphere when subdivisions is 2', () => {
      const { vertices, faces } = generateIcosphere([0, 0, 0], 1, 2);
      expect(vertices.length).toBe(162 * 3);
      expect(faces.length).toBe(320 * 3);
    });

    it('applies center offset and radius scaling', () => {
      const { vertices } = generateIcosphere([10, 20, 30], 2, 0);

      // All points should be distance 2 from (10, 20, 30)
      for (let i = 0; i < vertices.length; i += 3) {
        const dx = vertices[i] - 10;
        const dy = vertices[i + 1] - 20;
        const dz = vertices[i + 2] - 30;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        expect(dist).toBeCloseTo(2);
      }
    });
  });
});
