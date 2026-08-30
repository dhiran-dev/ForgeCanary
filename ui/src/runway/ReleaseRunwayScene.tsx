import { Environment, Lightformer, useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { RunwayPhase } from './runway-state';

const MODEL_URL = '/models/forgecanary-release-runway.glb';
const GREEN = '#00e39b';
const CORAL = '#ff654f';

type SceneProps = {
  phase: RunwayPhase;
  reducedMotion: boolean;
  onReady: () => void;
};

type MaterialBindings = {
  current: THREE.MeshStandardMaterial[];
  replay: THREE.MeshStandardMaterial[];
  upgrade: THREE.MeshStandardMaterial[];
  safe: THREE.MeshStandardMaterial[];
  pipeline: THREE.MeshStandardMaterial[];
  coral: THREE.MeshStandardMaterial[];
};

function collectBoundMaterials(root: THREE.Object3D | undefined, token: 'green' | 'coral'): THREE.MeshStandardMaterial[] {
  const materials = new Set<THREE.MeshStandardMaterial>();
  root?.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of list) {
      if (!(material instanceof THREE.MeshStandardMaterial) || !material.name.toLowerCase().includes(token)) continue;
      material.emissive.copy(material.color);
      materials.add(material);
    }
  });
  return [...materials];
}

function prepareModel(source: THREE.Group): { model: THREE.Group; bindings: MaterialBindings } {
  const model = source.clone(true);
  model.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.material = Array.isArray(child.material)
      ? child.material.map(material => material.clone())
      : child.material.clone();
    const list = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of list) {
      if (material instanceof THREE.MeshPhysicalMaterial) {
        material.envMapIntensity = Math.max(material.envMapIntensity, 1.15);
        if (material.transparent) material.depthWrite = false;
      }
    }
  });

  const current = model.getObjectByName('FC_STAGE_CURRENT');
  const replay = model.getObjectByName('FC_STAGE_REPLAY');
  const upgrade = model.getObjectByName('FC_STAGE_UPGRADE');
  const safe = model.getObjectByName('FC_STAGE_SAFE_TO_SHIP');
  const pipeline = model.getObjectByName('FC_PIPELINE');

  return {
    model,
    bindings: {
      current: collectBoundMaterials(current, 'green'),
      replay: collectBoundMaterials(replay, 'green'),
      upgrade: collectBoundMaterials(upgrade, 'green'),
      safe: collectBoundMaterials(safe, 'green'),
      pipeline: collectBoundMaterials(pipeline, 'green'),
      coral: collectBoundMaterials(replay, 'coral')
    }
  };
}

function phaseHasReached(phase: RunwayPhase, target: RunwayPhase): boolean {
  const order: RunwayPhase[] = ['ready', 'current', 'replay', 'compare', 'blocked', 'repair', 'complete'];
  if (phase === 'failed') return false;
  return order.indexOf(phase) >= order.indexOf(target);
}

function animateMaterials(materials: THREE.MeshStandardMaterial[], target: number, delta: number): void {
  const damping = 1 - Math.exp(-delta * 5.5);
  for (const material of materials) {
    material.emissiveIntensity = THREE.MathUtils.lerp(material.emissiveIntensity, target, damping);
  }
}

function ReleaseRunwayModel({ phase, onReady }: Pick<SceneProps, 'phase' | 'onReady'>) {
  const gltf = useGLTF(MODEL_URL, false, true) as { scene: THREE.Group };
  const prepared = useMemo(() => prepareModel(gltf.scene), [gltf.scene]);

  useEffect(() => onReady(), [onReady]);

  useFrame((_, delta) => {
    const replayOn = phaseHasReached(phase, 'replay');
    const compareOn = phaseHasReached(phase, 'compare');
    const repairOn = phase === 'repair' || phase === 'complete';
    animateMaterials(prepared.bindings.current, phase === 'failed' ? 0.12 : 1.25, delta);
    animateMaterials(prepared.bindings.replay, replayOn ? 1.65 : 0.12, delta);
    animateMaterials(prepared.bindings.upgrade, repairOn ? 1.7 : replayOn ? 0.35 : 0.08, delta);
    animateMaterials(prepared.bindings.safe, phase === 'complete' ? 2.35 : 0.08, delta);
    animateMaterials(prepared.bindings.pipeline, phase === 'ready' ? 0.35 : 1.15, delta);
    animateMaterials(prepared.bindings.coral, compareOn ? (phase === 'complete' ? 0.75 : 2.4) : 0.06, delta);
  });

  return <primitive object={prepared.model} />;
}

const LANES = [
  { y: -0.145, z: 0.07 },
  { y: -0.073, z: -0.05 },
  { y: 0, z: 0.02 },
  { y: 0.073, z: -0.08 },
  { y: 0.145, z: 0.06 }
] as const;

function FlowParticles({
  start,
  end,
  count,
  active,
  reducedMotion,
  seed
}: {
  start: number;
  end: number;
  count: number;
  active: boolean;
  reducedMotion: boolean;
  seed: number;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const elapsed = useRef(seed * 0.137);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const offsets = useMemo(
    () => Array.from({ length: count }, (_, index) => (index / count + ((index * 29 + seed * 11) % 17) / 160) % 1),
    [count, seed]
  );

  useEffect(() => {
    mesh.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }, []);

  useFrame((_, delta) => {
    if (!mesh.current) return;
    if (!reducedMotion) elapsed.current += delta * (active ? 0.72 : 0.08);
    for (let index = 0; index < count; index += 1) {
      const lane = LANES[index % LANES.length];
      const progress = (offsets[index] + elapsed.current) % 1;
      dummy.position.set(THREE.MathUtils.lerp(start, end, progress), 1.624 + lane.y, lane.z);
      const pulse = active ? 0.82 + Math.sin((progress + elapsed.current) * Math.PI * 10) * 0.18 : 0.28;
      dummy.scale.set(pulse, active ? 1 : 0.55, active ? 1 : 0.55);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(index, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[0.12, 0.022, 0.022]} />
      <meshBasicMaterial
        color={GREEN}
        transparent
        opacity={active ? 0.95 : 0.13}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

function PipelineMotion({ phase, reducedMotion }: Pick<SceneProps, 'phase' | 'reducedMotion'>) {
  const replayOn = phaseHasReached(phase, 'replay');
  const releaseOn = phase === 'repair' || phase === 'complete';
  return (
    <>
      <FlowParticles start={-6.21} end={-4.28} count={24} active={phase !== 'failed'} reducedMotion={reducedMotion} seed={1} />
      <FlowParticles start={3.03} end={3.716} count={10} active={replayOn} reducedMotion={reducedMotion} seed={2} />
      <FlowParticles start={6.284} end={6.645} count={7} active={releaseOn} reducedMotion={reducedMotion} seed={3} />
    </>
  );
}

function ReplaySignals({ phase, reducedMotion }: Pick<SceneProps, 'phase' | 'reducedMotion'>) {
  const lights = useRef<THREE.PointLight[]>([]);
  const xPositions = [-2.968, -2.244, -1.52, -0.796, -0.072, 0.652];
  const resolved = phaseHasReached(phase, 'compare');
  const replaying = phase === 'replay';

  useFrame(state => {
    const activeIndex = reducedMotion ? 5 : Math.floor(state.clock.elapsedTime * 2.5) % 6;
    lights.current.forEach((light, index) => {
      const target = resolved ? 1.8 : replaying && index === activeIndex ? 3.4 : replaying && index < activeIndex ? 1.25 : 0.12;
      light.intensity = THREE.MathUtils.lerp(light.intensity, target, 0.16);
    });
  });

  return (
    <>
      {xPositions.map((x, index) => (
        <pointLight
          key={x}
          ref={light => {
            if (light) lights.current[index] = light;
          }}
          position={[x, 1.63, 0.82]}
          color={GREEN}
          intensity={0.1}
          distance={1.2}
          decay={2}
        />
      ))}
    </>
  );
}

function StateLights({ phase }: Pick<SceneProps, 'phase'>) {
  const compareOn = phaseHasReached(phase, 'compare');
  const repairOn = phase === 'repair' || phase === 'complete';
  return (
    <>
      <pointLight position={[-5.25, 1.63, 0]} color={GREEN} intensity={phase === 'failed' ? 0.2 : 2.3} distance={3.5} decay={2} />
      <pointLight position={[3.37, 1.63, 0]} color={GREEN} intensity={phaseHasReached(phase, 'replay') ? 2.1 : 0.12} distance={2.5} decay={2} />
      <pointLight position={[6.46, 1.63, 0]} color={GREEN} intensity={repairOn ? 3.1 : 0.1} distance={2.2} decay={2} />
      <pointLight position={[1.45, 1.12, 0.35]} color={CORAL} intensity={compareOn ? 4.6 : 0.05} distance={3.1} decay={2} />
      <pointLight position={[7.6, 0.94, 0.68]} color={GREEN} intensity={phase === 'complete' ? 5.2 : 0.08} distance={2.4} decay={2} />
    </>
  );
}

function CameraRig() {
  const { camera, gl, size } = useThree();

  useLayoutEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    gl.toneMapping = THREE.AgXToneMapping;
    gl.toneMappingExposure = 1;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    const aspect = size.width / Math.max(1, size.height);
    const fov = 27;
    const desiredWidth = size.width < 680 ? 19.4 : 19.8;
    const distance = desiredWidth / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)) * Math.max(0.72, aspect));
    const targetX = -0.2045;
    const targetY = 1.5115;
    camera.fov = fov;
    camera.near = 0.1;
    camera.far = 80;
    camera.position.set(targetX, targetY + distance * 0.2, distance);
    camera.lookAt(targetX, targetY, 0);
    camera.updateProjectionMatrix();
  }, [camera, gl, size.height, size.width]);

  return null;
}

function MatchedAreaLight({
  position,
  color,
  intensity,
  width,
  height
}: {
  position: [number, number, number];
  color: string;
  intensity: number;
  width: number;
  height: number;
}) {
  const light = useRef<THREE.RectAreaLight>(null);

  useLayoutEffect(() => {
    light.current?.lookAt(0, 1.52, 0);
  }, []);

  return <rectAreaLight ref={light} position={position} color={color} intensity={intensity} width={width} height={height} />;
}

function Lighting() {
  return (
    <>
      <ambientLight intensity={0.08} />
      <MatchedAreaLight position={[11.5, 7.8, 8.5]} color="#e7f9f5" intensity={5.2} width={8} height={5} />
      <MatchedAreaLight position={[-2.5, 4.4, 8]} color="#c5d3d0" intensity={2.1} width={7} height={4} />
      <MatchedAreaLight position={[-10.5, 4.8, -1.5]} color="#a5c9c0" intensity={1.45} width={6} height={4} />
      <MatchedAreaLight position={[9.5, 5.5, -2.5]} color="#6affbd" intensity={2.85} width={6} height={4} />
      <MatchedAreaLight position={[0.5, 9, -1.4]} color="#dcebe7" intensity={3.5} width={12} height={1.4} />
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={2.4} rotation-x={Math.PI / 2} position={[2, 8, -3]} scale={[14, 1.2, 1]} />
        <Lightformer intensity={3.2} rotation-y={-Math.PI / 2} position={[11, 3, 2]} scale={[4, 10, 1]} />
        <Lightformer intensity={1.4} rotation-y={Math.PI / 2} position={[-10, 2, 1]} scale={[3, 8, 1]} />
      </Environment>
    </>
  );
}

export default function ReleaseRunwayScene({ phase, reducedMotion, onReady }: SceneProps) {
  return (
    <>
      <color attach="background" args={['#020403']} />
      <fog attach="fog" args={['#020403', 21, 48]} />
      <CameraRig />
      <Lighting />
      <ReleaseRunwayModel phase={phase} onReady={onReady} />
      <PipelineMotion phase={phase} reducedMotion={reducedMotion} />
      <ReplaySignals phase={phase} reducedMotion={reducedMotion} />
      <StateLights phase={phase} />
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.72} luminanceThreshold={0.7} luminanceSmoothing={0.32} mipmapBlur />
      </EffectComposer>
    </>
  );
}

useGLTF.preload(MODEL_URL, false, true);
