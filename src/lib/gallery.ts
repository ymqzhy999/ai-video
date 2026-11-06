import { Capacitor, registerPlugin } from '@capacitor/core';

interface GallerySaverPlugin {
  saveImage(options: {
    base64: string;
    fileName: string;
    mimeType: string;
  }): Promise<{ uri: string; path: string }>;
}

const gallerySaver = registerPlugin<GallerySaverPlugin>('GallerySaver');

export async function saveBase64ToGallery(
  base64: string,
  fileName: string,
  mimeType: string,
): Promise<{ path: string }> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    throw new Error('Gallery save is only available in the Android app');
  }
  return gallerySaver.saveImage({ base64, fileName, mimeType });
}
