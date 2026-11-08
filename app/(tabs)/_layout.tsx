// app/(tabs)/_layout.tsx
// Pestañas GeoCam y Mapa. El sensor de agitado vive aquí para funcionar en ambas pestañas.
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useShake } from '@/hooks/useShake';
import { usePhotos } from '@/hooks/usePhotos';
import { useSync } from '@/hooks/useSync';

export default function TabsLayout() {
  const { photos, clearAll } = usePhotos();
  useSync(); // Semana 9: mantiene activa la sincronización automática en todas las pestañas
  const [alertOpen, setAlertOpen] = useState(false);

  const handleShake = useCallback(() => {
    if (photos.length === 0) return;
    setAlertOpen(true);
    Alert.alert('Borrar todas las fotos', `¿Eliminar las ${photos.length} fotos guardadas?`, [
      { text: 'Cancelar', style: 'cancel', onPress: () => setAlertOpen(false) },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await clearAll();
          setAlertOpen(false);
        },
      },
    ], { cancelable: true, onDismiss: () => setAlertOpen(false) });
  }, [photos.length, clearAll]);

  // Mientras el Alert está abierto se pausa el sensor, para no apilar diálogos
  useShake(handleShake, { enabled: !alertOpen });

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#10b981',
        tabBarInactiveTintColor: '#a3a3a3',
        tabBarStyle: { backgroundColor: '#0a0a0a', borderTopColor: '#262626' },
      }}
    >
      <Tabs.Screen
        name="geocam"
        options={{
          title: 'GeoCam',
          tabBarIcon: ({ color, size }) => <Ionicons name="camera" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="fotos"
        options={{
          title: 'Fotos',
          tabBarIcon: ({ color, size }) => <Ionicons name="images" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="nube"
        options={{
          title: 'Nube',
          tabBarIcon: ({ color, size }) => <Ionicons name="cloud" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="mapa"
        options={{
          title: 'Mapa',
          tabBarIcon: ({ color, size }) => <Ionicons name="map" color={color} size={size} />,
          tabBarBadge: photos.length > 0 ? photos.length : undefined,
        }}
      />
    </Tabs>
  );
}
