/**
 * SpatialViewer.tsx — Three.js 3D visualization of spatial simulation.
 *
 * Renders molecules as instanced spheres, compartment boundaries as wireframe
 * geometry, and provides orbit controls for camera interaction.
 *
 * Uses Transferable ArrayBuffers from the spatial worker for zero-copy updates.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SpatialSnapshot, CompartmentGeometry } from '@bngplayground/engine';

/** Color palette for species visualization (colorblind-friendly Okabe-Ito) */
const SPECIES_COLORS = [
  0xE69F00, // orange
  0x56B4E9, // sky blue
  0x009E73, // teal
  0xF0E442, // yellow
  0x0072B2, // blue
  0xD55E00, // vermillion
  0xCC79A7, // reddish purple
  0x000000, // black
];

interface SpatialViewerProps {
  /** Latest snapshot from the spatial simulation */
  snapshot: SpatialSnapshot | null;
  /** Compartment geometries for boundary rendering */
  geometries: CompartmentGeometry[];
  /** Map from species ID to name (for legend) */
  speciesNames: Map<number, string>;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Whether the simulation is running (enables auto-update) */
  isRunning: boolean;
}

export const SpatialViewer: React.FC<SpatialViewerProps> = ({
  snapshot,
  geometries,
  speciesNames,
  width,
  height,
  isRunning,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameRef = useRef<number>(0);

  // Instanced meshes for molecules (one per species)
  const instancedMeshesRef = useRef<Map<number, THREE.InstancedMesh>>(new Map());
  // Compartment boundary meshes
  const boundaryMeshesRef = useRef<THREE.Mesh[]>([]);

  const [moleculeCount, setMoleculeCount] = useState(0);
  const [simTime, setSimTime] = useState(0);
  const [rendererError, setRendererError] = useState<string | null>(null);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Some browser/CI environments have WebGL disabled or unavailable.
    // Fail gracefully so the Spatial tab does not repeatedly throw.
    if (typeof window !== 'undefined') {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      if (!gl) {
        setRendererError('WebGL is unavailable in this browser/environment. Spatial rendering is disabled.');
        return;
      }
    }

    // Renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      setRendererError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRendererError(`Unable to initialize WebGL renderer: ${message}`);
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2));
    renderer.setClearColor(0x0a0a1a, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a1a, 0.03);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(15, 15, 15);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 1.2;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(10, 20, 15);
    dirLight.castShadow = false;
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    rimLight.position.set(-10, -5, -10);
    scene.add(rimLight);

    // Grid helper
    const gridHelper = new THREE.GridHelper(20, 20, 0x222244, 0x111133);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    // Axes helper (subtle)
    const axesHelper = new THREE.AxesHelper(2);
    axesHelper.position.set(-10, 0, -10);
    scene.add(axesHelper);

    // Animation loop
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update renderer size
  useEffect(() => {
    if (rendererRef.current && cameraRef.current) {
      rendererRef.current.setSize(width, height);
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
    }
  }, [width, height]);

  // Render compartment boundaries
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old boundaries
    for (const mesh of boundaryMeshesRef.current) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      if (mesh.material instanceof THREE.Material) mesh.material.dispose();
    }
    boundaryMeshesRef.current = [];

    // Create new boundaries
    for (const geom of geometries) {
      let geometry: THREE.BufferGeometry;

      if (geom.shape === 'sphere' && geom.radius) {
        geometry = new THREE.SphereGeometry(geom.radius, 32, 24);
      } else if (geom.shape === 'box' && geom.halfExtents) {
        const [hx, hy, hz] = geom.halfExtents;
        geometry = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);
      } else {
        continue;
      }

      const material = new THREE.MeshBasicMaterial({
        color: geom.dimension === 3 ? 0x2244aa : 0x44aa88,
        wireframe: true,
        transparent: true,
        opacity: 0.15,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...geom.center);
      scene.add(mesh);
      boundaryMeshesRef.current.push(mesh);
    }
  }, [geometries]);

  // Update molecule positions from snapshot
  const updateMolecules = useCallback((snap: SpatialSnapshot) => {
    const scene = sceneRef.current;
    if (!scene || !snap.positions || snap.positions.length === 0) return;

    setMoleculeCount(snap.moleculeCount);
    setSimTime(snap.time);

    // Group molecules by species ID
    const bySpecies = new Map<number, Array<{ x: number; y: number; z: number }>>();
    const floatsPerMolecule = 5;
    for (let i = 0; i < snap.positions.length / floatsPerMolecule; i++) {
      const x = snap.positions[i * floatsPerMolecule];
      const y = snap.positions[i * floatsPerMolecule + 1];
      const z = snap.positions[i * floatsPerMolecule + 2];
      const speciesId = snap.positions[i * floatsPerMolecule + 3];

      if (!bySpecies.has(speciesId)) {
        bySpecies.set(speciesId, []);
      }
      bySpecies.get(speciesId)!.push({ x, y, z });
    }

    // Remove old instanced meshes for species no longer present
    for (const [speciesId, mesh] of instancedMeshesRef.current) {
      if (!bySpecies.has(speciesId)) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        if (mesh.material instanceof THREE.Material) mesh.material.dispose();
        instancedMeshesRef.current.delete(speciesId);
      }
    }

    // Update or create instanced meshes
    const sphereGeom = new THREE.SphereGeometry(0.1, 8, 6);
    const dummy = new THREE.Object3D();

    for (const [speciesId, positions] of bySpecies) {
      const colorIndex = speciesId % SPECIES_COLORS.length;
      const color = SPECIES_COLORS[colorIndex];

      let mesh = instancedMeshesRef.current.get(speciesId);

      // Recreate if count changed
      if (mesh && mesh.count !== positions.length) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        if (mesh.material instanceof THREE.Material) mesh.material.dispose();
        mesh = undefined;
      }

      if (!mesh) {
        const material = new THREE.MeshPhongMaterial({
          color,
          shininess: 80,
          transparent: true,
          opacity: 0.9,
        });
        mesh = new THREE.InstancedMesh(sphereGeom, material, positions.length);
        mesh.frustumCulled = false;
        scene.add(mesh);
        instancedMeshesRef.current.set(speciesId, mesh);
      }

      // Update instance positions
      for (let i = 0; i < positions.length; i++) {
        dummy.position.set(positions[i].x, positions[i].y, positions[i].z);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    sphereGeom.dispose();
  }, []);

  // React to snapshot changes
  useEffect(() => {
    if (snapshot) {
      updateMolecules(snapshot);
    }
  }, [snapshot, updateMolecules]);

  return (
    <div className="relative" style={{ width, height }}>
      {rendererError ? (
        <div className="w-full h-full flex items-center justify-center bg-slate-950 text-slate-300 px-6 text-center">
          <div>
            <div className="text-sm font-semibold mb-2">Spatial Viewer Unavailable</div>
            <div className="text-xs text-slate-400">{rendererError}</div>
          </div>
        </div>
      ) : (
        <div ref={containerRef} className="w-full h-full" />
      )}

      {/* HUD overlay */}
      {!rendererError && <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 text-xs font-mono text-gray-300 space-y-0.5 pointer-events-none">
        <div>
          <span className="text-primary-400">Time:</span>{' '}
          {simTime.toExponential(2)} s
        </div>
        <div>
          <span className="text-primary-400">Molecules:</span>{' '}
          {moleculeCount.toLocaleString()}
        </div>
        {isRunning && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400">Simulating</span>
          </div>
        )}
      </div>}

      {/* Species legend */}
      {!rendererError && <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-sm rounded-lg px-3 py-2 text-xs font-mono text-gray-300 max-h-48 overflow-y-auto"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 transparent' }}>
        <div className="text-primary-400 mb-1.5 text-[10px] uppercase tracking-wider">Species</div>
        {Array.from(speciesNames.entries()).map(([id, name]) => (
          <div key={id} className="flex items-center gap-1.5 py-0.5">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{
                backgroundColor: `#${SPECIES_COLORS[id % SPECIES_COLORS.length].toString(16).padStart(6, '0')}`,
              }}
            />
            <span
              style={{
                maxWidth: 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'inline-block',
              }}
              title={name}
            >
              {name}
            </span>
          </div>
        ))}
      </div>}
    </div>
  );
};
