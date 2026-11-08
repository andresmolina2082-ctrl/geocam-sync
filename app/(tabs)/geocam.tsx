// app/(tabs)/geocam.tsx
// Cámara + GPS en vivo. Semana 7: cada foto se guarda en SQLite a través de usePhotos.
import { useCallback, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { CameraView } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useCamera } from '@/hooks/useCamera';
import { useGeoLocation } from '@/hooks/useGeoLocation';
import { usePhotos } from '@/hooks/usePhotos';
import { PermissionPrimer } from '@/components/PermissionPrimer';
import { SyncBadge } from '@/components/SyncBadge';
import type { Coords } from '@/types/geo';

export default function GeoCamScreen() {
  // Si la pestaña no está visible, se apagan cámara y GPS (ahorro de batería)
  const [isFocused, setIsFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  const cam = useCamera();
  const geo = useGeoLocation({ watch: isFocused });
  const { addPhoto, lastPhoto } = usePhotos(); // antes: useState<GeoPhoto>

  if (cam.permissionState === 'checking') {
    return <View className="flex-1 bg-neutral-950" />;
  }

  if (cam.permissionState !== 'granted') {
    return (
      <PermissionPrimer
        title="GeoCam necesita tu cámara"
        description="La usamos solo para tomar fotos que tú decidas guardar."
        state={cam.permissionState}
        onRequest={cam.requestPermission}
        onOpenSettings={cam.openSettings}
      />
    );
  }

  // Degradación elegante: sin permiso de ubicación, las coordenadas quedan en null
  const currentCoords = async (): Promise<Coords | null> =>
    geo.permission === 'granted' ? geo.coords ?? (await geo.getCurrent()) : null;

  const handleCapture = async () => {
    try {
      const photo = await cam.takePhoto();
      if (!photo) return;
      await addPhoto({ uri: photo.uri, coords: await currentCoords(), source: 'camera' });
    } catch (e) {
      Alert.alert('No se pudo guardar la foto', e instanceof Error ? e.message : undefined);
    }
  };

  // R2 de la Semana 6: importar desde galería (el selector del sistema no pide permiso)
  const handlePickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (result.canceled) return;
      await addPhoto({
        uri: result.assets[0].uri,
        coords: await currentCoords(),
        source: 'gallery',
      });
    } catch (e) {
      Alert.alert('No se pudo importar la foto', e instanceof Error ? e.message : undefined);
    }
  };

  const showLocationBanner = geo.permission !== 'granted' && geo.permission !== 'checking';
  const lastHasLocation = lastPhoto?.latitude != null && lastPhoto?.longitude != null;

  return (
    <View className="flex-1 bg-black">
      {/* CameraView sin hijos: los controles van como hermanos con posición absoluta */}
      <CameraView
        ref={cam.cameraRef}
        style={StyleSheet.absoluteFill}
        facing={cam.facing}
        active={isFocused}
        onCameraReady={cam.onCameraReady}
      />

      {/* Banner de ubicación: pedir en contexto, sin bloquear la cámara */}
      {showLocationBanner && (
        <Pressable
          onPress={geo.permission === 'blocked' ? geo.openSettings : geo.requestPermission}
          className="absolute left-4 right-4 top-14 rounded-xl bg-amber-400/90 p-3"
          accessibilityRole="button"
        >
          <Text className="text-center font-medium text-neutral-900">
            {geo.permission === 'blocked'
              ? 'Ubicación bloqueada: toca para abrir Ajustes'
              : 'Activa la ubicación para etiquetar tus fotos'}
          </Text>
        </Pressable>
      )}

      {/* Coordenadas en vivo */}
      {geo.coords && (
        <View className="absolute left-4 top-14 rounded-lg bg-black/60 px-3 py-2">
          <Text className="font-mono text-xs text-emerald-300">
            {geo.coords.latitude.toFixed(5)}, {geo.coords.longitude.toFixed(5)}
          </Text>
          <Text className="font-mono text-xs text-neutral-400">
            ±{Math.round(geo.coords.accuracy ?? 0)} m
          </Text>
        </View>
      )}

      {/* Estado de sincronización (Semana 9) */}
      <View className="absolute right-4 top-24">
        <SyncBadge />
      </View>

      {geo.error && (
        <View className="absolute left-4 right-4 top-32 rounded-lg bg-red-500/80 px-3 py-2">
          <Text className="text-center text-xs text-white">{geo.error}</Text>
        </View>
      )}

      {/* Datos de la última foto guardada en SQLite */}
      {lastPhoto && (
        <View className="absolute bottom-36 left-4 right-4 rounded-lg bg-black/60 px-3 py-2">
          <Text className="text-center text-xs text-neutral-200">
            {lastPhoto.source === 'gallery' ? 'Última (galería): ' : 'Última (cámara): '}
            {lastHasLocation
              ? `${lastPhoto.latitude!.toFixed(5)}, ${lastPhoto.longitude!.toFixed(5)}`
              : 'sin ubicación'}
          </Text>
        </View>
      )}

      {/* Controles inferiores */}
      <View className="absolute bottom-10 left-0 right-0 flex-row items-center justify-around">
        <Pressable
          className="h-14 w-14"
          disabled={!lastPhoto}
          onPress={() =>
            lastPhoto &&
            router.push({ pathname: '/foto/[id]', params: { id: String(lastPhoto.id) } })
          }
          accessibilityRole="button"
          accessibilityLabel="Ver última foto"
        >
          {lastPhoto && (
            <>
              <Image
                source={{ uri: lastPhoto.uri }}
                className="h-14 w-14 rounded-lg border-2 border-white"
                accessibilityLabel="Última foto guardada"
              />
              {/* Distinción visual por origen: verde = cámara, violeta = galería */}
              <View
                className={`absolute -right-1 -top-1 h-4 w-4 rounded-full border-2 border-black ${
                  lastPhoto.source === 'gallery' ? 'bg-violet-500' : 'bg-emerald-500'
                }`}
              />
            </>
          )}
        </Pressable>

        <Pressable
          onPress={handlePickFromGallery}
          className="h-14 w-14 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Importar desde galería"
        >
          <Ionicons name="images-outline" size={28} color="white" />
        </Pressable>

        <Pressable
          onPress={handleCapture}
          disabled={cam.isCapturing}
          className="h-20 w-20 items-center justify-center rounded-full border-4 border-white active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel="Tomar foto"
        >
          <View className={`h-16 w-16 rounded-full ${cam.isCapturing ? 'bg-neutral-400' : 'bg-white'}`} />
        </Pressable>

        <Pressable
          onPress={cam.toggleFacing}
          className="h-14 w-14 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Cambiar cámara"
        >
          <Ionicons name="camera-reverse-outline" size={28} color="white" />
        </Pressable>
      </View>
    </View>
  );
}
