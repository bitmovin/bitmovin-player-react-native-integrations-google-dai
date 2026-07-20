import ExpoModulesCore

public class GoogleDaiModule: Module {
    public func definition() -> ModuleDefinition {
        Name("GoogleDaiModule")

        AsyncFunction("initialize") { (_: String, _: String) in
            throw googleDaiException()
        }.runOnQueue(.main)

        AsyncFunction("load") { (_: String, _: [String: Any]) in
            throw googleDaiException()
        }.runOnQueue(.main)

        AsyncFunction("destroy") { (_: String) in
            // No-op placeholder until iOS Google DAI support is implemented.
        }.runOnQueue(.main)
    }
}

private func googleDaiException() -> Exception {
    Exception(
        name: "IOS_GOOGLE_DAI_NOT_IMPLEMENTED",
        description: "Google DAI is not implemented on iOS yet."
    )
}
