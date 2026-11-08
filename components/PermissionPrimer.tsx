// components/PermissionPrimer.tsx
// Pantalla previa de explicación (permission priming) reutilizable para cualquier permiso.
import { View, Text, Pressable } from 'react-native';
import type { PermissionState } from '@/types/geo';

interface Props {
  title: string;
  description: string;
  state: PermissionState;
  onRequest: () => void;
  onOpenSettings: () => void;
}

export function PermissionPrimer({ title, description, state, onRequest, onOpenSettings }: Props) {
  const isBlocked = state === 'blocked';

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-neutral-950 px-8">
      <Text className="text-center text-2xl font-bold text-white">{title}</Text>
      <Text className="text-center text-base text-neutral-300">
        {isBlocked
          ? 'Desactivaste este permiso. Puedes habilitarlo desde los Ajustes del sistema.'
          : description}
      </Text>
      <Pressable
        onPress={isBlocked ? onOpenSettings : onRequest}
        className="rounded-full bg-emerald-500 px-6 py-3 active:opacity-80"
        accessibilityRole="button"
      >
        <Text className="font-semibold text-neutral-950">
          {isBlocked ? 'Abrir Ajustes' : 'Permitir acceso'}
        </Text>
      </Pressable>
    </View>
  );
}
