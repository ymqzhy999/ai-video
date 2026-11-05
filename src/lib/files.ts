import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { downloadBlob, safeFilename } from './format';

export type FileDelivery = {
  kind: 'downloaded' | 'shared' | 'cancelled';
  message: string;
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('无法读取导出文件'));
    reader.readAsDataURL(blob);
  });
}

/**
 * On the web we use a regular browser download. Inside the Capacitor app an
 * anchor download is not handled by the Android WebView, so we write the file
 * into the app cache and open the native share sheet. The user can choose
 * "Files" / "Save to files" to put it in Downloads or another folder.
 */
export async function deliverFile(blob: Blob, filename: string): Promise<FileDelivery> {
  if (!Capacitor.isNativePlatform()) {
    downloadBlob(blob, filename);
    return {
      kind: 'downloaded',
      message: '文件已下载到浏览器的下载目录。',
    };
  }

  const safeName = safeFilename(filename, 'comfyui-export');
  const path = `exports/${safeName}`;
  const base64 = await blobToBase64(blob);
  await Filesystem.writeFile({
    path,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });

  try {
    await Share.share({
      title: safeName,
      files: [uri],
      dialogTitle: '保存或分享文件',
    });
    return {
      kind: 'shared',
      message: '已打开系统分享面板。选择「文件」或「保存到文件」即可保存，JSON 通常在 Downloads 目录。',
    };
  } catch (error) {
    if (error instanceof Error && /cancel/i.test(error.message)) {
      return {
        kind: 'cancelled',
        message: '已取消分享。可以再次导出并选择「文件」保存。',
      };
    }
    throw error;
  }
}

export async function deliverText(
  text: string,
  filename: string,
  mime = 'application/json',
): Promise<FileDelivery> {
  return deliverFile(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}
