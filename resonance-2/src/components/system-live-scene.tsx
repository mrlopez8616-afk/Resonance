"use client";

import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  Object3D,
  SphereGeometry,
  Vector3,
} from "three";
import {
  LIVE_KIND_COLOR,
  LIVE_PULSE_MS,
  type LiveGraph,
  type LiveKind,
  type LivePoint,
  type SystemPulse,
} from "@/lib/system-live";

const STAR_COUNT = 150;

function scaleOf(kind: LiveKind, bright: boolean): number {
  const base = kind === "hub" ? 0.2 : kind === "node" ? 0.112 : kind === "sleeve" ? 0.078 : 0.064;
  return bright ? base * 1.55 : base;
}

function Starfield() {
  const geometry = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    for (let index = 0; index < STAR_COUNT; index += 1) {
      const radius = 9 + ((index * 17) % 50) / 10;
      const theta = (index * 2.399) % (Math.PI * 2);
      const phi = Math.acos(((index * 37) % 100) / 50 - 1);
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.cos(phi) * 0.62;
      positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(positions, 3));
    return geo;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <points geometry={geometry}>
      <pointsMaterial color="#c5d2e6" size={0.028} sizeAttenuation depthWrite={false} />
    </points>
  );
}

function LabelLock({
  points,
  labels,
}: {
  points: readonly LivePoint[];
  labels: { current: Map<string, HTMLSpanElement> };
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const vec = useMemo(() => new Vector3(), []);

  useFrame(() => {
    const width = gl.domElement.clientWidth || size.width;
    const height = gl.domElement.clientHeight || size.height;
    for (const point of points) {
      const el = labels.current.get(point.id);
      if (!el) continue;
      vec.set(point.x, point.y + 0.18, point.z).project(camera);
      const x = (vec.x * 0.5 + 0.5) * width;
      const y = (-vec.y * 0.5 + 0.5) * height;
      el.style.opacity = vec.z < 1 ? "1" : "0";
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -120%)`;
    }
  });

  return null;
}

function Web({
  graph,
  pulse,
  onPulseDone,
  onSelect,
}: {
  graph: LiveGraph;
  pulse: SystemPulse | null;
  onPulseDone: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const body = useRef<InstancedMesh>(null);
  const halo = useRef<InstancedMesh>(null);
  const pulseMesh = useRef<Object3D>(null);
  const elapsed = useRef(0);
  const finished = useRef("");
  const bright = useRef(new Set<string>());
  const painted = useRef("");
  const down = useRef<{ x: number; y: number; id: number } | null>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  const from = useMemo(() => new Vector3(), []);
  const to = useMemo(() => new Vector3(), []);
  const geom = useMemo(() => new SphereGeometry(1, 12, 8), []);
  const byId = useMemo(() => new Map(graph.points.map((point) => [point.id, point])), [graph.points]);
  const lines = useMemo(() => {
    const positions = new Float32Array(graph.edges.length * 6);
    graph.edges.forEach((edge, index) => {
      const start = byId.get(edge.from);
      const end = byId.get(edge.to);
      if (!start || !end) return;
      const offset = index * 6;
      positions[offset] = start.x;
      positions[offset + 1] = start.y;
      positions[offset + 2] = start.z;
      positions[offset + 3] = end.x;
      positions[offset + 4] = end.y;
      positions[offset + 5] = end.z;
    });
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(positions, 3));
    return geo;
  }, [byId, graph.edges]);

  useEffect(
    () => () => {
      geom.dispose();
      lines.dispose();
    },
    [geom, lines],
  );

  useEffect(() => {
    elapsed.current = 0;
    finished.current = "";
    painted.current = "";
  }, [pulse?.id]);

  useFrame((_, delta) => {
    bright.current.clear();
    let travel: { ax: number; ay: number; az: number; bx: number; by: number; bz: number; t: number } | null = null;
    let litKey = "idle";
    if (pulse && pulse.edgeIds.length > 0) {
      elapsed.current += Math.min(delta, 0.05) * 1000;
      const t = Math.min(1, elapsed.current / LIVE_PULSE_MS);
      const span = t * pulse.edgeIds.length;
      const segment = Math.min(pulse.edgeIds.length - 1, Math.floor(Math.max(0, span)));
      const local = pulse.edgeIds.length === 1 ? t : span - segment;
      const edge = graph.edges.find((item) => item.id === pulse.edgeIds[segment]);
      const start = edge ? byId.get(edge.from) : undefined;
      const end = edge ? byId.get(edge.to) : undefined;
      if (start && end) {
        const eased = local * local * (3 - 2 * local);
        travel = { ax: start.x, ay: start.y, az: start.z, bx: end.x, by: end.y, bz: end.z, t: eased };
      }
      if (t > 0.62) {
        for (const id of pulse.nodeIds) bright.current.add(id);
        litKey = pulse.id;
      }
      if (t >= 1 && finished.current !== pulse.id) {
        finished.current = pulse.id;
        onPulseDone(pulse.id);
      }
    }

    if (body.current && halo.current && painted.current !== litKey) {
      const paint = (mesh: InstancedMesh | null, haloScale: number) => {
        if (!mesh) return;
        graph.points.forEach((point, index) => {
          const lit = bright.current.has(point.id);
          dummy.position.set(point.x, point.y, point.z);
          dummy.scale.setScalar(scaleOf(point.kind, lit) * haloScale);
          dummy.updateMatrix();
          mesh.setMatrixAt(index, dummy.matrix);
          color.set(lit ? "#fff6d2" : LIVE_KIND_COLOR[point.kind]);
          mesh.setColorAt(index, color);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      };
      paint(body.current, 1);
      paint(halo.current, 2.15);
      painted.current = litKey;
    }

    const orb = pulseMesh.current;
    if (!orb) return;
    if (!travel) {
      orb.visible = false;
      return;
    }
    orb.visible = true;
    from.set(travel.ax, travel.ay, travel.az);
    to.set(travel.bx, travel.by, travel.bz);
    orb.position.lerpVectors(from, to, travel.t);
  });

  const count = graph.points.length;
  return (
    <>
      <lineSegments geometry={lines}>
        <lineBasicMaterial color="#35506e" transparent opacity={0.8} />
      </lineSegments>
      <instancedMesh
        ref={halo}
        args={[geom, undefined, count]}
        frustumCulled={false}
      >
        <meshBasicMaterial transparent opacity={0.22} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={body}
        args={[geom, undefined, count]}
        frustumCulled={false}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (typeof event.instanceId !== "number") return;
          down.current = { x: event.clientX, y: event.clientY, id: event.instanceId };
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          const start = down.current;
          down.current = null;
          if (!start || typeof event.instanceId !== "number" || event.instanceId !== start.id) return;
          if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) return;
          const point = graph.points[start.id];
          if (point) onSelect(point.id);
        }}
      >
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <mesh ref={pulseMesh} visible={false}>
        <sphereGeometry args={[0.07, 12, 8]} />
        <meshBasicMaterial color="#fff6d2" toneMapped={false} />
      </mesh>
    </>
  );
}

export function SystemLiveScene({
  graph,
  pulse,
  labeled,
  labels,
  onPulseDone,
  onSelect,
}: {
  graph: LiveGraph;
  pulse: SystemPulse | null;
  labeled: readonly LivePoint[];
  labels: { current: Map<string, HTMLSpanElement> };
  onPulseDone: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const [frameloop, setFrameloop] = useState<"always" | "never">("always");

  useEffect(() => {
    const sync = () => setFrameloop(document.visibilityState === "visible" ? "always" : "never");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  return (
    <Canvas
      dpr={[1, 2]}
      flat
      frameloop={frameloop}
      camera={{ position: [0, 4.5, 7.5], fov: 40, near: 0.1, far: 40 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance", stencil: false }}
    >
      <color attach="background" args={["#070b14"]} />
      <Starfield />
      <Web graph={graph} pulse={pulse} onPulseDone={onPulseDone} onSelect={onSelect} />
      <LabelLock points={labeled} labels={labels} />
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.65}
        zoomSpeed={0.7}
        minDistance={3.1}
        maxDistance={14}
        minPolarAngle={0.25}
        maxPolarAngle={Math.PI * 0.82}
      />
    </Canvas>
  );
}
