package com.sms_reader

import android.content.Context
import org.json.JSONArray
import android.net.Uri
import android.telephony.PhoneNumberUtils
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap

class SmsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "SmsModule"

    private val pinPreferences get() = reactApplicationContext
        .getSharedPreferences("sms_reader_pins", Context.MODE_PRIVATE)

    @ReactMethod
    fun getPinnedChats(promise: Promise) {
        try {
            val stored = JSONArray(pinPreferences.getString("addresses", "[]"))
            val result = Arguments.createArray()
            for (i in 0 until stored.length()) result.pushString(stored.getString(i))
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("PIN_READ_ERROR", "Could not load pinned chats.", e)
        }
    }

    @ReactMethod
    fun setChatPinned(address: String, pinned: Boolean, promise: Promise) {
        try {
            val target = address.trim()
            require(target.isNotEmpty()) { "A sender is required." }
            val stored = JSONArray(pinPreferences.getString("addresses", "[]"))
            val addresses = mutableListOf<String>()
            for (i in 0 until stored.length()) {
                val value = stored.getString(i)
                if (!value.equals(target, ignoreCase = true)) addresses.add(value)
            }
            if (pinned) addresses.add(target)
            check(pinPreferences.edit().putString("addresses", JSONArray(addresses).toString()).commit()) {
                "Could not save pinned chats."
            }
            val result = Arguments.createArray()
            addresses.forEach { result.pushString(it) }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("PIN_SAVE_ERROR", "Could not save pinned chats. Try again.", e)
        }
    }

    /** All inbox messages, newest first. */
    @ReactMethod
    fun getInboxMessages(maxCount: Int, promise: Promise) {
        try {
            val uri: Uri = Uri.parse("content://sms/inbox")
            val result: WritableArray = Arguments.createArray()
            queryMessages(uri, null, null, maxCount).forEach { result.pushMap(it.toWritableMap()) }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("SMS_READ_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getAllMessages(promise: Promise) {
        try {
            val result = Arguments.createArray()
            queryMessages(Uri.parse("content://sms"), "type IN (1, 2)", null, 0)
                .forEach { result.pushMap(it.toWritableMap()) }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("SMS_READ_ERROR", e.message, e)
        }
    }

    /**
     * Full conversation (inbox + sent) with one address/phone number,
     * newest first. Uses content://sms (not just /inbox) so you get both
     * received and sent messages in the thread.
     */
    @ReactMethod
    fun getMessagesForAddress(address: String, maxCount: Int, promise: Promise) {
        try {
            val uri: Uri = Uri.parse("content://sms")
            // Pull all rows (no SQL LIMIT) since we filter by fuzzy address match after.
            val all = queryMessages(uri, "type IN (1, 2)", null, 0)
            val target = address.trim()
            require(target.isNotEmpty()) { "Enter a sender name or phone number." }

            val filtered = mutableListOf<Map<String, Any?>>()
            for (msg in all) {
                val msgAddress = msg["address"] as String? ?: continue
                val sender = msgAddress.trim()
                val isPhoneNumber = sender.any { it.isDigit() } &&
                    target.any { it.isDigit() } &&
                    sender.all { it.isDigit() || it in "+-(). " } &&
                    target.all { it.isDigit() || it in "+-(). " }
                if (sender.equals(target, ignoreCase = true) ||
                    (isPhoneNumber && PhoneNumberUtils.compare(sender, target))) {
                    filtered.add(msg)
                }
                if (maxCount > 0 && filtered.size >= maxCount) break
            }

            val result: WritableArray = Arguments.createArray()
            filtered.forEach { result.pushMap(it.toWritableMap()) }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("SMS_READ_ERROR", e.message, e)
        }
    }

    // --- helpers ---

    private fun queryMessages(
        uri: Uri,
        selection: String?,
        selectionArgs: Array<String>?,
        maxCount: Int
    ): List<Map<String, Any?>> {
        val projection = arrayOf("_id", "address", "body", "date", "type")
        val sortOrder = "date DESC, _id DESC"

        val cursor = reactApplicationContext.contentResolver.query(
            uri, projection, selection, selectionArgs, sortOrder
        )

        val results = mutableListOf<Map<String, Any?>>()

        cursor?.use {
            val idIdx = it.getColumnIndexOrThrow("_id")
            val addressIdx = it.getColumnIndexOrThrow("address")
            val bodyIdx = it.getColumnIndexOrThrow("body")
            val dateIdx = it.getColumnIndexOrThrow("date")
            val typeIdx = it.getColumnIndexOrThrow("type") // 1 = inbox (received), 2 = sent

            while ((maxCount <= 0 || results.size < maxCount) && it.moveToNext()) {
                results.add(
                    mapOf(
                        "id" to it.getString(idIdx),
                        "address" to it.getString(addressIdx),
                        "body" to it.getString(bodyIdx),
                        "date" to it.getLong(dateIdx).toDouble(),
                        "type" to it.getInt(typeIdx)
                    )
                )
            }
        }

        return results
    }

    private fun Map<String, Any?>.toWritableMap(): WritableMap {
        val map = Arguments.createMap()
        map.putString("id", this["id"] as String?)
        map.putString("address", this["address"] as String?)
        map.putString("body", this["body"] as String?)
        map.putDouble("date", this["date"] as Double)
        map.putInt("type", this["type"] as Int)
        return map
    }
}