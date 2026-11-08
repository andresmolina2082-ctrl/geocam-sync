// app/_layout.tsx
// Orden de arranque: 1) migraciones locales, 2) rellenar campos de nube, 3) autenticación.
// Semana 9: todo queda dentro de QueryClientProvider.
import '../global.css';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '@/drizzle/migrations';
import { db } from '@/db/client'; // única excepción a la regla de capas: arrancar la base
import { photosRepo } from '@/db/repositories/photos';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, useAppFocusManager } from '@/lib/queryClient';
import { AuthProvider, useAuth } from '@/context/AuthContext';

function Loading() {
  return (
    <View className="flex-1 items-center justify-center bg-neutral-950">
      <ActivityIndicator color="#10b981" />
    </View>
  );
}

function RootNavigator() {
  const { session, isLoading } = useAuth();
  if (isLoading) return <Loading />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* index queda fuera de los grupos: solo redirige según la sesión */}
      <Stack.Screen name="index" />

      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="foto/[id]"
          options={{
            headerShown: true,
            title: 'Foto',
            headerBackTitle: 'Volver',
            headerStyle: { backgroundColor: '#0a0a0a' },
            headerTintColor: '#ffffff',
          }}
        />
      </Stack.Protected>

      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  useAppFocusManager(); // TanStack Query se entera de cuándo la app vuelve a primer plano
  const { success, error } = useMigrations(db, migrations);
  const [ready, setReady] = useState(false);

  // Las fotos anteriores a la migración de la Semana 8 no tienen clientId ni updatedAt
  useEffect(() => {
    if (!success) return;
    photosRepo
      .ensureSyncFields()
      .catch((e) => console.warn('[ensureSyncFields]', e))
      .finally(() => setReady(true));
  }, [success]);

  if (error) {
    return (
      <ScrollView className="flex-1 bg-neutral-950" contentContainerClassName="flex-grow justify-center p-6">
        <Text className="mb-2 text-lg font-bold text-white">Error al preparar la base de datos</Text>
        {/* Drizzle envuelve el error de SQLite: la causa real viene en error.cause */}
        {error.cause instanceof Error && (
          <Text className="mb-3 font-semibold text-red-400">{error.cause.message}</Text>
        )}
        <Text className="text-xs text-neutral-400">{error.message}</Text>
      </ScrollView>
    );
  }

  if (!success || !ready) return <Loading />;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RootNavigator />
        <StatusBar style="light" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
