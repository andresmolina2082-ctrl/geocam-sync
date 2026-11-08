// app/(tabs)/mapa.tsx
// R3 de la Semana 6, ahora leyendo de SQLite: un marcador por foto con coordenadas,
// tarjeta con la miniatura al tocarlo y lista aparte de fotos sin ubicación.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Image, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import MapView, { Marker, type Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useGeoLocation } from '@/hooks/useGeoLocation';
import { usePhotos, type Photo } from '@/hooks/usePhotos';

// Riohacha, La Guajira: centro por defecto si no hay ubicación ni fotos
const DEFAULT_REGION: Region = {
  latitude: 11.5444,
  longitude: -72.9072,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const toRegion = (latitude: number, longitude: number): Region => ({
  latitude,
  longitude,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
});

export default function MapaScreen() {
  const mapRef = useRef<MapView>(null);
  const geo = useGeoLocation();
  const { photosWithLocation, photosWithoutLocation, removePhoto } = usePhotos();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const centeredOnce = useRef(false);

  // Cada vez que se entra a la pestaña, se lee la ubicación actual (si hay permiso)
  const { permission, getCurrent } = geo;
  useFocusEffect(
    useCallback(() => {
      if (permission === 'granted') getCurrent();
    }, [permission, getCurrent])
  );

  // Centro: ubicación del usuario → última foto con coordenadas → Riohacha
  const lastWithLocation = photosWithLocation[0];
  const target: Region | null = geo.coords
    ? toRegion(geo.coords.latitude, geo.coords.longitude)
    : lastWithLocation
      ? toRegion(lastWithLocation.latitude!, lastWithLocation.longitude!)
      : null;

  // Centrar automáticamente solo la primera vez que hay un destino
  useEffect(() => {
    if (target && !centeredOnce.current) {
      centeredOnce.current = true;
      mapRef.current?.animateToRegion(target, 600);
    }
  }, [target]);

  const selected = photosWithLocation.find((p) => p.id === selectedId) ?? null;

  const confirmDelete = (photo: Photo) => {
    Alert.alert('Eliminar foto', '¿Eliminar esta foto de GeoCam?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          if (photo.id === selectedId) setSelectedId(null);
          await removePhoto(photo.id);
        },
      },
    ]);
  };

  const totalPhotos = photosWithLocation.length + photosWithoutLocation.length;

  const openDetail = (photo: Photo) =>
    router.push({ pathname: '/foto/[id]', params: { id: String(photo.id) } });

  return (
    <View className="flex-1 bg-neutral-950">
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={DEFAULT_REGION}
        showsUserLocation={geo.permission === 'granted'}
        onPress={(e) => {
          // En iOS, tocar un marcador también dispara onPress del mapa con action 'marker-press'
          const action = (e.nativeEvent as { action?: string }).action;
          if (action !== 'marker-press') setSelectedId(null);
        }}
      >
        {photosWithLocation.map((photo) => (
          <Marker
            key={photo.id}
            coordinate={{ latitude: photo.latitude!, longitude: photo.longitude! }}
            pinColor={photo.source === 'gallery' ? 'violet' : 'green'}
            onPress={(e) => {
              e.stopPropagation();
              setSelectedId(photo.id);
            }}
          />
        ))}
      </MapView>

      {/* Botón para volver a centrar */}
      {target && (
        <Pressable
          onPress={() => mapRef.current?.animateToRegion(target, 600)}
          className="absolute right-4 top-14 h-11 w-11 items-center justify-center rounded-full bg-neutral-900/90"
          accessibilityRole="button"
          accessibilityLabel="Centrar mapa"
        >
          <Ionicons name="locate" size={22} color="#10b981" />
        </Pressable>
      )}

      {totalPhotos === 0 && (
        <View className="absolute left-4 right-4 top-14 rounded-xl bg-neutral-900/90 p-4">
          <Text className="text-center text-neutral-200">
            Aún no hay fotos. Toma una en la pestaña GeoCam.
          </Text>
        </View>
      )}

      <View className="absolute bottom-4 left-4 right-4 gap-3">
        {/* Tarjeta de la foto seleccionada */}
        {selected && (
          <View className="flex-row gap-3 rounded-xl bg-neutral-900/95 p-3">
            <Pressable onPress={() => openDetail(selected)} accessibilityLabel="Ver detalle">
              <Image source={{ uri: selected.uri }} className="h-20 w-20 rounded-lg" />
            </Pressable>
            <Pressable onPress={() => openDetail(selected)} className="flex-1 justify-center gap-1">
              <Text className="font-semibold text-white">
                {selected.favorite ? '★ ' : ''}
                {selected.note || (selected.source === 'gallery' ? 'Importada de galería' : 'Tomada con cámara')}
              </Text>
              <Text className="font-mono text-xs text-emerald-300">
                {selected.latitude!.toFixed(5)}, {selected.longitude!.toFixed(5)}
              </Text>
              <Text className="text-xs text-neutral-400">
                {selected.createdAt.toLocaleString('es-CO')} · Toca para ver detalle
              </Text>
            </Pressable>
            <Pressable
              onPress={() => confirmDelete(selected)}
              className="items-center justify-center px-2"
              accessibilityRole="button"
              accessibilityLabel="Eliminar foto"
            >
              <Ionicons name="trash-outline" size={22} color="#f87171" />
            </Pressable>
          </View>
        )}

        {/* Fotos sin ubicación: no tienen marcador, se listan aparte */}
        {photosWithoutLocation.length > 0 && (
          <View className="rounded-xl bg-neutral-900/95 p-3">
            <Text className="mb-2 text-sm font-semibold text-neutral-200">
              Sin ubicación ({photosWithoutLocation.length})
            </Text>
            <FlatList
              horizontal
              data={photosWithoutLocation}
              keyExtractor={(p) => String(p.id)}
              ItemSeparatorComponent={() => <View className="w-2" />}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => openDetail(item)}
                  onLongPress={() => confirmDelete(item)}
                  accessibilityLabel="Foto sin ubicación"
                >
                  <Image source={{ uri: item.uri }} className="h-14 w-14 rounded-lg" />
                  <View
                    className={`absolute -right-1 -top-1 h-3 w-3 rounded-full ${
                      item.source === 'gallery' ? 'bg-violet-500' : 'bg-emerald-500'
                    }`}
                  />
                </Pressable>
              )}
            />
            <Text className="mt-2 text-xs text-neutral-500">Toca para ver detalle · Mantén presionada para eliminar</Text>
          </View>
        )}
      </View>
    </View>
  );
}
