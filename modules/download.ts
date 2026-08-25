import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import { fetch } from 'expo/fetch';
import { Directory, File, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import { startActivityAsync } from 'expo-intent-launcher';

import { canSaveToDownloads, saveToDownloads } from '@/modules/save-to-downloads';

const RFC5987_FILENAME = /filename\*=\s*UTF-8''([^;]+)/i;
const PLAIN_FILENAME = /filename=\s*"?([^";]+)"?/i;
// Path separators plus the characters Android and other filesystems reject. Spaces
// and hyphens are left alone: the server already sends a slugged, readable name.
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]+/g;
const CONTROL_CHARS = /[\x00-\x1f]+/g;
const MAX_FILENAME_LENGTH = 128;

const SAVE_DIRECTORY_STORAGE_KEY = 'downloadDirectoryUri';
const saveDirectoryStorage = createAsyncStorage(SAVE_DIRECTORY_STORAGE_KEY);

const ANDROID_ACTION_VIEW = 'android.intent.action.VIEW';
const FLAG_GRANT_READ_URI_PERMISSION = 0x00000001;

export interface DownloadRequest {
  /** Absolute URL to POST to. */
  url: string;
  /** Verbatim request body captured from the page, so the request replays exactly. */
  body: string;
  /** Filename to fall back on when the response carries no `content-disposition`. */
  fallbackFilename: string;
  /**
   * The WebView's user agent. Cloudflare binds its `cf_clearance` cookie to the
   * agent it was issued to, so replaying the request with the default native
   * agent would look like a different client and get challenged.
   */
  userAgent?: string;
  referer?: string;
  cookie?: string;
}

export interface DownloadedFile {
  uri: string;
  filename: string;
  mimeType: string;
}

export interface SavedFile {
  /** The cache copy, kept so the file can be opened via the app's own FileProvider. */
  cached: DownloadedFile;
  /** Document URI of the permanent copy in the user's chosen folder. */
  savedUri: string;
  /** Name the file was saved under. The picker may de-duplicate it on collision. */
  savedName: string;
}

function sanitiseFilename(name: string): string | null {
  const cleaned = name
    .replace(CONTROL_CHARS, '')
    .replace(INVALID_FILENAME_CHARS, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, MAX_FILENAME_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

function parseFilename(header: string | null): string | null {
  if (!header) return null;

  const encoded = header.match(RFC5987_FILENAME);
  if (encoded) {
    try {
      return sanitiseFilename(decodeURIComponent(encoded[1].trim()));
    } catch {
      // Malformed percent-encoding: fall through to the plain parameter.
    }
  }

  const plain = header.match(PLAIN_FILENAME);
  return plain ? sanitiseFilename(plain[1].trim()) : null;
}

/**
 * True when the user backed out of the folder picker, which is a normal outcome
 * rather than a failure worth reporting as one.
 */
export function isPickerCancelled(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (code === 'ERR_PICKER_CANCELLED') return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && /cancell?ed/i.test(message);
}

/**
 * Replays a page-initiated download request natively and writes the response
 * into the cache directory.
 *
 * Android WebView drops `blob:` downloads on the floor: it never routes them to
 * its `DownloadListener` and ignores the `download` attribute, so anything the
 * page builds client-side has to be re-fetched out here to reach the filesystem.
 */
export async function downloadToCache(request: DownloadRequest): Promise<DownloadedFile> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: '*/*',
  };
  if (request.userAgent) headers['user-agent'] = request.userAgent;
  if (request.referer) headers.referer = request.referer;
  if (request.cookie) headers.cookie = request.cookie;

  const response = await fetch(request.url, {
    method: 'POST',
    headers,
    body: request.body,
  });
  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error('Server returned an empty file');
  }

  const disposition = response.headers.get('content-disposition');
  const filename = parseFilename(disposition) ?? request.fallbackFilename;
  const mimeType = (response.headers.get('content-type') ?? 'application/octet-stream')
    .split(';')[0]
    .trim();

  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true, intermediates: true });
  file.write(bytes);

  return { uri: file.uri, filename, mimeType };
}

/**
 * Resolves the folder downloads are saved into, prompting for one the first time.
 *
 * The picker takes a persistable permission on the chosen tree, so remembering
 * its URI is enough to keep every later download prompt-free.
 */
async function resolveSaveDirectory(): Promise<Directory> {
  const rememberedUri = await saveDirectoryStorage.getItem(SAVE_DIRECTORY_STORAGE_KEY);
  if (rememberedUri) {
    const remembered = new Directory(rememberedUri);
    try {
      if (remembered.exists) return remembered;
    } catch {
      // The grant is gone (folder deleted, storage unmounted, permission
      // revoked), so fall through and ask for a folder again.
    }
  }

  const picked = await Directory.pickDirectoryAsync();
  await saveDirectoryStorage.setItem(SAVE_DIRECTORY_STORAGE_KEY, picked.uri);
  return picked;
}

/**
 * Saves a downloaded file where the user can find it again.
 *
 * The public Downloads folder is only reachable through MediaStore: direct
 * filesystem writes have been blocked since Android 10, and since Android 11 the
 * document-tree picker refuses to grant the Download directory at all. So
 * MediaStore is used wherever it exists (Android 10+, no permission, no prompt),
 * and older versions fall back to picking a folder once.
 */
export async function saveDownload(file: DownloadedFile): Promise<SavedFile> {
  if (canSaveToDownloads) {
    const saved = await saveToDownloads(file.uri, file.filename, file.mimeType);
    return { cached: file, savedUri: saved.uri, savedName: saved.name };
  }
  return saveToPickedFolder(file);
}

/** Copies a downloaded file out of the cache into a folder the user picks. */
async function saveToPickedFolder(file: DownloadedFile): Promise<SavedFile> {
  const directory = await resolveSaveDirectory();
  const bytes = new File(file.uri).bytesSync();
  const saved = directory.createFile(file.filename, file.mimeType);
  saved.write(bytes);

  return { cached: file, savedUri: saved.uri, savedName: file.filename };
}

/**
 * Opens a downloaded file in whichever app handles its type.
 *
 * Android only, which is where the `blob:` download this works around is broken.
 * The intent points at the cache copy rather than the saved one because that URI
 * is served by the app's own FileProvider, so the read grant is ours to hand out.
 * Elsewhere `startActivityAsync` rejects and the caller reports it.
 */
export async function openFile(file: DownloadedFile): Promise<void> {
  const contentUri = await getContentUriAsync(file.uri);
  await startActivityAsync(ANDROID_ACTION_VIEW, {
    data: contentUri,
    type: file.mimeType,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
  });
}
