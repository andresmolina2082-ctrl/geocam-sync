// components/SyncBadge.tsx
// Indicador del estado de sincronización (T6). Al tocarlo se pide sincronizar ahora.
import type { ComponentProps } from 'react';
import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSync } from '@/hooks/useSync';

export function SyncBadge() {
  const sync = useSync();

  let icon: ComponentProps<typeof Ionicons>['name'] = 'cloud-done-outline';
  let color = '#10b981';
  let label = 'Al día';

  if (!sync.isOnline) {
    icon = 'cloud-offline-outline';
    color = '#fbbf24';
    label = sync.pendingCount > 0 ? `Sin conexión · ${sync.pendingCount} pendientes` : 'Sin conexión';
  } else if (sync.isSyncing) {
    icon = 'sync-outline';
    color = '#38bdf8';
    label = 'Sincronizando…';
  } else if (sync.error) {
    icon = 'alert-circle-outline';
    color = '#f87171';
    label = 'Error al sincronizar · toca para reintentar';
  } else if (sync.pendingCount > 0) {
    icon = 'cloud-upload-outline';
    color = '#fbbf24';
    label = `${sync.pendingCount} pendientes · toca para sincronizar`;
  }

  return (
    <Pressable
      onPress={() => sync.syncNow()}
      disabled={!sync.isOnline || sync.isSyncing}
      className="flex-row items-center gap-1.5 self-start rounded-full bg-neutral-900/90 px-3 py-1.5"
      accessibilityRole="button"
      accessibilityLabel={`Estado de sincronización: ${label}`}
    >
      <Ionicons name={icon} size={14} color={color} />
      <Text style={{ color }} className="text-xs font-medium">
        {label}
      </Text>
    </Pressable>
  );
}
