package expo.modules.smsreader

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Telephony
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmsReaderModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context not available" }

  private var observer: ContentObserver? = null

  override fun definition() = ModuleDefinition {
    Name("SmsReader")

    Events("onSmsChanged")

    OnCreate {
      observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean, uri: Uri?) {
          sendEvent("onSmsChanged", emptyMap<String, Any>())
        }
      }
      context.contentResolver.registerContentObserver(Telephony.Sms.Inbox.CONTENT_URI, true, observer!!)
    }

    OnDestroy {
      observer?.let { context.contentResolver.unregisterContentObserver(it) }
      observer = null
    }

    Function("hasReadPermission") { hasReadPermission() }

    Function("getLastSyncCursor") {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      mapOf(
        "at" to prefs.getLong(CURSOR_AT, prefs.getLong(LEGACY_LAST_SYNC_AT, 0L)).toDouble(),
        "id" to prefs.getLong(CURSOR_ID, 0L).toDouble(),
      )
    }

    Function("getLastSyncAt") {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      prefs.getLong(LAST_SYNC_COMPLETED_AT, prefs.getLong(LEGACY_LAST_SYNC_AT, 0L)).toDouble()
    }

    Function("setLastSyncCursor") { at: Double, id: Double ->
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putLong(CURSOR_AT, at.toLong())
        .putLong(CURSOR_ID, id.toLong())
        .apply()
    }

    Function("setLastSyncCompletedAt") { at: Double ->
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putLong(LAST_SYNC_COMPLETED_AT, at.toLong())
        .apply()
    }

    Function("setLastSyncAt") { at: Double ->
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putLong(CURSOR_AT, at.toLong())
        .putLong(CURSOR_ID, 0L)
        .putLong(LAST_SYNC_COMPLETED_AT, at.toLong())
        .apply()
    }

    AsyncFunction("readInbox") { sinceMs: Double, sinceId: Double, limit: Int ->
      val rows = mutableListOf<Map<String, Any?>>()
      if (!hasReadPermission()) return@AsyncFunction rows
      val projection = arrayOf(
        Telephony.Sms._ID,
        Telephony.Sms.ADDRESS,
        Telephony.Sms.BODY,
        Telephony.Sms.DATE,
      )
      val selection = "(${Telephony.Sms.DATE} > ?) OR (${Telephony.Sms.DATE} = ? AND ${Telephony.Sms._ID} > ?)"
      val selectionArgs = arrayOf(sinceMs.toLong().toString(), sinceMs.toLong().toString(), sinceId.toLong().toString())
      val sort = "${Telephony.Sms.DATE} ASC, ${Telephony.Sms._ID} ASC"

      val cursor = context.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        projection,
        selection,
        selectionArgs,
        sort,
      ) ?: error("SMS inbox query returned no cursor")

      cursor.use {
        val idIndex = cursor.getColumnIndexOrThrow(Telephony.Sms._ID)
        val addressIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
        val bodyIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
        val dateIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
        while (cursor.moveToNext() && rows.size < limit.coerceIn(1, MAX_ROWS)) {
          val id = cursor.getLong(idIndex)
          val address = cursor.getString(addressIndex) ?: ""
          val body = cursor.getString(bodyIndex) ?: ""
          val date = cursor.getLong(dateIndex)
          if (FINANCIAL_HINT.containsMatchIn(body) && MONEY.containsMatchIn(body)) {
            rows += mapOf(
              "id" to id.toDouble(),
              "address" to address,
              "body" to body,
              "date" to date.toDouble(),
            )
          }
        }
      }
      rows
    }
  }

  private fun hasReadPermission(): Boolean =
    context.checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED

  companion object {
    private const val PREFS = "kharcha_sms_reader"
    private const val LEGACY_LAST_SYNC_AT = "last_sync_at"
    private const val CURSOR_AT = "last_sync_cursor_at"
    private const val CURSOR_ID = "last_sync_cursor_id"
    private const val LAST_SYNC_COMPLETED_AT = "last_sync_completed_at"
    private const val MAX_ROWS = 200
    private val MONEY = Regex("(₹|\\brs\\.?|\\binr)\\s*\\d", RegexOption.IGNORE_CASE)
    private val FINANCIAL_HINT = Regex(
      "\\b(debit(?:ed)?|credit(?:ed)?|dr|cr|paid|spent|payment|transaction|upi|a/c|account|ref(?:erence)?|refund|reversal|withdrawn|received)\\b",
      RegexOption.IGNORE_CASE,
    )
  }
}
