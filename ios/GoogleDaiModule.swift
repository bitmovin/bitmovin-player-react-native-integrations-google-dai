import BitmovinGoogleDAIPlayer
import BitmovinPlayer
import ExpoModulesCore
import RNBitmovinPlayer

public class GoogleDaiModule: Module {
    private var playerIdsByGoogleDaiId: Registry<NativeId> = [:]
    private let sourceConfigFactoryBridge = GoogleDaiSourceConfigFactoryBridge()

    public func definition() -> ModuleDefinition {
        Name("GoogleDaiModule")
        Events(googleDaiSourceConfigFactoryEventName)

        OnDestroy { [weak self] in
            self?.playerIdsByGoogleDaiId.removeAll()
            self?.sourceConfigFactoryBridge.removeAll()
        }

        AsyncFunction("initialize") { @MainActor [weak self] (googleDaiId: NativeId, playerId: NativeId) in
            guard let player = PlayerRegistry.getPlayer(nativeId: playerId) else {
                throw googleDaiException(
                    "GOOGLE_DAI_PLAYER_UNAVAILABLE",
                    "Player '\(playerId)' is not initialized or has already been destroyed."
                )
            }

            player._modules._registerModule { @MainActor in
                _InternalGoogleDaiPlayerModuleFactory.create(player: $0)
            }
            self?.playerIdsByGoogleDaiId[googleDaiId] = playerId
        }.runOnQueue(.main)

        // swiftlint:disable closure_parameter_position
        AsyncFunction("load") { @MainActor [weak self] (
            googleDaiId: NativeId,
            sourceConfig: [String: Any],
            sourceConfigFactoryId: String?
        ) in
            guard let self else {
                throw googleDaiException(
                    "GOOGLE_DAI_PLAYER_UNAVAILABLE",
                    "GoogleDai '\(googleDaiId)' is not initialized or its Player is unavailable."
                )
            }
            try self.load(
                googleDaiId: googleDaiId,
                sourceConfig: sourceConfig,
                sourceConfigFactoryId: sourceConfigFactoryId
            )
        }.runOnQueue(.main)
        // swiftlint:enable closure_parameter_position

        AsyncFunction("setSourceConfigFactoryResult") { [weak self] (requestId: Int, sourceConfig: [String: Any]?) in
            self?.sourceConfigFactoryBridge.complete(requestId: requestId, sourceConfig: sourceConfig)
        }

        AsyncFunction("destroy") { @MainActor [weak self] (googleDaiId: NativeId) in
            guard let playerId = self?.playerIdsByGoogleDaiId.removeValue(forKey: googleDaiId) else {
                return
            }
            PlayerRegistry.getPlayer(nativeId: playerId)?.googleDai.destroy()
        }.runOnQueue(.main)
    }

    @MainActor
    private func load(
        googleDaiId: NativeId,
        sourceConfig: [String: Any],
        sourceConfigFactoryId: String?
    ) throws {
        guard let playerId = playerIdsByGoogleDaiId[googleDaiId],
              let player = PlayerRegistry.getPlayer(nativeId: playerId)
        else {
            throw googleDaiException(
                "GOOGLE_DAI_PLAYER_UNAVAILABLE",
                "GoogleDai '\(googleDaiId)' is not initialized or its Player is unavailable."
            )
        }

        let source = try googleDaiSource(from: sourceConfig)
        guard let sourceConfigFactoryId else {
            player.googleDai.load(source: source)
            return
        }

        let validatedSourceConfigFactoryId = try nonEmptyNativeId(
            sourceConfigFactoryId,
            field: "sourceConfigFactoryId"
        )
        player.googleDai.load(source: source) { [weak self] nativeSourceConfig in
            guard let self else {
                return
            }
            self.sourceConfigFactoryBridge.configureSourceConfigFromJs(
                sourceConfigFactoryId: validatedSourceConfigFactoryId,
                sourceConfig: nativeSourceConfig
            ) { [weak self] eventName, body in
                self?.sendEvent(eventName, body)
            }
        }
    }
}

private func googleDaiSource(from config: [String: Any]) throws -> GoogleDaiSource {
    guard config["type"] as? String == "hls" else {
        throw googleDaiException(
            "GOOGLE_DAI_UNSUPPORTED_SOURCE_CONFIG",
            "Google DAI on iOS supports live HLS sources only."
        )
    }
    if let adTagParameters = config["adTagParameters"] as? [String: Any], !adTagParameters.isEmpty {
        throw googleDaiException(
            "GOOGLE_DAI_UNSUPPORTED_SOURCE_CONFIG",
            "Google DAI adTagParameters are not supported on iOS yet."
        )
    }
    guard let assetKey = config["assetKey"] as? String else {
        throw googleDaiException(
            "GOOGLE_DAI_INVALID_SOURCE_CONFIG",
            "Google DAI source config requires an assetKey."
        )
    }

    return .live(
        assetKey: assetKey,
        apiKey: config["apiKey"] as? String,
        networkCode: config["networkCode"] as? String
    )
}

private func nonEmptyNativeId(_ nativeId: NativeId, field: String) throws -> NativeId {
    if nativeId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        throw googleDaiException(
            "GOOGLE_DAI_INVALID_NATIVE_ID",
            "\(field) must be a non-empty string."
        )
    }
    return nativeId
}

private func googleDaiException(_ name: String, _ description: String) -> Exception {
    Exception(name: name, description: description)
}
