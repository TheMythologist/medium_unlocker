package expo.modules.savetodownloads

import android.content.ContentResolver
import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.annotation.RequiresApi
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

internal class UnsupportedApiLevelException :
    CodedException("Saving to the Downloads folder requires Android 10 or newer")

internal class SaveFailedException(message: String) : CodedException(message)

class SaveToDownloadsModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("SaveToDownloads")

        // MediaStore.Downloads only exists from API 29. Below that, callers fall
        // back to the folder picker, which those OS versions still allow to grant
        // the Download directory.
        Constants("isAvailable" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q))

        AsyncFunction("saveToDownloads") { sourceUri: String, filename: String, mimeType: String ->
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                throw UnsupportedApiLevelException()
            }
            saveViaMediaStore(sourceUri, filename, mimeType)
        }
    }

    /**
     * Copies a file into the public Downloads collection.
     *
     * MediaStore is the only way to write there under scoped storage: since
     * Android 11 the document-tree picker refuses to grant the Download
     * directory, and direct filesystem writes have been blocked since Android 10.
     * Nothing here needs a runtime permission.
     */
    @RequiresApi(Build.VERSION_CODES.Q)
    private fun saveViaMediaStore(
        sourceUri: String,
        filename: String,
        mimeType: String
    ): Map<String, String> {
        val context = appContext.reactContext
            ?: throw SaveFailedException("No application context")
        val resolver = context.contentResolver
        val source = fileFrom(sourceUri)
        if (!source.exists()) {
            throw SaveFailedException("The downloaded file is no longer in the cache")
        }

        // IS_PENDING hides the row until the bytes are actually written, so no
        // other app sees a half-complete file.
        val pending = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, filename)
            put(MediaStore.Downloads.MIME_TYPE, mimeType)
            put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            put(MediaStore.Downloads.IS_PENDING, 1)
        }

        val target = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, pending)
            ?: throw SaveFailedException("MediaStore refused to create the file")

        try {
            val output = resolver.openOutputStream(target)
                ?: throw SaveFailedException("Could not open the destination for writing")
            output.use { destination -> source.inputStream().use { it.copyTo(destination) } }

            resolver.update(
                target,
                ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) },
                null,
                null
            )
        } catch (error: Throwable) {
            // A pending row left behind is invisible to the user but still holds
            // the name, so clear it before surfacing the failure.
            resolver.delete(target, null, null)
            throw error
        }

        return mapOf(
            "uri" to target.toString(),
            "name" to displayNameOf(resolver, target, filename)
        )
    }

    private fun fileFrom(sourceUri: String): File =
        if (sourceUri.startsWith("file://")) {
            File(requireNotNull(Uri.parse(sourceUri).path) { "Malformed file URI" })
        } else {
            File(sourceUri)
        }

    /** MediaStore de-duplicates colliding names, so read back what it settled on. */
    @RequiresApi(Build.VERSION_CODES.Q)
    private fun displayNameOf(resolver: ContentResolver, uri: Uri, fallback: String): String {
        resolver.query(
            uri,
            arrayOf(MediaStore.Downloads.DISPLAY_NAME),
            null,
            null,
            null
        )?.use { cursor ->
            if (cursor.moveToFirst()) {
                val column = cursor.getColumnIndex(MediaStore.Downloads.DISPLAY_NAME)
                if (column >= 0) {
                    return cursor.getString(column) ?: fallback
                }
            }
        }
        return fallback
    }
}
