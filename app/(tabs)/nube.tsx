// app/(tabs)/nube.tsx
// Feed paginado de la nube (TanStack Query · useInfiniteQuery).
// Cada estado de UI sale de getFeedView (lib/feedView.ts), probado en tests/feedView.test.ts.
import { useState, type ComponentProps } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { findLocalPhotoId, useCloudFeed } from '@/hooks/useCloudFeed';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { SyncBadge } from '@/components/SyncBadge';
import type { CloudPhoto } from '@/services/cloudFeed';

function Message({
  icon,
  title,
  detail,
  action,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  detail?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View className="mt-16 items-center gap-3 px-8">
      <Ionicons name={icon} size={40} color="#525252" />
      <Text className="text-center text-base font-semibold text-neutral-200">{title}</Text>
      {detail && <Text className="text-center text-sm text-neutral-400">{detail}</Text>}
      {action && (
        <Pressable
          onPress={action.onPress}
          className="mt-1 rounded-full bg-emerald-500 px-5 py-2.5"
          accessibilityRole="button"
        >
          <Text className="font-semibold text-neutral-950">{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function NubeScreen() {
  const [search, setSearch] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const debouncedSearch = useDebouncedValue(search);

  const feed = useCloudFeed({ search: debouncedSearch, onlyFavorites });
  const { view } = feed;

  // Tocar una foto: si ya está en este teléfono se abre su detalle
  const openPhoto = async (item: CloudPhoto) => {
    const localId = await findLocalPhotoId(item.client_id);
    if (localId !== null) {
      router.push({ pathname: '/foto/[id]', params: { id: String(localId) } });
    } else {
      Alert.alert(
        'Aún no está en este teléfono',
        'Se descargará en la próxima sincronización.'
      );
    }
  };

  const renderItem = ({ item }: { item: CloudPhoto }) => (
    <Pressable
      className="aspect-square flex-1"
      style={{ maxWidth: '33%' }}
      onPress={() => openPhoto(item)}
      accessibilityLabel={item.note ?? 'Foto en la nube'}
    >
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} className="h-full w-full rounded-lg bg-neutral-900" />
      ) : (
        // Estado: la fila existe pero el archivo no se pudo firmar
        <View className="h-full w-full items-center justify-center rounded-lg bg-neutral-900">
          <Ionicons name="image-outline" size={22} color="#525252" />
        </View>
      )}
      {item.favorite && (
        <View className="absolute right-1 top-1">
          <Ionicons name="star" size={16} color="#facc15" />
        </View>
      )}
      {item.note && (
        <Text
          numberOfLines={1}
          className="absolute bottom-0 left-0 right-0 rounded-b-lg bg-black/60 px-1.5 py-0.5 text-[10px] text-white"
        >
          {item.note}
        </Text>
      )}
    </Pressable>
  );

  const footer = (() => {
    switch (view.footer) {
      case 'loading-more':
        return <ActivityIndicator className="my-6" color="#10b981" />;
      case 'load-more-error':
        return (
          <Pressable onPress={feed.retryNextPage} className="my-4 items-center gap-1" accessibilityRole="button">
            <Text className="text-sm text-red-400">No se pudieron cargar más fotos.</Text>
            <Text className="text-sm font-semibold text-emerald-400">Toca para reintentar</Text>
          </Pressable>
        );
      case 'paused':
        return <Text className="my-6 text-center text-xs text-neutral-500">Conéctate para ver más fotos.</Text>;
      case 'end':
        return <Text className="my-6 text-center text-xs text-neutral-500">No hay más fotos en la nube.</Text>;
      default:
        return null;
    }
  })();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-950">
      <View className="gap-3 px-4 pb-3 pt-2">
        <Text className="text-2xl font-bold text-white">Nube</Text>
        <SyncBadge />

        <View className="flex-row items-center gap-2">
          <View className="flex-1 flex-row items-center gap-2 rounded-xl bg-neutral-900 px-3">
            <Ionicons name="search" size={18} color="#737373" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar por nota en la nube"
              placeholderTextColor="#737373"
              className="flex-1 py-2.5 text-white"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
          <Pressable
            onPress={() => setOnlyFavorites((v) => !v)}
            className={`h-11 w-11 items-center justify-center rounded-xl ${
              onlyFavorites ? 'bg-emerald-500' : 'bg-neutral-900'
            }`}
            accessibilityRole="button"
            accessibilityLabel="Solo favoritas"
            accessibilityState={{ selected: onlyFavorites }}
          >
            <Ionicons name="star" size={18} color={onlyFavorites ? '#0a0a0a' : '#a3a3a3'} />
          </Pressable>
        </View>
      </View>

      {/* Avisos sobre la lista: no la tapan */}
      {view.banner === 'offline' && (
        <Text className="bg-amber-400/15 px-4 py-2 text-center text-xs text-amber-300">
          Sin conexión. Se muestra lo último que se cargó.
        </Text>
      )}
      {view.banner === 'refresh-error' && (
        <Pressable onPress={feed.refresh} accessibilityRole="button">
          <Text className="bg-red-500/15 px-4 py-2 text-center text-xs text-red-300">
            No se pudo actualizar · toca para reintentar
          </Text>
        </Pressable>
      )}

      {view.body === 'loading' && <ActivityIndicator className="mt-16" color="#10b981" />}

      {view.body === 'offline-empty' && (
        <Message
          icon="cloud-offline-outline"
          title="Sin conexión"
          detail="Conéctate a internet para ver tus fotos en la nube. Se cargarán solas."
        />
      )}

      {view.body === 'error' && (
        <Message
          icon="alert-circle-outline"
          title="No se pudo cargar la nube"
          detail={feed.error?.message}
          action={{ label: 'Reintentar', onPress: feed.refresh }}
        />
      )}

      {(view.body === 'list' || view.body === 'empty' || view.body === 'empty-search') && (
        <FlatList
          data={feed.photos}
          keyExtractor={(p) => p.client_id}
          renderItem={renderItem}
          numColumns={3}
          contentContainerClassName="px-3 pb-8"
          columnWrapperClassName="gap-1.5"
          ItemSeparatorComponent={() => <View className="h-1.5" />}
          ListEmptyComponent={
            view.body === 'empty-search' ? (
              <Message icon="search-outline" title="Ninguna foto coincide" detail="Prueba con otra búsqueda." />
            ) : (
              <Message
                icon="cloud-outline"
                title="Tu nube está vacía"
                detail="Toma una foto en GeoCam: se subirá sola cuando haya conexión."
              />
            )
          }
          ListFooterComponent={footer}
          // Deslizar hacia abajo para refrescar
          refreshing={feed.isRefreshing}
          onRefresh={feed.refresh}
          // Infinite scroll
          onEndReachedThreshold={0.5}
          onEndReached={feed.loadMore}
        />
      )}
    </SafeAreaView>
  );
}
