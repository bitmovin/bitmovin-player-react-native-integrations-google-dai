import BitmovinGoogleDAIPlayer
import BitmovinPlayer
import ExpoModulesCore
import RNBitmovinPlayer

public class GoogleDaiModule: Module {
    private var playerIdsByGoogleDaiId: Registry<NativeId> = [:]

    public func definition() -> ModuleDefinition {
        Name("GoogleDaiModule")
        Events("onSourceConfigFactoryRequest")

        OnDestroy { [weak self] in
            self?.playerIdsByGoogleDaiId.removeAll()
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

        AsyncFunction("load") { @MainActor [weak self] (googleDaiId: NativeId, sourceConfig: [String: Any], _: String?) in
            guard let playerId = self?.playerIdsByGoogleDaiId[googleDaiId],
                  let player = PlayerRegistry.getPlayer(nativeId: playerId)
            else {
                throw googleDaiException(
                    "GOOGLE_DAI_PLAYER_UNAVAILABLE",
                    "GoogleDai '\(googleDaiId)' is not initialized or its Player is unavailable."
                )
            }

            player.googleDai.load(source: try googleDaiSource(from: sourceConfig))
        }.runOnQueue(.main)

        AsyncFunction("setSourceConfigFactoryResult") { (_: Int, _: [String: Any]?) in
            // No-op until the native iOS integration exposes source config customization.
        }.runOnQueue(.main)

        AsyncFunction("destroy") { @MainActor [weak self] (googleDaiId: NativeId) in
            guard let playerId = self?.playerIdsByGoogleDaiId.removeValue(forKey: googleDaiId) else {
                return
            }
            PlayerRegistry.getPlayer(nativeId: playerId)?.googleDai.destroy()
        }.runOnQueue(.main)
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

private func googleDaiException(_ name: String, _ description: String) -> Exception {
    Exception(name: name, description: description)
}
