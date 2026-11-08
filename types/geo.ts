// types/geo.ts
// Tipos compartidos por hooks, componentes y pantallas de GeoCam.
// Nota Semana 7: el tipo GeoPhoto se reemplazó por Photo, inferido desde db/schema.ts.

/**
 * Máquina de estados de un permiso nativo.
 * - checking:     aún no sabemos el estado (primer render).
 * - undetermined: nunca se ha preguntado al usuario.
 * - granted:      concedido.
 * - denied:       rechazado, pero se puede volver a preguntar.
 * - blocked:      rechazado sin posibilidad de volver a preguntar (canAskAgain = false).
 */
export type PermissionState =
  | 'checking'
  | 'undetermined'
  | 'granted'
  | 'denied'
  | 'blocked';

export interface Coords {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
}
