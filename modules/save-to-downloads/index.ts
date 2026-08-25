import { requireOptionalNativeModule } from 'expo-modules-core';

export interface SavedToDownloads {
  /** MediaStore content URI of the saved file. */
  uri: string;
  /** Name it was saved under. MediaStore de-duplicates colliding names. */
  name: string;
}

interface SaveToDownloadsNativeModule {
  /** False below Android 10, where `MediaStore.Downloads` does not exist. */
  isAvailable: boolean;
  saveToDownloads(sourceUri: string, filename: string, mimeType: string): Promise<SavedToDownloads>;
}

// Optional so non-Android platforms, which have no implementation, get null
// instead of a throw at import time.
const SaveToDownloadsModule =
  requireOptionalNativeModule<SaveToDownloadsNativeModule>('SaveToDownloads');

/** Whether the public Downloads folder can be written to without a picker. */
export const canSaveToDownloads: boolean = SaveToDownloadsModule?.isAvailable ?? false;

export function saveToDownloads(
  sourceUri: string,
  filename: string,
  mimeType: string,
): Promise<SavedToDownloads> {
  if (!SaveToDownloadsModule) {
    throw new Error('Saving to the Downloads folder is not supported on this platform');
  }
  return SaveToDownloadsModule.saveToDownloads(sourceUri, filename, mimeType);
}
