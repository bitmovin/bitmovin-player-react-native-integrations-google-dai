import BitmovinPlayerCore
import Foundation
import RNBitmovinPlayer

let googleDaiSourceConfigFactoryEventName = "onSourceConfigFactoryRequest"

private let sourceConfigFactoryTimeout: TimeInterval = 0.25

final class GoogleDaiSourceConfigFactoryBridge {
    private struct PendingResult {
        let semaphore: DispatchSemaphore
        var value: [String: Any]?
    }

    private let lock = NSLock()
    private var nextRequestId = 0
    private var pendingResults: [Int: PendingResult] = [:]

    func removeAll() {
        lock.lock()
        let semaphores = pendingResults.values.map(\.semaphore)
        pendingResults.removeAll()
        lock.unlock()
        semaphores.forEach { $0.signal() }
    }

    func complete(requestId: Int, sourceConfig: [String: Any]?) {
        lock.lock()
        guard var result = pendingResults[requestId] else {
            lock.unlock()
            return
        }
        result.value = sourceConfig ?? [:]
        pendingResults[requestId] = result
        lock.unlock()
        result.semaphore.signal()
    }

    @MainActor
    func configureSourceConfigFromJs(
        sourceConfigFactoryId: NativeId,
        sourceConfig: SourceConfig,
        sendEvent: (_ eventName: String, _ body: [String: Any]) -> Void
    ) {
        // The upstream configuration callback is synchronous on MainActor, so the bridge uses
        // the same bounded wait pattern as other synchronous RN Bitmovin callbacks.
        let (requestId, semaphore) = makePendingResult()
        sendEvent(googleDaiSourceConfigFactoryEventName, [
            "requestId": requestId,
            "sourceConfigFactoryId": sourceConfigFactoryId,
            "context": sourceConfigFactoryContext(from: sourceConfig)
        ])

        _ = semaphore.wait(timeout: .now() + sourceConfigFactoryTimeout)
        guard let result = takePendingResult(requestId) else {
            return
        }
        applySourceConfigFactoryResult(result, to: sourceConfig)
    }

    private func makePendingResult() -> (id: Int, semaphore: DispatchSemaphore) {
        let semaphore = DispatchSemaphore(value: 0)
        lock.lock()
        nextRequestId += 1
        let requestId = nextRequestId
        pendingResults[requestId] = PendingResult(semaphore: semaphore, value: nil)
        lock.unlock()
        return (requestId, semaphore)
    }

    private func takePendingResult(_ requestId: Int) -> [String: Any]? {
        lock.lock()
        let result = pendingResults.removeValue(forKey: requestId)?.value
        lock.unlock()
        return result
    }
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
