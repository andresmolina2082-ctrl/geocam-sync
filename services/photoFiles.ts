// services/photoFiles.ts
// C5: las fotos se copian de la caché (que el sistema puede borrar) a la carpeta
// de documentos de la app, que solo se borra al desinstalar.
//
// API nueva de expo-file-system (clases File, Directory y Paths). La API anterior
// (FileSystem.copyAsync, documentDirectory...) quedó en 'expo-file-system/legacy'.
// No mezclar las dos: es una alucinación frecuente de la IA.
import { Directory, File, Paths } from 'expo-file-system';
import { signedUrl } from '@/services/cloudPhotos';

const photosDir = new Directory(Paths.document, 'photos');

function ensureDir() {
  if (!photosDir.exists) photosDir.create({ idempotent: true, intermediates: true });
}

/** Indica si una uri ya está dentro de la carpeta permanente. */
export function isPersisted(uri: string) {
  return uri.startsWith(photosDir.uri);
}

/** Copia la foto a documentos/photos y devuelve la nueva uri permanente. */
export async function persistPhoto(sourceUri: string): Promise<string> {
  if (isPersisted(sourceUri)) return sourceUri;
  ensureDir();
  const extension = sourceUri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const name = `${Date.now()}-${Math.round(Math.random() * 1e6)}.${extension}`;
  const destination = new File(photosDir, name);
  // En SDK 56 copy() es asíncrono (existe copySync para la versión síncrona)
  await new File(sourceUri).copy(destination);
  return destination.uri;
}

/** Borra el archivo si existe. Nunca lanza: un archivo faltante no debe romper el borrado del registro. */
export function deletePhotoFile(uri: string) {
  try {
    if (!isPersisted(uri)) return; // no borramos archivos fuera de nuestra carpeta
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (e) {
    if (__DEV__) console.warn('[photoFiles] no se pudo borrar', uri, e);
  }
}

/** Borra toda la carpeta de fotos (se usa al vaciar GeoCam). */
export function deleteAllPhotoFiles() {
  try {
    if (photosDir.exists) photosDir.delete();
  } catch (e) {
    if (__DEV__) console.warn('[photoFiles] no se pudo vaciar la carpeta', e);
  }
}

/** Semana 9: descarga a la carpeta permanente el archivo de una foto que vino de la nube. */
export async function downloadPhotoFile(storagePath: string, clientId: string): Promise<string> {
  ensureDir();
  const destination = new File(photosDir, `${clientId}.jpg`);
  if (destination.exists) return destination.uri;
  const url = await signedUrl(storagePath); // el bucket es privado
  const file = await File.downloadFileAsync(url, destination);
  return file.uri;
}
