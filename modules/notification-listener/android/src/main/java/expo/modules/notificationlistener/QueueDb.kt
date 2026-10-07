package expo.modules.notificationlistener

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * Durable queue of captured notifications (queue.db). Owned only by Kotlin; JS never opens this
 * file — it reads rows through the module and acknowledges them once stored in kharcha.db.
 */
class QueueDb private constructor(context: Context) :
  SQLiteOpenHelper(context.applicationContext, "kharcha_queue.db", null, 1) {

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      "CREATE TABLE queue (id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL, created_at INTEGER NOT NULL)"
    )
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

  fun insert(payload: String): Long {
    val values = ContentValues().apply {
      put("payload", payload)
      put("created_at", System.currentTimeMillis())
    }
    return writableDatabase.insert("queue", null, values)
  }

  fun read(limit: Int): List<Map<String, Any>> {
    val rows = mutableListOf<Map<String, Any>>()
    readableDatabase.rawQuery("SELECT id, payload FROM queue ORDER BY id LIMIT ?", arrayOf(limit.toString())).use { c ->
      while (c.moveToNext()) rows.add(mapOf("id" to c.getLong(0).toDouble(), "payload" to c.getString(1)))
    }
    return rows
  }

  fun delete(ids: List<Long>) {
    if (ids.isEmpty()) return
    val db = writableDatabase
    db.beginTransaction()
    try {
      ids.forEach { db.delete("queue", "id = ?", arrayOf(it.toString())) }
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
  }

  fun count(): Long = readableDatabase.compileStatement("SELECT count(*) FROM queue").use { it.simpleQueryForLong() }

  fun clear() {
    writableDatabase.delete("queue", null, null)
  }

  companion object {
    @Volatile private var instance: QueueDb? = null
    fun get(context: Context): QueueDb =
      instance ?: synchronized(this) { instance ?: QueueDb(context).also { instance = it } }
  }
}
