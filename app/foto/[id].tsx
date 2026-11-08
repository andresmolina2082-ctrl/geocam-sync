// app/foto/[id].tsx
// C3: ver una foto, editar su nota, marcarla como favorita, moverla de álbum y eliminarla.
import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePhoto } from '@/hooks/usePhoto';
import { usePhotos } from '@/hooks/usePhotos';
import { useAlbums } from '@/hooks/useAlbums';
import { isPending, useSync } from '@/hooks/useSync';

export default function PhotoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const photoId = Number(id);

  const { photo, isLoading } = usePhoto(photoId);
  const { updatePhoto, removePhoto } = usePhotos();
  const { albums } = useAlbums();
  const sync = useSync();

  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Cargar la nota guardada cuando llega la foto (o cambia de foto)
  useEffect(() => {
    setNote(photo?.note ?? '');
    // Solo al cambiar de foto: si dependiera de photo.note, se perdería lo que el usuario escribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo?.id]);

  if (isLoading) {
    return <View className="flex-1 bg-neutral-950" />;
  }

  if (!photo) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-950 px-8">
        <Text className="text-center text-neutral-300">Esta foto ya no existe.</Text>
      </View>
    );
  }

  const noteChanged = note.trim() !== (photo.note ?? '');
  const hasLocation = photo.latitude != null && photo.longitude != null;

  const saveNote = async () => {
    setSaving(true);
    try {
      await updatePhoto(photo.id, { note: note.trim() || null });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert('Eliminar foto', 'Se borrará de este teléfono, de la nube y de tus otros teléfonos al sincronizar.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await removePhoto(photo.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-neutral-950"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView contentContainerClassName="gap-5 p-4 pb-12" keyboardShouldPersistTaps="handled">
        <Image
          source={{ uri: photo.uri }}
          className="aspect-square w-full rounded-xl bg-neutral-900"
          resizeMode="cover"
        />

        {/* Datos y favorita */}
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="font-semibold text-white">
              {photo.source === 'gallery' ? 'Importada de galería' : 'Tomada con cámara'}
            </Text>
            <Text className="font-mono text-xs text-emerald-300">
              {hasLocation
                ? `${photo.latitude!.toFixed(5)}, ${photo.longitude!.toFixed(5)}`
                : 'Sin ubicación'}
            </Text>
            <Text className="text-xs text-neutral-400">{photo.createdAt.toLocaleString('es-CO')}</Text>
          </View>
          <Pressable
            onPress={() => updatePhoto(photo.id, { favorite: !photo.favorite })}
            className="h-11 w-11 items-center justify-center rounded-full bg-neutral-900"
            accessibilityRole="button"
            accessibilityLabel={photo.favorite ? 'Quitar de favoritas' : 'Marcar como favorita'}
          >
            <Ionicons
              name={photo.favorite ? 'star' : 'star-outline'}
              size={24}
              color={photo.favorite ? '#facc15' : '#a3a3a3'}
            />
          </Pressable>
        </View>

        {/* Nota */}
        <View className="gap-2">
          <Text className="text-sm font-semibold text-neutral-200">Nota</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Escribe algo sobre esta foto"
            placeholderTextColor="#737373"
            multiline
            className="min-h-20 rounded-xl bg-neutral-900 p-3 text-white"
            textAlignVertical="top"
          />
          <Pressable
            onPress={saveNote}
            disabled={!noteChanged || saving}
            className={`items-center rounded-xl p-3 ${noteChanged ? 'bg-emerald-500' : 'bg-neutral-800'}`}
            accessibilityRole="button"
          >
            <Text className={noteChanged ? 'font-semibold text-neutral-950' : 'text-neutral-500'}>
              {saving ? 'Guardando…' : 'Guardar nota'}
            </Text>
          </Pressable>
        </View>

        {/* Álbum */}
        <View className="gap-2">
          <Text className="text-sm font-semibold text-neutral-200">Álbum</Text>
          <View className="flex-row flex-wrap gap-2">
            {[{ id: null as number | null, name: 'Sin álbum' }, ...albums].map((album) => {
              const selected = photo.albumId === album.id;
              return (
                <Pressable
                  key={album.id ?? 'none'}
                  onPress={() => updatePhoto(photo.id, { albumId: album.id })}
                  className={`rounded-full border px-4 py-2 ${
                    selected ? 'border-emerald-500 bg-emerald-500' : 'border-neutral-700'
                  }`}
                >
                  <Text className={selected ? 'font-semibold text-neutral-950' : 'text-neutral-200'}>
                    {album.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {albums.length === 0 && (
            <Text className="text-xs text-neutral-500">Crea álbumes desde la pestaña Fotos.</Text>
          )}
        </View>

        {/* Nube (Semana 9): estado de sincronización de esta foto */}
        <View className="gap-2">
          <Text className="text-sm font-semibold text-neutral-200">Nube</Text>
          {isPending(photo) ? (
            <Pressable
              onPress={() => sync.syncNow()}
              disabled={!sync.isOnline || sync.isSyncing}
              className="flex-row items-center gap-2 rounded-xl bg-neutral-900 p-3"
              accessibilityRole="button"
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#fbbf24" />
              <Text className="flex-1 text-neutral-200">
                {sync.isSyncing
                  ? 'Sincronizando…'
                  : sync.isOnline
                    ? 'Pendiente de subir · toca para sincronizar'
                    : 'Pendiente · se subirá al volver la conexión'}
              </Text>
            </Pressable>
          ) : (
            <View className="flex-row items-center gap-2 rounded-xl bg-neutral-900 p-3">
              <Ionicons name="cloud-done-outline" size={18} color="#10b981" />
              <Text className="flex-1 text-neutral-200">Sincronizada</Text>
            </View>
          )}
          {sync.error && <Text className="text-xs text-red-400">{sync.error.message}</Text>}
        </View>

        {/* Eliminar */}
        <Pressable
          onPress={confirmDelete}
          className="flex-row items-center justify-center gap-2 rounded-xl border border-red-500/60 p-3"
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={18} color="#f87171" />
          <Text className="font-semibold text-red-400">Eliminar foto</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
