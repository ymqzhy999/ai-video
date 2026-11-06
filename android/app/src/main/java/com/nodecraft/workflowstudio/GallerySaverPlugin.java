package com.nodecraft.workflowstudio;

import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

@CapacitorPlugin(name = "GallerySaver")
public class GallerySaverPlugin extends Plugin {

    @PluginMethod
    public void saveImage(PluginCall call) {
        String base64 = call.getString("base64");
        String fileName = call.getString("fileName", "comfyui-" + System.currentTimeMillis() + ".png");
        String mimeType = call.getString("mimeType", "image/png");

        if (base64 == null || base64.isEmpty()) {
            call.reject("Missing image data");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Saving directly to the gallery requires Android 10 or newer");
            return;
        }

        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            Context context = getContext();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
            values.put(MediaStore.Images.Media.MIME_TYPE, mimeType);
            values.put(
                MediaStore.Images.Media.RELATIVE_PATH,
                Environment.DIRECTORY_PICTURES + "/ComfyUI Studio"
            );
            values.put(MediaStore.Images.Media.IS_PENDING, 1);

            Uri uri = context.getContentResolver().insert(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                values
            );
            if (uri == null) {
                call.reject("Could not create a gallery entry");
                return;
            }

            try (OutputStream output = context.getContentResolver().openOutputStream(uri)) {
                if (output == null) {
                    call.reject("Could not open the gallery file");
                    return;
                }
                output.write(bytes);
                output.flush();
            }

            ContentValues ready = new ContentValues();
            ready.put(MediaStore.Images.Media.IS_PENDING, 0);
            context.getContentResolver().update(uri, ready, null, null);

            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            result.put("path", "Pictures/ComfyUI Studio/" + fileName);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Failed to save image: " + error.getMessage());
        }
    }
}
