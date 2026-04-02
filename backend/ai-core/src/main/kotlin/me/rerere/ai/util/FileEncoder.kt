package me.rerere.ai.util

import me.rerere.ai.ui.UIMessagePart
import java.io.File
import java.util.Base64

data class EncodedImage(
    val base64: String,
    val mimeType: String
)

fun UIMessagePart.Image.encodeBase64(withPrefix: Boolean = true): Result<EncodedImage> = runCatching {
    when {
        url.startsWith("file://") -> {
            val filePath = url.removePrefix("file://")
            val file = File(filePath)
            if (!file.exists()) {
                throw IllegalArgumentException("File does not exist: $url")
            }
            val mimeType = file.guessMimeType().getOrThrow()
            val encoded = file.encodeToBase64()
            EncodedImage(
                base64 = if (withPrefix) "data:$mimeType;base64,$encoded" else encoded,
                mimeType = mimeType
            )
        }

        url.startsWith("data:") -> {
            val mimeType = url.substringAfter("data:").substringBefore(";")
            EncodedImage(base64 = url, mimeType = mimeType)
        }

        url.startsWith("http") -> {
            EncodedImage(base64 = url, mimeType = "image/png")
        }

        else -> throw IllegalArgumentException("Unsupported URL format: $url")
    }
}

fun UIMessagePart.Video.encodeBase64(withPrefix: Boolean = true): Result<String> = runCatching {
    when {
        url.startsWith("file://") -> {
            val filePath = url.removePrefix("file://")
            val file = File(filePath)
            if (!file.exists()) {
                throw IllegalArgumentException("File does not exist: $url")
            }
            val encoded = file.encodeToBase64()
            if (withPrefix) "data:video/mp4;base64,$encoded" else encoded
        }

        else -> throw IllegalArgumentException("Unsupported URL format: $url")
    }
}

fun UIMessagePart.Audio.encodeBase64(withPrefix: Boolean = true): Result<String> = runCatching {
    when {
        url.startsWith("file://") -> {
            val filePath = url.removePrefix("file://")
            val file = File(filePath)
            if (!file.exists()) {
                throw IllegalArgumentException("File does not exist: $url")
            }
            val encoded = file.encodeToBase64()
            if (withPrefix) "data:audio/mp3;base64,$encoded" else encoded
        }

        else -> throw IllegalArgumentException("Unsupported URL format: $url")
    }
}

private fun File.encodeToBase64(): String {
    return Base64.getEncoder().encodeToString(readBytes())
}

private fun File.guessMimeType(): Result<String> = runCatching {
    inputStream().use { input ->
        val bytes = ByteArray(16)
        val read = input.read(bytes)
        if (read < 12) error("File too short to determine MIME type")

        if (bytes.copyOfRange(4, 12).toString(Charsets.US_ASCII) == "ftypheic") {
            return@runCatching "image/heic"
        }

        if (bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte()) {
            return@runCatching "image/jpeg"
        }

        if (bytes.copyOfRange(0, 8).contentEquals(
                byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
            )
        ) {
            return@runCatching "image/png"
        }

        if (bytes.copyOfRange(0, 4).toString(Charsets.US_ASCII) == "RIFF" &&
            bytes.copyOfRange(8, 12).toString(Charsets.US_ASCII) == "WEBP"
        ) {
            return@runCatching "image/webp"
        }

        val header = bytes.copyOfRange(0, 6).toString(Charsets.US_ASCII)
        if (header == "GIF89a" || header == "GIF87a") {
            return@runCatching "image/gif"
        }

        error("Failed to guess MIME type: $header")
    }
}