import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import type { Group } from 'three';
import type { Setpoint } from './flight/cascade';

/**
 * Follows the live trajectory setpoint published by the flight controller.
 * Dragging the ring moves the flight target (the hover point, or the center
 * of the circle/figure-8/waypoint patterns) in the horizontal plane at the
 * current altitude.
 */
export function TargetMarker({
  targetRef,
  onDragTarget,
}: {
  targetRef: RefObject<Setpoint | null>;
  onDragTarget: (x: number, y: number) => void;
}) {
  const group = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const draggingRef = useRef(false);
  const controls = useThree((s) => s.controls) as { enabled?: boolean } | null;

  useFrame(() => {
    const sp = targetRef.current;
    if (!sp || !group.current || draggingRef.current) return;
    group.current.position.set(sp.pos[0], sp.pos[1], sp.pos[2]);
    group.current.rotation.set(0, 0, sp.yaw);
  });

  const dragTo = (e: ThreeEvent<PointerEvent>) => {
    // Intersect the pointer ray with the horizontal plane at the marker's altitude.
    const alt = group.current?.position.z ?? targetRef.current?.pos[2] ?? 1;
    const { origin, direction } = e.ray;
    if (Math.abs(direction.z) < 1e-6) return;
    const t = (alt - origin.z) / direction.z;
    if (t <= 0) return;
    const x = origin.x + direction.x * t;
    const y = origin.y + direction.y * t;
    group.current?.position.setX(x);
    group.current?.position.setY(y);
    onDragTarget(x, y);
  };

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    draggingRef.current = true;
    if (controls) controls.enabled = false;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragTo(e);
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    dragTo(e);
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    draggingRef.current = false;
    if (controls) controls.enabled = true;
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  const ringColor = hovered || draggingRef.current ? '#7dd3fc' : '#38bdf8';

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[0.03, 16, 16]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.9} />
      </mesh>
      <mesh>
        <torusGeometry args={[0.12, hovered ? 0.008 : 0.004, 8, 48]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.7} />
      </mesh>
      {/* Heading tick */}
      <mesh position={[0.12, 0, 0]}>
        <boxGeometry args={[0.06, 0.008, 0.008]} />
        <meshBasicMaterial color="#f59e0b" />
      </mesh>
      {/* Invisible fat hit disc so the thin ring is easy to grab */}
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <cylinderGeometry args={[0.18, 0.18, 0.06, 24]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
