package expo.modules.notificationlistener

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.Parcelable
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * Captures notifications and queues the money-looking ones. No parsing here: TypeScript does
 * all of that. Keeps a notification if its text looks like money, if its package is on the
 * allowlist (payment/bank apps, set from JS; SMS apps are not on it), or if Android 15+ hid its
 * content (it may have been a bank SMS). Everything else is dropped without being stored.
 */
class KharchaNotificationListenerService : NotificationListenerService() {

  override fun onListenerConnected() {
    super.onListenerConnected()
    Status.setConnected(this, true)
    // No backfill exists; recover whatever is still in the shade.
    try {
      activeNotifications?.forEach { capture(it) }
    } catch (e: Exception) {
      Log.w(TAG, "activeNotifications failed", e)
    }
  }

  override fun onListenerDisconnected() {
    super.onListenerDisconnected()
    Status.setConnected(this, false)
    requestRebind(ComponentName(this, KharchaNotificationListenerService::class.java))
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    capture(sbn)
  }

  private fun capture(sbn: StatusBarNotification) {
    try {
      if (sbn.packageName == packageName) return
      val n = sbn.notification ?: return
      if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
      if (n.flags and Notification.FLAG_ONGOING_EVENT != 0) return
      val payload = toPayload(sbn, n)
      val text = listOf("title", "titleBig", "text", "bigText", "subText").joinToString(" ") { payload.optString(it, "") } +
        " " + payload.getJSONArray("messages").let { m -> (0 until m.length()).joinToString(" ") { m.getJSONObject(it).optString("text", "") } } +
        " " + payload.getJSONArray("textLines").join(" ")
      val keep = MONEY.containsMatchIn(text) || REDACTED.containsMatchIn(text) || Status.isAllowlisted(this, sbn.packageName)
      if (!keep) return
      QueueDb.get(this).insert(payload.toString())
      Status.markEvent(this)
      Signals.notifyQueueChanged()
    } catch (e: Exception) {
      Log.w(TAG, "capture failed", e)
    }
  }

  private fun toPayload(sbn: StatusBarNotification, n: Notification): JSONObject {
    val extras = n.extras ?: Bundle()
    fun cs(key: String): Any = extras.getCharSequence(key)?.toString() ?: JSONObject.NULL
    val lines = JSONArray()
    extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.forEach { lines.put(it.toString()) }
    val messages = JSONArray()
    @Suppress("DEPRECATION")
    val raw: Array<Parcelable>? = extras.getParcelableArray(Notification.EXTRA_MESSAGES)
    raw?.forEach { p ->
      val b = p as? Bundle ?: return@forEach
      val sender: CharSequence? = b.getCharSequence("sender") ?: if (Build.VERSION.SDK_INT >= 28) {
        @Suppress("DEPRECATION")
        (b.getParcelable<android.app.Person>("sender_person"))?.name
      } else null
      messages.put(
        JSONObject()
          .put("sender", sender?.toString() ?: JSONObject.NULL)
          .put("text", b.getCharSequence("text")?.toString() ?: JSONObject.NULL)
          .put("timestamp", if (b.containsKey("time")) b.getLong("time") else JSONObject.NULL)
      )
    }
    return JSONObject()
      .put("schemaVersion", 1)
      .put("key", sbn.key)
      .put("packageName", sbn.packageName)
      .put("appName", appLabel(sbn.packageName) ?: JSONObject.NULL)
      .put("postedAt", sbn.postTime)
      .put("when", if (n.`when` > 0) n.`when` else JSONObject.NULL)
      .put("channelId", if (Build.VERSION.SDK_INT >= 26) n.channelId ?: JSONObject.NULL else JSONObject.NULL)
      .put("category", n.category ?: JSONObject.NULL)
      .put("template", extras.getString(Notification.EXTRA_TEMPLATE) ?: JSONObject.NULL)
      .put("flags", n.flags)
      .put("isGroupSummary", n.flags and Notification.FLAG_GROUP_SUMMARY != 0)
      .put("isOngoing", n.flags and Notification.FLAG_ONGOING_EVENT != 0)
      .put("title", cs(Notification.EXTRA_TITLE))
      .put("titleBig", cs(Notification.EXTRA_TITLE_BIG))
      .put("text", cs(Notification.EXTRA_TEXT))
      .put("bigText", cs(Notification.EXTRA_BIG_TEXT))
      .put("subText", cs(Notification.EXTRA_SUB_TEXT))
      .put("summaryText", cs(Notification.EXTRA_SUMMARY_TEXT))
      .put("infoText", cs(Notification.EXTRA_INFO_TEXT))
      .put("conversationTitle", cs(Notification.EXTRA_CONVERSATION_TITLE))
      .put("textLines", lines)
      .put("messages", messages)
  }

  private fun appLabel(pkg: String): String? = try {
    packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
  } catch (e: Exception) {
    null
  }

  companion object {
    private const val TAG = "KharchaListener"
    private val MONEY = Regex("(₹|\\brs\\.?|\\binr)\\s*\\d", RegexOption.IGNORE_CASE)
    private val REDACTED = Regex("sensitive notification content hidden", RegexOption.IGNORE_CASE)
  }
}

/** In-process signal to the JS module that new rows were queued. */
object Signals {
  @Volatile var onQueueChanged: (() -> Unit)? = null
  fun notifyQueueChanged() {
    onQueueChanged?.invoke()
  }
}

/** Listener health and allowlist, in SharedPreferences. */
object Status {
  private const val PREFS = "kharcha_listener"
  private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun setConnected(c: Context, connected: Boolean) {
    prefs(c).edit().putBoolean("connected", connected).putLong("connectionChangedAt", System.currentTimeMillis()).apply()
  }
  fun isConnected(c: Context) = prefs(c).getBoolean("connected", false)
  fun connectionChangedAt(c: Context) = prefs(c).getLong("connectionChangedAt", 0L)
  fun markEvent(c: Context) = prefs(c).edit().putLong("lastEventAt", System.currentTimeMillis()).apply()
  fun lastEventAt(c: Context) = prefs(c).getLong("lastEventAt", 0L)
  fun setAllowlist(c: Context, packages: List<String>) = prefs(c).edit().putStringSet("allowlist", packages.toSet()).apply()
  fun isAllowlisted(c: Context, pkg: String) = prefs(c).getStringSet("allowlist", emptySet())?.contains(pkg) == true
}
