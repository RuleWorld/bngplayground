import { describe, it, expect } from 'vitest';
import { McellBinaryReader, McellBinaryError, readMcellBinaryFrame, readMcellBinaryTrajectory } from '../../src/services/spatial/BinaryFormatReader';

describe('BinaryFormatReader', () => {
  describe('McellBinaryReader', () => {
    it('throws on too short file', () => {
      const buffer = new ArrayBuffer(2);
      expect(() => new McellBinaryReader(buffer)).toThrow(McellBinaryError);
    });

    it('throws on invalid magic', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      view.setUint32(0, 3, true); // magic 3
      const reader = new McellBinaryReader(buffer);
      expect(() => reader.read()).toThrow(/invalid magic/);
    });

    it('reads V2 format correctly', () => {
      const name = 'MolA';
      const nameEncoder = new TextEncoder();
      const nameBytes = nameEncoder.encode(name);

      const buffer = new ArrayBuffer(4 + 4 + nameBytes.length + 1 + 4 + 4 + 12);
      const view = new DataView(buffer);
      let offset = 0;

      view.setUint32(offset, 2, true); offset += 4;
      view.setUint32(offset, nameBytes.length, true); offset += 4;
      for (let i = 0; i < nameBytes.length; i++) {
        view.setUint8(offset++, nameBytes[i]);
      }
      view.setUint8(offset, 0); offset += 1; // volume
      view.setUint32(offset, 1, true); offset += 4; // num_mols
      view.setUint32(offset, 42, true); offset += 4; // id
      view.setFloat32(offset, 1.0, true); offset += 4;
      view.setFloat32(offset, 2.0, true); offset += 4;
      view.setFloat32(offset, 3.0, true); offset += 4;

      const reader = new McellBinaryReader(buffer);
      const frame = reader.read();

      expect(frame.version).toBe('v2');
      expect(frame.species).toHaveLength(1);
      expect(frame.species[0].name).toBe('MolA');
      expect(frame.species[0].speciesType).toBe('volume');
      expect(frame.species[0].numMolecules).toBe(1);
      expect(frame.species[0].ids[0]).toBe(42);
      expect(frame.species[0].positionsMeters[0]).toBeCloseTo(1e-6);
      expect(frame.species[0].positionsMeters[1]).toBeCloseTo(2e-6);
      expect(frame.species[0].positionsMeters[2]).toBeCloseTo(3e-6);
      expect(frame.species[0].normals).toBeNull();
    });

    it('reads V1 format correctly', () => {
      const name = 'MolB';
      const nameBytes = new TextEncoder().encode(name);

      const buffer = new ArrayBuffer(4 + 1 + nameBytes.length + 1 + 4 + 12 + 12);
      const view = new DataView(buffer);
      let offset = 0;

      view.setUint32(offset, 1, true); offset += 4; // magic
      view.setUint8(offset, nameBytes.length); offset += 1;
      for (let i = 0; i < nameBytes.length; i++) {
        view.setUint8(offset++, nameBytes[i]);
      }
      view.setUint8(offset, 1); offset += 1; // surface
      view.setUint32(offset, 3, true); offset += 4; // num_float_positions (3 * 1)
      view.setFloat32(offset, 4.0, true); offset += 4;
      view.setFloat32(offset, 5.0, true); offset += 4;
      view.setFloat32(offset, 6.0, true); offset += 4;
      view.setFloat32(offset, 0.0, true); offset += 4;
      view.setFloat32(offset, 1.0, true); offset += 4;
      view.setFloat32(offset, 0.0, true); offset += 4;

      const reader = new McellBinaryReader(buffer);
      const frame = reader.read();

      expect(frame.version).toBe('v1');
      expect(frame.species).toHaveLength(1);
      expect(frame.species[0].name).toBe('MolB');
      expect(frame.species[0].speciesType).toBe('surface');
      expect(frame.species[0].numMolecules).toBe(1);
      expect(frame.species[0].ids[0]).toBe(0); // V1 uses synthetic IDs 0..N-1
      expect(frame.species[0].positionsMeters[0]).toBeCloseTo(4e-6);
      expect(frame.species[0].normals).not.toBeNull();
      if (frame.species[0].normals) {
        expect(frame.species[0].normals[1]).toBe(1.0);
      }
    });

    it('throws on invalid species_type', () => {
      const nameBytes = new TextEncoder().encode('A');
      const buffer = new ArrayBuffer(4 + 4 + nameBytes.length + 1 + 4 + 4 + 12);
      const view = new DataView(buffer);
      let offset = 0;

      view.setUint32(offset, 2, true); offset += 4;
      view.setUint32(offset, nameBytes.length, true); offset += 4;
      view.setUint8(offset, nameBytes[0]); offset += 1;
      view.setUint8(offset, 2); offset += 1; // invalid species type

      const reader = new McellBinaryReader(buffer);
      expect(() => reader.read()).toThrow(/invalid species_type 2/);
    });

    it('throws on implausible num_mols', () => {
      const nameBytes = new TextEncoder().encode('A');
      const buffer = new ArrayBuffer(4 + 4 + nameBytes.length + 1 + 4);
      const view = new DataView(buffer);
      let offset = 0;

      view.setUint32(offset, 2, true); offset += 4;
      view.setUint32(offset, nameBytes.length, true); offset += 4;
      view.setUint8(offset, nameBytes[0]); offset += 1;
      view.setUint8(offset, 0); offset += 1;
      view.setUint32(offset, 100_000_001, true); offset += 4; // implausible

      const reader = new McellBinaryReader(buffer);
      expect(() => reader.read()).toThrow(/implausible num_mols 100000001/);
    });

    it('throws on unexpected EOF reading IDs', () => {
      const nameBytes = new TextEncoder().encode('A');
      const buffer = new ArrayBuffer(4 + 4 + nameBytes.length + 1 + 4);
      const view = new DataView(buffer);
      let offset = 0;

      view.setUint32(offset, 2, true); offset += 4;
      view.setUint32(offset, nameBytes.length, true); offset += 4;
      view.setUint8(offset, nameBytes[0]); offset += 1;
      view.setUint8(offset, 0); offset += 1;
      view.setUint32(offset, 1, true); offset += 4; // expect 1 id, but EOF

      const reader = new McellBinaryReader(buffer);
      expect(() => reader.read()).toThrow(/unexpected EOF reading IDs block/);
    });

    it('throws on unexpected EOF reading positions', () => {
      const nameBytes = new TextEncoder().encode('A');
      const buffer = new ArrayBuffer(4 + 4 + nameBytes.length + 1 + 4 + 4);
      const view = new DataView(buffer);
      let offset = 0;

      view.setUint32(offset, 2, true); offset += 4;
      view.setUint32(offset, nameBytes.length, true); offset += 4;
      view.setUint8(offset, nameBytes[0]); offset += 1;
      view.setUint8(offset, 0); offset += 1;
      view.setUint32(offset, 1, true); offset += 4; // expect 1 id
      view.setUint32(offset, 42, true); offset += 4; // id 42, but no positions

      const reader = new McellBinaryReader(buffer);
      expect(() => reader.read()).toThrow(/unexpected EOF reading positions block/);
    });

    it('throws on unexpected EOF reading normals', () => {
      const nameBytes = new TextEncoder().encode('A');
      const buffer = new ArrayBuffer(4 + 4 + nameBytes.length + 1 + 4 + 4 + 12);
      const view = new DataView(buffer);
      let offset = 0;

      view.setUint32(offset, 2, true); offset += 4;
      view.setUint32(offset, nameBytes.length, true); offset += 4;
      view.setUint8(offset, nameBytes[0]); offset += 1;
      view.setUint8(offset, 1); offset += 1; // surface, expect normals
      view.setUint32(offset, 1, true); offset += 4;
      view.setUint32(offset, 42, true); offset += 4;
      view.setFloat32(offset, 1.0, true); offset += 4;
      view.setFloat32(offset, 2.0, true); offset += 4;
      view.setFloat32(offset, 3.0, true); offset += 4;
      // EOF before normals

      const reader = new McellBinaryReader(buffer);
      expect(() => reader.read()).toThrow(/unexpected EOF reading normals block/);
    });

    it('throws on unexpected EOF after species name', () => {
      const buffer = new ArrayBuffer(4 + 4 + 1);
      const view = new DataView(buffer);
      let offset = 0;
      view.setUint32(offset, 2, true); offset += 4;
      view.setUint32(offset, 1, true); offset += 4;
      view.setUint8(offset, 65); // 'A', then EOF
      const reader = new McellBinaryReader(buffer);
      expect(() => reader.read()).toThrow(/unexpected EOF after species name/);
    });

    it('throws on suspicious species name length', () => {
      const buffer = new ArrayBuffer(4 + 4);
      const view = new DataView(buffer);
      let offset = 0;
      view.setUint32(offset, 2, true); offset += 4;
      view.setUint32(offset, 1025, true); offset += 4;
      const reader = new McellBinaryReader(buffer);
      expect(() => reader.read()).toThrow(/suspicious species name length: 1025/);
    });
  });

  describe('readMcellBinaryFrame', () => {
    it('works with ArrayBuffer', async () => {
      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setUint32(0, 2, true);
      const frame = await readMcellBinaryFrame(buffer);
      expect(frame.version).toBe('v2');
    });

    if (typeof File !== 'undefined') {
      it('works with File and infers iteration', async () => {
        const buffer = new ArrayBuffer(4);
        new DataView(buffer).setUint32(0, 2, true);
        const file = new File([buffer], 'Scene.cellbin.123.bin');
        const frame = await readMcellBinaryFrame(file);
        expect(frame.iteration).toBe(123);
      });
    }
  });

  describe('readMcellBinaryTrajectory', () => {
    it('sorts frames by iteration and resolves time', async () => {
      if (typeof File === 'undefined') return;
      const createBuffer = () => {
        const buf = new ArrayBuffer(4);
        new DataView(buf).setUint32(0, 2, true);
        return buf;
      };

      const file1 = new File([createBuffer()], 'Scene.10.bin');
      const file2 = new File([createBuffer()], 'Scene.2.bin');

      const traj = await readMcellBinaryTrajectory([file1, file2], { timeStepSec: 0.1 });

      expect(traj.frames).toHaveLength(2);
      expect(traj.frames[0].iteration).toBe(2);
      expect(traj.frames[0].time).toBeCloseTo(0.2);
      expect(traj.frames[1].iteration).toBe(10);
      expect(traj.frames[1].time).toBeCloseTo(1.0);
    });

    it('drops unparseable files when requested', async () => {
      if (typeof File === 'undefined') return;
      const validBuf = new ArrayBuffer(4);
      new DataView(validBuf).setUint32(0, 2, true);
      const invalidBuf = new ArrayBuffer(2); // too short

      const file1 = new File([validBuf], 'Scene.1.bin');
      const file2 = new File([invalidBuf], 'Scene.2.bin');

      const traj = await readMcellBinaryTrajectory([file1, file2], { dropUnparseable: true });
      expect(traj.frames).toHaveLength(1);
      expect(traj.warnings).toHaveLength(1);
    });

    it('throws on unparseable files when dropUnparseable is false', async () => {
      const invalidBuf = new ArrayBuffer(2); // too short
      const file = new File([invalidBuf], 'Scene.1.bin');

      await expect(readMcellBinaryTrajectory([file])).rejects.toThrow(McellBinaryError);
    });
  });
});

  describe('inferIterationFromFilename', () => {
    // Tests for uncovered lines 254-258
    it('infers iteration from standard MCell4 filenames', async () => {
      // Need a way to expose inferIterationFromFilename, but it's private.
      // We can just create files and pass them to readMcellBinaryFrame
      if (typeof File === 'undefined') return;
      const createBuffer = () => {
        const buf = new ArrayBuffer(4);
        new DataView(buf).setUint32(0, 2, true);
        return buf;
      };

      const file1 = new File([createBuffer()], 'Scene.cellbin.0000001.bin');
      const frame1 = await readMcellBinaryFrame(file1);
      expect(frame1.iteration).toBe(1);

      const file2 = new File([createBuffer()], 'Scene.cellbin.100.bin');
      const frame2 = await readMcellBinaryFrame(file2);
      expect(frame2.iteration).toBe(100);

      const file3 = new File([createBuffer()], 'Scene.cellbin.xyz.bin');
      const frame3 = await readMcellBinaryFrame(file3);
      expect(frame3.iteration).toBeNull();
    });
  });


  describe('readMcellBinaryTrajectory edge cases', () => {
    it('handles warnings without File (Blob)', async () => {
      const invalidBlob = new Blob([new ArrayBuffer(2)]);

      const traj = await readMcellBinaryTrajectory([invalidBlob], { dropUnparseable: true });
      expect(traj.warnings).toHaveLength(1);
      expect(traj.warnings[0]).toContain('blob: McellBinaryError:');
    });

    it('collects species names across frames', async () => {
      const name1Bytes = new TextEncoder().encode('SpeciesX');
      const buf1 = new ArrayBuffer(4 + 4 + name1Bytes.length + 1 + 4 + 4 + 12);
      let view = new DataView(buf1);
      let offset = 0;
      view.setUint32(offset, 2, true); offset += 4;
      view.setUint32(offset, name1Bytes.length, true); offset += 4;
      for (let i=0; i<name1Bytes.length; i++) view.setUint8(offset++, name1Bytes[i]);
      view.setUint8(offset, 0); offset += 1;
      view.setUint32(offset, 1, true); offset += 4;
      view.setUint32(offset, 1, true); offset += 4;
      offset += 12;

      const name2Bytes = new TextEncoder().encode('SpeciesA');
      const buf2 = new ArrayBuffer(4 + 4 + name2Bytes.length + 1 + 4 + 4 + 12);
      view = new DataView(buf2);
      offset = 0;
      view.setUint32(offset, 2, true); offset += 4;
      view.setUint32(offset, name2Bytes.length, true); offset += 4;
      for (let i=0; i<name2Bytes.length; i++) view.setUint8(offset++, name2Bytes[i]);
      view.setUint8(offset, 0); offset += 1;
      view.setUint32(offset, 1, true); offset += 4;
      view.setUint32(offset, 2, true); offset += 4;
      offset += 12;

      const file1 = new File([buf1], 'Scene.1.bin');
      const file2 = new File([buf2], 'Scene.2.bin');

      const traj = await readMcellBinaryTrajectory([file1, file2]);
      expect(traj.speciesNames).toEqual(['SpeciesA', 'SpeciesX']);
    });
  });


  describe('timeStepSec behavior', () => {

    it('handles dt when frame time is already set', async () => {
      // Need a custom class or blob that acts like File but sets time?
      // Wait, time is set to null in readMcellBinaryFrame initially, unless it comes from inferIterationFromFilename, which returns time: null!
      // So time is always null right now.
      // Line 230: frames.sort((a, b) => (a.iteration ?? 0) - (b.iteration ?? 0));
      // To test the branch where dt is provided but frame.iteration is null:
      const nameBytes = new TextEncoder().encode('A');
      const buf = new ArrayBuffer(4 + 4 + nameBytes.length + 1 + 4 + 4 + 12);
      let offset = 0;
      const view = new DataView(buf);
      view.setUint32(offset, 2, true); offset += 4;
      view.setUint32(offset, nameBytes.length, true); offset += 4;
      view.setUint8(offset, nameBytes[0]); offset += 1;
      view.setUint8(offset, 0); offset += 1;
      view.setUint32(offset, 1, true); offset += 4;
      view.setUint32(offset, 42, true); offset += 4;
      offset += 12;

      // Unparseable iteration -> frame.iteration = null
      if (typeof File === 'undefined') return;
      const file = new File([buf], 'Scene.xyz.bin');
      const traj = await readMcellBinaryTrajectory([file], { timeStepSec: 0.1 });
      expect(traj.frames[0].time).toBeNull();
    });
});

    it('sorts correctly with null iterations', async () => {
      // Need two frames with iteration=null to hit both sides of ?? 0
      const createBuffer = () => {
        const buf = new ArrayBuffer(4);
        new DataView(buf).setUint32(0, 2, true);
        return buf;
      };
      if (typeof File === 'undefined') return;

      const file1 = new File([createBuffer()], 'Scene.xyz.bin');
      const file2 = new File([createBuffer()], 'Scene.abc.bin');
      const traj = await readMcellBinaryTrajectory([file1, file2]);

      expect(traj.frames).toHaveLength(2);
      expect(traj.frames[0].iteration).toBeNull();
      expect(traj.frames[1].iteration).toBeNull();
    });
