import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { Telemetry } from './controllers/DroneFlightController';

const MOTOR_LABELS = ['m1', 'm2', 'm3', 'm4'];

/** Fixed overlay showing live flight telemetry at ~10 Hz. */
export function TelemetryPanel({ telemetryRef }: { telemetryRef: RefObject<Telemetry | null> }) {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      if (telemetryRef.current) setTelemetry({ ...telemetryRef.current });
    }, 100);
    return () => clearInterval(id);
  }, [telemetryRef]);

  if (!telemetry) return null;

  const row = (label: string, value: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );

  return (
    <section
      style={{
        position: 'fixed',
        left: 16,
        bottom: 16,
        width: 240,
        padding: 12,
        border: '1px solid rgba(226, 232, 240, 0.16)',
        background: 'rgba(15, 23, 42, 0.88)',
        color: '#e2e8f0',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        zIndex: 20,
        backdropFilter: 'blur(10px)',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Telemetry</div>
      {row(
        'position',
        telemetry.pos.map((v) => v.toFixed(2)).join(', ')
      )}
      {row('speed', `${telemetry.speed.toFixed(2)} m/s`)}
      {row('tilt', `${telemetry.tiltDeg.toFixed(1)}°`)}
      {row('yaw', `${telemetry.yawDeg.toFixed(0)}°`)}
      {telemetry.estErrDeg !== null && row('est. error', `${telemetry.estErrDeg.toFixed(2)}°`)}

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        {telemetry.motors.map((m, i) => (
          <div key={MOTOR_LABELS[i]} style={{ flex: 1 }}>
            <div
              style={{
                height: 36,
                display: 'flex',
                alignItems: 'flex-end',
                background: 'rgba(148, 163, 184, 0.12)',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: `${Math.round(m * 100)}%`,
                  background: m > 0.92 ? '#f87171' : '#38bdf8',
                  transition: 'height 90ms linear',
                }}
              />
            </div>
            <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: 2 }}>
              {MOTOR_LABELS[i]}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
