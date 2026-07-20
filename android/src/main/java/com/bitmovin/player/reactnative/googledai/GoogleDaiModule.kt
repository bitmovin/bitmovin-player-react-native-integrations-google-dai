package com.bitmovin.player.reactnative.googledai

import com.bitmovin.player.integration.googledai.api.GoogleDaiSourceConfig
import com.bitmovin.player.integration.googledai.api.GoogleDaiSourceType
import com.bitmovin.player.integration.googledai.api.googleDai
import com.bitmovin.player.reactnative.NativeId
import com.bitmovin.player.reactnative.PlayerRegistry
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap

class GoogleDaiModule : Module() {
    private val playerIdsByGoogleDaiId = ConcurrentHashMap<NativeId, NativeId>()

    override fun definition() = ModuleDefinition {
        Name("GoogleDaiModule")

        OnDestroy {
            playerIdsByGoogleDaiId.clear()
        }

        AsyncFunction("initialize") { googleDaiId: NativeId, playerId: NativeId ->
            initialize(googleDaiId, playerId)
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("load") { googleDaiId: NativeId, sourceConfig: Map<String, Any?> ->
            val validatedGoogleDaiId = googleDaiId.nonEmptyNativeId("googleDaiId")
            val playerId = playerIdsByGoogleDaiId[validatedGoogleDaiId]
                ?: throw GoogleDaiException.UnknownAdapter(validatedGoogleDaiId)
            val player = PlayerRegistry.getPlayer(playerId)
                ?: throw GoogleDaiException.PlayerUnavailable(playerId)
            val nativeSourceConfig = sourceConfig.toGoogleDaiSourceConfig()
            try {
                player.googleDai.load(nativeSourceConfig)
            } catch (error: GoogleDaiException) {
                throw error
            } catch (error: Exception) {
                throw GoogleDaiException.NativeLoadFailed(error.message ?: "Unknown error")
            }
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("destroy") { googleDaiId: NativeId ->
            playerIdsByGoogleDaiId.remove(googleDaiId.nonEmptyNativeId("googleDaiId"))
        }.runOnQueue(Queues.MAIN)
    }

    private fun initialize(googleDaiId: NativeId, playerId: NativeId) {
        val validatedGoogleDaiId = googleDaiId.nonEmptyNativeId("googleDaiId")
        val validatedPlayerId = playerId.nonEmptyNativeId("playerId")

        playerIdsByGoogleDaiId[validatedGoogleDaiId]?.let { existingPlayerId ->
            if (existingPlayerId == validatedPlayerId) {
                return
            }
            throw GoogleDaiException.DuplicateAdapterId(validatedGoogleDaiId)
        }

        if (PlayerRegistry.getPlayer(validatedPlayerId) == null) {
            throw GoogleDaiException.PlayerUnavailable(validatedPlayerId)
        }
        playerIdsByGoogleDaiId[validatedGoogleDaiId] = validatedPlayerId
    }
}

private fun NativeId.nonEmptyNativeId(field: String): NativeId {
    if (isBlank()) {
        throw GoogleDaiException.InvalidNativeId(field)
    }
    return this
}

private fun Map<String, Any?>.toGoogleDaiSourceConfig(): GoogleDaiSourceConfig {
    val kind = this["kind"] as? String ?: throw GoogleDaiException.InvalidSourceConfig(
        "kind must be 'live'",
    )
    if (kind != "live") {
        throw GoogleDaiException.InvalidSourceConfig("unsupported kind '$kind'")
    }
    return GoogleDaiSourceConfig.Live(
        assetKey = nonEmptyString("assetKey"),
        type = sourceType(),
        apiKey = optionalString("apiKey"),
        networkCode = optionalString("networkCode"),
        adTagParameters = adTagParameters(),
    )
}

private fun Map<String, Any?>.nonEmptyString(key: String): String {
    val value = this[key] as? String ?: throw GoogleDaiException.InvalidSourceConfig(
        "$key must be a non-empty string",
    )
    if (value.isBlank()) {
        throw GoogleDaiException.InvalidSourceConfig("$key must be a non-empty string")
    }
    return value
}

private fun Map<String, Any?>.optionalString(key: String): String? {
    val value = this[key] ?: return null
    return value as? String ?: throw GoogleDaiException.InvalidSourceConfig(
        "$key must be a string when provided",
    )
}

private fun Map<String, Any?>.sourceType(): GoogleDaiSourceType =
    when (this["type"] as? String) {
        "dash" -> GoogleDaiSourceType.Dash
        "hls" -> GoogleDaiSourceType.Hls
        else -> throw GoogleDaiException.InvalidSourceConfig("type must be 'dash' or 'hls'")
    }

private fun Map<String, Any?>.adTagParameters(): Map<String, String> {
    val rawValue = this["adTagParameters"] ?: return emptyMap()
    val rawMap = rawValue as? Map<*, *> ?: throw GoogleDaiException.InvalidSourceConfig(
        "adTagParameters must be an object with string keys and values",
    )
    return rawMap.entries.associate { (key, value) ->
        if (key !is String || value !is String) {
            throw GoogleDaiException.InvalidSourceConfig(
                "adTagParameters must contain only string keys and values",
            )
        }
        key to value
    }
}

sealed class GoogleDaiException(message: String) : CodedException(message) {
    class PlayerUnavailable(playerId: NativeId) : GoogleDaiException(
        "Player '$playerId' is not initialized or has already been destroyed.",
    )

    class DuplicateAdapterId(googleDaiId: NativeId) : GoogleDaiException(
        "GoogleDai '$googleDaiId' is already initialized for another player.",
    )

    class UnknownAdapter(googleDaiId: NativeId) : GoogleDaiException(
        "GoogleDai '$googleDaiId' is not initialized or has already been destroyed.",
    )

    class InvalidSourceConfig(reason: String) : GoogleDaiException(
        "Invalid Google DAI source config: $reason.",
    )

    class InvalidNativeId(field: String) : GoogleDaiException(
        "$field must be a non-empty string.",
    )

    class NativeLoadFailed(reason: String) : GoogleDaiException(
        "Could not load Google DAI source config: $reason.",
    )
}
