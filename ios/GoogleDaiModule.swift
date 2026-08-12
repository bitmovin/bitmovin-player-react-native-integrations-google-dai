import BitmovinGoogleDAIPlayer
import BitmovinPlayer
import ExpoModulesCore
import Foundation
import RNBitmovinPlayer

public class GoogleDaiModule: Module {
    private var playerIdsByGoogleDaiId: Registry<NativeId> = [:]
    private var playerDestroyObservers: Registry<PlayerDestroyObserver> = [:]

    public func definition() -> ModuleDefinition {
        Name("GoogleDaiModule")

        OnDestroy { [weak self] in
            self?.playerDestroyObservers.values.forEach { $0.remove() }
            self?.playerDestroyObservers.removeAll()
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
            self?.observePlayerDestroy(googleDaiId: googleDaiId, player: player)
            self?.playerIdsByGoogleDaiId[googleDaiId] = playerId
        }.runOnQueue(.main)

        AsyncFunction("load") { @MainActor [weak self] (googleDaiId: NativeId, sourceConfig: [String: Any]) in
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

        AsyncFunction("destroy") { @MainActor [weak self] (googleDaiId: NativeId) in
            guard let playerId = self?.unregister(googleDaiId: googleDaiId) else {
                return
            }
            PlayerRegistry.getPlayer(nativeId: playerId)?.googleDai.destroy()
        }.runOnQueue(.main)
    }

    @MainActor
    private func observePlayerDestroy(googleDaiId: NativeId, player: Player) {
        playerDestroyObservers[googleDaiId]?.remove()
        let observer = PlayerDestroyObserver(player: player) { [weak self] in
            self?.unregister(googleDaiId: googleDaiId)
        }
        player.add(listener: observer)
        playerDestroyObservers[googleDaiId] = observer
    }

    @MainActor
    @discardableResult
    private func unregister(googleDaiId: NativeId) -> NativeId? {
        playerDestroyObservers.removeValue(forKey: googleDaiId)?.remove()
        return playerIdsByGoogleDaiId.removeValue(forKey: googleDaiId)
    }
}

private final class PlayerDestroyObserver: NSObject, PlayerListener {
    private weak var player: Player?
    private let onPlayerDestroy: @MainActor () -> Void

    init(player: Player, onPlayerDestroy: @escaping @MainActor () -> Void) {
        self.player = player
        self.onPlayerDestroy = onPlayerDestroy
    }

    func remove() {
        player?.remove(listener: self)
        player = nil
    }

    func onDestroy(_ event: DestroyEvent, player: Player) {
        Task { @MainActor in
            onPlayerDestroy()
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
    let adTagParameters = try parseAdTagParameters(from: config["adTagParameters"])
    guard let assetKey = config["assetKey"] as? String else {
        throw googleDaiException(
            "GOOGLE_DAI_INVALID_SOURCE_CONFIG",
            "Google DAI source config requires an assetKey."
        )
    }

    return .live(
        assetKey: assetKey,
        apiKey: config["apiKey"] as? String,
        networkCode: config["networkCode"] as? String,
        adTagParameters: adTagParameters
    )
}

private func parseAdTagParameters(from value: Any?) throws -> [String: String] {
    guard let value else {
        return [:]
    }
    guard let rawMap = value as? [String: Any] else {
        throw googleDaiException(
            "GOOGLE_DAI_INVALID_SOURCE_CONFIG",
            "Google DAI adTagParameters must be an object with string keys and values."
        )
    }
    var parsed: [String: String] = [:]
    for (key, rawValue) in rawMap {
        guard let stringValue = rawValue as? String else {
            throw googleDaiException(
                "GOOGLE_DAI_INVALID_SOURCE_CONFIG",
                "Google DAI adTagParameters must contain only string keys and values."
            )
        }
        parsed[key] = stringValue
    }
    return parsed
}

private func googleDaiException(_ name: String, _ description: String) -> Exception {
    Exception(name: name, description: description)
}
