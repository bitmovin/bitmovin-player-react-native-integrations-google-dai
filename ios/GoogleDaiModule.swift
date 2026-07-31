import BitmovinGoogleDAIPlayer
import BitmovinPlayer
import BitmovinPlayerCore
import ExpoModulesCore
import Foundation
import RNBitmovinPlayer

private let sourceConfigFactoryEventName = "onSourceConfigFactoryRequest"
private let sourceConfigFactoryTimeout: TimeInterval = 0.25

public class GoogleDaiModule: Module {
    private var playerIdsByGoogleDaiId: Registry<NativeId> = [:]
    private let sourceConfigFactoryWaiter = SourceConfigFactoryResultWaiter()

    public func definition() -> ModuleDefinition {
        Name("GoogleDaiModule")
        Events(sourceConfigFactoryEventName)

        OnDestroy { [weak self] in
            self?.playerIdsByGoogleDaiId.removeAll()
            self?.sourceConfigFactoryWaiter.removeAll()
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
                return
            }
            try self.load(
                googleDaiId: googleDaiId,
                sourceConfig: sourceConfig,
                sourceConfigFactoryId: sourceConfigFactoryId
            )
        }.runOnQueue(.main)
        // swiftlint:enable closure_parameter_position

        AsyncFunction("setSourceConfigFactoryResult") { [weak self] (requestId: Int, sourceConfig: [String: Any]?) in
            self?.sourceConfigFactoryWaiter.complete(id: requestId, with: sourceConfig ?? [:])
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
            self?.configureSourceConfigFromJs(
                googleDaiId: googleDaiId,
                sourceConfigFactoryId: validatedSourceConfigFactoryId,
                sourceConfig: nativeSourceConfig
            )
        }
    }

    @MainActor
    private func configureSourceConfigFromJs(
        googleDaiId: NativeId,
        sourceConfigFactoryId: String,
        sourceConfig: SourceConfig
    ) {
        let (requestId, wait) = sourceConfigFactoryWaiter.make(timeout: sourceConfigFactoryTimeout)
        sendEvent(sourceConfigFactoryEventName, [
            "requestId": requestId,
            "googleDaiId": googleDaiId,
            "sourceConfigFactoryId": sourceConfigFactoryId,
            "context": sourceConfigFactoryContext(from: sourceConfig)
        ])

        guard let result = wait() else {
            return
        }
        applySourceConfigFactoryResult(result, to: sourceConfig)
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
    if nativeId.isEmpty {
        throw googleDaiException(
            "GOOGLE_DAI_INVALID_NATIVE_ID",
            "\(field) must be a non-empty string."
        )
    }
    return nativeId
}

private func sourceConfigFactoryContext(from sourceConfig: SourceConfig) -> [String: Any] {
    [
        "url": sourceConfig.url.absoluteString,
        "sourceType": sourceConfig.type.toReactNativeValue(),
        "subtitleMetadata": []
    ]
}

private func applySourceConfigFactoryResult(_ result: [String: Any], to sourceConfig: SourceConfig) {
    if let title = result["title"] as? String {
        sourceConfig.title = title
    }
    if let description = result["description"] as? String {
        sourceConfig.sourceDescription = description
    }
    if let poster = url(from: result["poster"]) {
        sourceConfig.posterSource = poster
    }
    if let isPosterPersistent = result["isPosterPersistent"] as? Bool {
        sourceConfig.isPosterPersistent = isPosterPersistent
    }
    if let subtitleTracks = result["subtitleTracks"] as? [[String: Any]] {
        subtitleTracks.compactMap(subtitleTrack(from:)).forEach { sourceConfig.add(subtitleTrack: $0) }
    }
    if let thumbnailTrack = thumbnailTrack(from: result["thumbnailTrack"]) {
        sourceConfig.thumbnailTrack = thumbnailTrack
    }
    if let metadata = stringDictionary(from: result["metadata"]) {
        sourceConfig.metadata = metadata
    }
    if let options = result["options"] as? [String: Any] {
        sourceConfig.options = sourceOptions(from: options)
    }
}

private func sourceOptions(from json: [String: Any]) -> SourceOptions {
    let sourceOptions = SourceOptions()
    if let startOffset = json["startOffset"] as? NSNumber {
        sourceOptions.startOffset = startOffset.doubleValue
    }
    sourceOptions.startOffsetTimelineReference = timelineReferencePoint(from: json["startOffsetTimelineReference"])
    return sourceOptions
}

private func timelineReferencePoint(from value: Any?) -> TimelineReferencePoint {
    switch value as? String {
    case "start":
        return .start
    case "end":
        return .end
    default:
        return .auto
    }
}

private func subtitleTrack(from json: [String: Any]) -> SubtitleTrack? {
    guard let url = url(from: json["url"]),
          let label = json["label"] as? String
    else {
        return nil
    }

    let identifier = json["identifier"] as? String ?? UUID().uuidString
    let isDefaultTrack = json["isDefault"] as? Bool ?? false
    let language = json["language"] as? String
    let isForced = json["isForced"] as? Bool ?? false

    if let format = subtitleFormat(from: json["format"]) {
        return SubtitleTrack(
            url: url,
            format: format,
            label: label,
            identifier: identifier,
            isDefaultTrack: isDefaultTrack,
            language: language,
            forced: isForced
        )
    }

    return SubtitleTrack(
        url: url,
        label: label,
        identifier: identifier,
        isDefaultTrack: isDefaultTrack,
        language: language,
        forced: isForced
    )
}

private func subtitleFormat(from value: Any?) -> SubtitleFormat? {
    switch value as? String {
    case "cea":
        return .cea
    case "vtt":
        return .webVtt
    case "ttml":
        return .ttml
    case "srt":
        return .srt
    default:
        return nil
    }
}

private func thumbnailTrack(from value: Any?) -> ThumbnailTrack? {
    guard let url = url(from: value) else {
        return nil
    }
    return ThumbnailTrack(
        url: url,
        label: "Thumbnails",
        identifier: UUID().uuidString,
        isDefaultTrack: false
    )
}

private func url(from value: Any?) -> URL? {
    guard let string = value as? String else {
        return nil
    }
    return URL(string: string)
}

private func stringDictionary(from value: Any?) -> [String: String]? {
    if let dictionary = value as? [String: String] {
        return dictionary
    }
    guard let dictionary = value as? [String: Any] else {
        return nil
    }

    var result: [String: String] = [:]
    for (key, value) in dictionary {
        guard let stringValue = value as? String else {
            return nil
        }
        result[key] = stringValue
    }
    return result
}

private extension SourceType {
    func toReactNativeValue() -> String {
        switch self {
        case .dash:
            return "dash"
        case .hls:
            return "hls"
        case .progressive:
            return "progressive"
        default:
            return "none"
        }
    }
}

private final class SourceConfigFactoryResultWaiter {
    private struct Entry {
        let semaphore: DispatchSemaphore
        var value: [String: Any]?
    }

    private let lock = NSLock()
    private var nextId = 0
    private var entries: [Int: Entry] = [:]

    func make(timeout: TimeInterval) -> (id: Int, wait: () -> [String: Any]?) {
        let semaphore = DispatchSemaphore(value: 0)
        lock.lock()
        nextId += 1
        let id = nextId
        entries[id] = Entry(semaphore: semaphore, value: nil)
        lock.unlock()

        let wait = { [weak self] () -> [String: Any]? in
            _ = semaphore.wait(timeout: .now() + timeout)
            guard let self else {
                return nil
            }
            self.lock.lock()
            let value = self.entries[id]?.value
            self.entries[id] = nil
            self.lock.unlock()
            return value
        }

        return (id, wait)
    }

    func complete(id: Int, with value: [String: Any]) {
        lock.lock()
        guard var entry = entries[id] else {
            lock.unlock()
            return
        }
        entry.value = value
        entries[id] = entry
        lock.unlock()
        entry.semaphore.signal()
    }

    func removeAll() {
        lock.lock()
        let semaphores = entries.values.map(\.semaphore)
        entries.removeAll()
        lock.unlock()
        semaphores.forEach { $0.signal() }
    }
}

private func googleDaiException(_ name: String, _ description: String) -> Exception {
    Exception(name: name, description: description)
}
