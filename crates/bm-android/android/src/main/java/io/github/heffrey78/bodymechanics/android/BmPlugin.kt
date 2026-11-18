package io.github.heffrey78.bodymechanics.android

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@InvokeArg
class TimerArgs {
    /** "hold" (counts up, cues at the target) or "rest" (counts down, cues at 0 and ends). */
    lateinit var kind: String
    lateinit var label: String
    var targetSeconds: Int = 0
    var elapsedSeconds: Int = 0
}

@InvokeArg
class BytesArgs {
    /** Base64. */
    lateinit var data: String
}

/**
 * Body Mechanics' Android plugin: starts and stops the timer service (#22), and seals and opens
 * secrets with an AES key that lives in Android's keystore and can't leave it (#25; as writer's).
 */
@TauriPlugin
class BmPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun startTimer(invoke: Invoke) {
        val args = invoke.parseArgs(TimerArgs::class.java)
        // Android 13+: the timer's notification needs the permission. Asked once; the timer runs
        // (and cues) either way, only its notification is hidden without it.
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 22)
        }
        val intent = Intent(activity, TimerService::class.java).apply {
            action = TimerService.START
            putExtra("kind", args.kind)
            putExtra("label", args.label)
            putExtra("target", args.targetSeconds)
            putExtra("elapsed", args.elapsedSeconds)
        }
        ContextCompat.startForegroundService(activity, intent)
        invoke.resolve()
    }

    @Command
    fun stopTimer(invoke: Invoke) {
        activity.stopService(Intent(activity, TimerService::class.java))
        invoke.resolve()
    }

    @Command
    fun seal(invoke: Invoke) = answer(invoke) { plain ->
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.iv + cipher.doFinal(plain)
    }

    @Command
    fun open(invoke: Invoke) = answer(invoke) { sealed ->
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key(create = false), GCMParameterSpec(128, sealed, 0, NONCE))
        cipher.doFinal(sealed, NONCE, sealed.size - NONCE)
    }

    private fun answer(invoke: Invoke, work: (ByteArray) -> ByteArray) {
        try {
            val bytes = Base64.decode(invoke.parseArgs(BytesArgs::class.java).data, Base64.NO_WRAP)
            invoke.resolve(JSObject().put("data", Base64.encodeToString(work(bytes), Base64.NO_WRAP)))
        } catch (e: Exception) {
            invoke.reject(e.message ?: e.javaClass.simpleName)
        }
    }

    /** The app's key: made in the keystore the first time, and never leaving it. */
    private fun key(create: Boolean = true): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getKey(ALIAS, null) as SecretKey?)?.let { return it }
        if (!create) throw IllegalStateException("The key that sealed this is gone.")
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    companion object {
        private const val KEYSTORE = "AndroidKeyStore"
        private const val ALIAS = "bodymechanics-secrets"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val NONCE = 12
    }
}
