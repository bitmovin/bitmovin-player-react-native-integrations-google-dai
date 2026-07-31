package com.bitmovin.player.reactnative.googledai

import androidx.core.os.bundleOf
import com.bitmovin.player.api.source.SourceConfig
import com.bitmovin.player.api.source.SourceType
import com.bitmovin.player.integration.googledai.api.GoogleDaiSourceConfig
import com.bitmovin.player.integration.googledai.api.GoogleDaiSourceType
import com.bitmovin.player.integration.googledai.api.SourceConfigFactoryContext
import com.bitmovin.player.integration.googledai.api.googleDai
import com.bitmovin.player.reactnative.NativeId
import com.bitmovin.player.reactnative.PlayerRegistry
import com.bitmovin.player.reactnative.ResultWaiter
import com.bitmovin.player.reactnative.converter.toSourceConfig
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap

private const val SOURCE_CONFIG_FACTORY_TIMEOUT_MS = 250L
private const val SOURCE_CONFIG_FACTORY_EVENT = "onSourceConfigFactoryRequest"

class GoogleDaiModule : Module() {
    private val playerIdsByGoogleDaiId = ConcurrentHashMap<NativeId, NativeId>()
    private val sourceConfigFactoryWaiter = ResultWaiter<Map<String, Any?>>()

    override fun definition() = ModuleDefinition {
        Name("GoogleDaiModule")
        Events(SOURCE_CONFIG_FACTORY_EVENT)

        OnDestroy {
            playerIdsByGoogleDaiId.clear()
            sourceConfigFactoryWaiter.clear()
        }

        AsyncFunction("initialize") { googleDaiId: NativeId, playerId: NativeId ->
            initialize(googleDaiId, playerId)
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("load") { googleDaiId: NativeId, sourceConfig: Map<String, Any?>,
            sourceConfigFactoryId: String?, ->
            load(googleDaiId, sourceConfig, sourceConfigFactoryId)
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("setSourceConfigFactoryResult") { requestId: Int, sourceConfig: Map<String, Any?>? ->
            sourceConfigFactoryWaiter.complete(requestId, sourceConfig ?: emptyMap())
        }

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

    private fun load(
        googleDaiId: NativeId,
        sourceConfig: Map<String, Any?>,
        sourceConfigFactoryId: String?,
    ) {
        val validatedGoogleDaiId = googleDaiId.nonEmptyNativeId("googleDaiId")
        val playerId = playerIdsByGoogleDaiId[validatedGoogleDaiId]
            ?: throw GoogleDaiException.UnknownAdapter(validatedGoogleDaiId)
        val player = PlayerRegistry.getPlayer(playerId)
            ?: throw GoogleDaiException.PlayerUnavailable(playerId)
        val nativeSourceConfig = sourceConfig.toGoogleDaiSourceConfig()
        val validatedSourceConfigFactoryId = sourceConfigFactoryId?.nonEmptyNativeId("sourceConfigFactoryId")
        try {
            if (validatedSourceConfigFactoryId == null) {
                player.googleDai.load(nativeSourceConfig)
            } else {
                player.googleDai.load(nativeSourceConfig) { context ->
                    sourceConfigFromJs(validatedSourceConfigFactoryId, context)
                }
            }
        } catch (error: GoogleDaiException) {
            throw error
        } catch (error: Exception) {
            throw GoogleDaiException.NativeLoadFailed(error.message ?: "Unknown error")
        }
    }

    private fun sourceConfigFromJs(
        sourceConfigFactoryId: String,
        context: SourceConfigFactoryContext,
    ): SourceConfig {
        val fallback = context.toDefaultSourceConfig()
        val (requestId, wait) = sourceConfigFactoryWaiter.make(SOURCE_CONFIG_FACTORY_TIMEOUT_MS)
        sendSourceConfigFactoryRequest(requestId, sourceConfigFactoryId, context)
        return wait()?.toSourceConfigOrNull() ?: fallback
    }

    private fun sendSourceConfigFactoryRequest(
        requestId: Int,
        sourceConfigFactoryId: String,
        context: SourceConfigFactoryContext,
    ) {
        sendEvent(
            SOURCE_CONFIG_FACTORY_EVENT,
            bundleOf(
                "requestId" to requestId,
                "sourceConfigFactoryId" to sourceConfigFactoryId,
                "context" to context.toJson(),
            ),
        )
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

private fun SourceConfigFactoryContext.toDefaultSourceConfig(): SourceConfig = SourceConfig(url, sourceType)

private fun SourceConfigFactoryContext.toJson(): Map<String, Any?> = mapOf(
    "url" to url,
    "sourceType" to sourceType.toReactNativeValue(),
    "subtitleMetadata" to subtitleMetadata,
)

private fun SourceType.toReactNativeValue(): String = when (this) {
    SourceType.Dash -> "dash"
    SourceType.Hls -> "hls"
    SourceType.Progressive -> "progressive"
    SourceType.Smooth -> "smooth"
    else -> "none"
}

private fun Map<String, Any?>.toSourceConfigOrNull(): SourceConfig? = try {
    toSourceConfig()
} catch (_: Exception) {
    null
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
