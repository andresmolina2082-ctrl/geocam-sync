// app/(tabs)/fotos.tsx
// C4: lista de fotos con buscador por nota y filtros por álbum y favoritas.
// También permite crear y borrar álbumes (C1).
import { useState, type ComponentProps } from 'react';
import { Alert, FlatList, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePhotoSearch, type AlbumFilter } from '@/hooks/usePhotoSearch';
import { useAlbums } from '@/hooks/useAlbums';
import { useAuth } from '@/context/AuthContext';
import { isPending } from '@/hooks/useSync';
import { SyncBadge } from '@/components/SyncBadge';

function Chip({
  label,
  active,
  onPress,
  onLongPress,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  icon?: ComponentProps<typeof Ionicons>['name'];
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      className={`flex-row items-center gap-1 rounded-full border px-3 py-1.5 ${
        active ? 'border-emerald-500 bg-emerald-500' : 'border-neutral-700'
      }`}
    >
      {icon && <Ionicons name={icon} size={14} color={active ? '#0a0a0a' : '#d4d4d4'} />}
      <Text className={active ? 'font-semibold text-neutral-950' : 'text-neutral-200'}>{label}</Text>
    </Pressable>
  );
}

export default function FotosScreen() {
  const [search, setSearch] = useState('');
  const [albumId, setAlbumId] = useState<AlbumFilter>(null);
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  const { results } = usePhotoSearch({ search, albumId, onlyFavorites });
  const { albums, createAlbum, removeAlbum } = useAlbums();
  const { session, signOut } = useAuth();

  const [creating, setCreating] = useState(false);
  const [newAlbum, setNewAlbum] = useState('');
  const [albumError, setAlbumError] = useState<string | null>(null);

  const submitAlbum = async () => {
    const error = await createAlbum(newAlbum);
    setAlbumError(error);
    if (!error) {
      setNewAlbum('');
      setCreating(false);
    }
  };

  const confirmRemoveAlbum = (id: number, name: string) => {
    Alert.alert(
      `Eliminar el álbum "${name}"`,
      'Las fotos no se borran: quedan sin álbum.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            if (albumId === id) setAlbumId(null);
            await removeAlbum(id);
          },
        },
      ]
    );
  };

  const hasFilters = search.trim() !== '' || albumId !== null || onlyFavorites;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-950">
      <View className="gap-3 px-4 pb-3 pt-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-white">Fotos</Text>
          <Pressable
            onPress={() =>
              Alert.alert('Cerrar sesión', session?.user.email ?? '', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Cerrar sesión', style: 'destructive', onPress: () => signOut() },
              ])
            }
            className="h-10 w-10 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Cerrar sesión"
          >
            <Ionicons name="log-out-outline" size={22} color="#a3a3a3" />
          </Pressable>
        </View>

        <SyncBadge />

        {/* Buscador por nota */}
        <View className="flex-row items-center gap-2 rounded-xl bg-neutral-900 px-3">
          <Ionicons name="search" size={18} color="#737373" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nota"
            placeholderTextColor="#737373"
            className="flex-1 py-2.5 text-white"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        {/* Filtros */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          <Chip
            label="Favoritas"
            icon="star"
            active={onlyFavorites}
            onPress={() => setOnlyFavorites((v) => !v)}
          />
          <Chip label="Todas" active={albumId === null} onPress={() => setAlbumId(null)} />
          <Chip label="Sin álbum" active={albumId === 'none'} onPress={() => setAlbumId('none')} />
          {albums.map((a) => (
            <Chip
              key={a.id}
              label={a.name}
              active={albumId === a.id}
              onPress={() => setAlbumId(a.id)}
              onLongPress={() => confirmRemoveAlbum(a.id, a.name)}
            />
          ))}
          <Chip label="Álbum" icon="add" active={false} onPress={() => setCreating((v) => !v)} />
        </ScrollView>

        {/* Crear álbum */}
        {creating && (
          <View className="gap-1">
            <View className="flex-row gap-2">
              <TextInput
                value={newAlbum}
                onChangeText={setNewAlbum}
                placeholder="Nombre del álbum"
                placeholderTextColor="#737373"
                className="flex-1 rounded-xl bg-neutral-900 px-3 py-2.5 text-white"
                autoFocus
                onSubmitEditing={submitAlbum}
                returnKeyType="done"
              />
              <Pressable onPress={submitAlbum} className="justify-center rounded-xl bg-emerald-500 px-4">
                <Text className="font-semibold text-neutral-950">Crear</Text>
              </Pressable>
            </View>
            {albumError && <Text className="text-xs text-red-400">{albumError}</Text>}
          </View>
        )}
        {albums.length > 0 && (
          <Text className="text-xs text-neutral-500">Mantén presionado un álbum para eliminarlo</Text>
        )}
      </View>

      <FlatList
        data={results}
        keyExtractor={(p) => String(p.id)}
        numColumns={3}
        contentContainerClassName="px-3 pb-8"
        columnWrapperClassName="gap-1.5"
        ItemSeparatorComponent={() => <View className="h-1.5" />}
        ListEmptyComponent={
          <Text className="mt-10 px-8 text-center text-neutral-400">
            {hasFilters ? 'Ninguna foto coincide con la búsqueda.' : 'Aún no hay fotos. Toma una en GeoCam.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            className="aspect-square flex-1"
            style={{ maxWidth: '33%' }}
            onPress={() => router.push({ pathname: '/foto/[id]', params: { id: String(item.id) } })}
            accessibilityLabel={item.note ?? 'Foto'}
          >
            <Image source={{ uri: item.uri }} className="h-full w-full rounded-lg bg-neutral-900" />
            {/* Nube: sincronizada (azul) o pendiente de subir (ámbar) */}
            <View className="absolute left-1 top-1">
              <Ionicons
                name={isPending(item) ? 'cloud-upload' : 'cloud-done'}
                size={16}
                color={isPending(item) ? '#fbbf24' : '#38bdf8'}
              />
            </View>
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
        )}
      />
    </SafeAreaView>
  );
}
