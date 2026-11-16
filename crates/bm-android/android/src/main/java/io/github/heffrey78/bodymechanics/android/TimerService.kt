package io.github.heffrey78.bodymechanics.android

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat

/**
 * A hold or rest timer that keeps running with the screen locked (#22). While it runs: a foreground
 * notification whose clock Android ticks itself (a chronometer, counting down for a rest), and a
 * partial wake lock so the cue comes on time. At the target: a vibration, and the notification sound
 * unless the phone is on silent or vibrate. A rest ends itself at 0; a hold runs until it's stopped.
 */
class TimerService : Service() {
    companion object {
        const val START = "io.github.heffrey78.bodymechanics.timer.START"
        private const val CHANNEL = "timers"
        private const val NOTIFICATION = 22
    }

    private val handler = Handler(Looper.getMainLooper())
    private var wakeLock: PowerManager.WakeLock? = null
    private var pendingCue: Runnable? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action != START) {
            stopSelf()
            return START_NOT_STICKY
        }
        val kind = intent.getStringExtra("kind") ?: "hold"
        val label = intent.getStringExtra("label") ?: "Timer"
        val target = intent.getIntExtra("target", 0).coerceAtLeast(0)
        val elapsed = intent.getIntExtra("elapsed", 0).coerceAtLeast(0)
        val startedAt = System.currentTimeMillis() - elapsed * 1000L
        val rest = kind == "rest"

        val notification = notification(label, rest, target, startedAt)
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION, notification)
        }

        // Awake until the cue and a while after (a hold may go past its target), never forever.
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "bodymechanics:timer")
            .apply { acquire((target + 600) * 1000L) }

        pendingCue?.let(handler::removeCallbacks)
        val remaining = (target - elapsed) * 1000L
        if (target > 0 && remaining > 0) {
            val cue = Runnable {
                cue()
                if (rest) stopSelf()
            }
            pendingCue = cue
            handler.postDelayed(cue, remaining)
        }
        return START_NOT_STICKY
    }

    private fun notification(label: String, rest: Boolean, target: Int, startedAt: Long): Notification {
        val manager = getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL) == null) {
            // Low importance: the ongoing notification is silent; the cue makes its own sound.
            manager.createNotificationChannel(NotificationChannel(CHANNEL, "Timers", NotificationManager.IMPORTANCE_LOW))
        }
        val open = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        }
        val tap = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val text = if (rest) "Rest" else "Hold · target ${target / 60}:${"%02d".format(target % 60)}"
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(label)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setUsesChronometer(true)
            .setChronometerCountDown(rest)
            .setWhen(if (rest) startedAt + target * 1000L else startedAt)
            .setContentIntent(tap)
            .build()
    }

    private fun cue() {
        val pattern = longArrayOf(0, 400, 200, 400)
        val vibrator = if (Build.VERSION.SDK_INT >= 31) {
            (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
        val audio = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (audio.ringerMode == AudioManager.RINGER_MODE_NORMAL) {
            RingtoneManager.getRingtone(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))?.play()
        }
    }

    override fun onDestroy() {
        pendingCue?.let(handler::removeCallbacks)
        wakeLock?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }
}
