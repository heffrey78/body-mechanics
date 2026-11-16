package io.github.heffrey78.bodymechanics.android

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
class TimerArgs {
    /** "hold" (counts up, cues at the target) or "rest" (counts down, cues at 0 and ends). */
    lateinit var kind: String
    lateinit var label: String
    var targetSeconds: Int = 0
    var elapsedSeconds: Int = 0
}

/** Body Mechanics' Android plugin (#22): starts and stops the timer service. */
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
}
