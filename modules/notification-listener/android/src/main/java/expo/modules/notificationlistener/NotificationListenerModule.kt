package expo.modules.notificationlistener

import android.content.ComponentName
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.service.notification.NotificationListenerService
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotificationListenerModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext) { "React context not available" }
  private val component get() = ComponentName(context, KharchaNotificationListenerService::class.java)

  override fun definition() = ModuleDefinition {
    Name("NotificationListener")

    Events("onQueueChanged")

    OnCreate {
      Signals.onQueueChanged = { sendEvent("onQueueChanged", mapOf("pending" to QueueDb.get(context).count().toDouble())) }
    }

    OnDestroy {
      Signals.onQueueChanged = null
    }

    Function("isPermissionGranted") { isGranted() }

    Function("getStatus") {
      mapOf(
        "permissionGranted" to isGranted(),
        "connected" to Status.isConnected(context),
        "connectionChangedAt" to Status.connectionChangedAt(context).toDouble(),
        "lastEventAt" to Status.lastEventAt(context).toDouble(),
        "pending" to QueueDb.get(context).count().toDouble(),
      )
    }

    Function("openPermissionSettings") {
      val intent = if (Build.VERSION.SDK_INT >= 30) {
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
          .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, component.flattenToString())
      } else {
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(intent)
      } catch (e: Exception) {
        context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }

    Function("openBatterySettings") {
      val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("requestRebind") {
      if (isGranted()) NotificationListenerService.requestRebind(component)
    }

    Function("setAllowlist") { packages: List<String> -> Status.setAllowlist(context, packages) }

    AsyncFunction("readQueue") { limit: Int -> QueueDb.get(context).read(limit) }

    AsyncFunction("ackQueue") { ids: List<Double> -> QueueDb.get(context).delete(ids.map { it.toLong() }) }

    AsyncFunction("clearQueue") { QueueDb.get(context).clear() }
  }

  private fun isGranted(): Boolean {
    val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: return false
    return enabled.split(":").any { ComponentName.unflattenFromString(it) == component }
  }
}
