// hooks/useShake.ts
// Detecta cuando el usuario agita el teléfono usando el acelerómetro.
import { useEffect, useRef, useState } from 'react';
import { Accelerometer } from 'expo-sensors';

interface Options {
  /** Magnitud en g a partir de la cual se considera agitado. En reposo vale ≈ 1 g. */
  threshold?: number;
  /** Tiempo mínimo entre dos disparos, para no ejecutar el callback varias veces por agitado. */
  cooldownMs?: number;
  /** Permite pausar la detección (por ejemplo, mientras se muestra un Alert). */
  enabled?: boolean;
}

export function useShake(
  onShake: () => void,
  { threshold = 1.8, cooldownMs = 1500, enabled = true }: Options = {}
): { isAvailable: boolean | null } {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);

  // El callback se guarda en una ref: así la suscripción no se reinicia en cada render
  const onShakeRef = useRef(onShake);
  onShakeRef.current = onShake;
  const lastShakeRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let subscription: { remove: () => void } | null = null;

    Accelerometer.isAvailableAsync()
      .then((available) => {
        if (cancelled) return;
        setIsAvailable(available);
        if (!available) return;

        Accelerometer.setUpdateInterval(100); // 10 lecturas por segundo bastan
        subscription = Accelerometer.addListener(({ x, y, z }) => {
          const magnitude = Math.sqrt(x * x + y * y + z * z);
          const now = Date.now();
          if (magnitude > threshold && now - lastShakeRef.current > cooldownMs) {
            lastShakeRef.current = now;
            onShakeRef.current();
          }
        });
      })
      .catch(() => {
        if (!cancelled) setIsAvailable(false);
      });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled, threshold, cooldownMs]);

  return { isAvailable };
}
