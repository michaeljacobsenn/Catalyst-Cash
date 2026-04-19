import Foundation
import Capacitor
import LocalAuthentication

@objc(FaceIdPlugin)
public class FaceIdPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "FaceIdPlugin"
    public let jsName = "FaceId"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise)
    ]

    private let defaultAuthReason = "Authenticate to access Catalyst Cash"
    private let maxReasonLength = 120

    @objc func isAvailable(_ call: CAPPluginCall) {
        let context = LAContext()
        var deviceAuthError: NSError?
        var biometricError: NSError?

        let canAuthenticate = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &deviceAuthError)
        let canUseBiometrics = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &biometricError)
        let biometryType = canUseBiometrics ? mappedBiometryType(from: context.biometryType) : "none"
        NSLog("[FaceIdPlugin] isAvailable canAuthenticate=%@ canUseBiometrics=%@ biometryType=%@ deviceError=%@ biometricError=%@",
              canAuthenticate.description,
              canUseBiometrics.description,
              biometryType,
              deviceAuthError?.localizedDescription ?? "",
              biometricError?.localizedDescription ?? "")

        let response: [String: Any] = [
            "isAvailable": canUseBiometrics,
            "canAuthenticate": canAuthenticate,
            "biometryType": biometryType,
            "errorCode": canUseBiometrics ? 0 : (biometricError?.code ?? deviceAuthError?.code ?? 0),
            "errorMessage": canUseBiometrics ? "" : (biometricError?.localizedDescription ?? deviceAuthError?.localizedDescription ?? "")
        ]

        call.resolve(response)
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        let reason = sanitizedReason(from: call.getString("reason"))
        let context = LAContext()
        NSLog("[FaceIdPlugin] authenticate requested reason=%@", reason)

        var availabilityError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &availabilityError) else {
            let code = availabilityError?.code ?? LAError.biometryNotAvailable.rawValue
            let message = availabilityError?.localizedDescription ?? "Device authentication is not available"
            NSLog("[FaceIdPlugin] authenticate unavailable code=%d message=%@", code, message)
            rejectOnMain(call, message: message, code: code, error: availabilityError)
            return
        }

        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { [weak self] success, authenticationError in
            guard let self else {
                DispatchQueue.main.async {
                    call.reject("Authentication session ended unexpectedly")
                }
                return
            }

            self.handleAuthenticationResult(
                success: success,
                authenticationError: authenticationError,
                call: call
            )
        }
    }

    private func mappedBiometryType(from biometryType: LABiometryType) -> String {
        switch biometryType {
        case .none:
            return "none"
        case .faceID:
            return "faceId"
        case .touchID:
            return "touchId"
        default:
            if #available(iOS 17.0, *), biometryType == .opticID {
                return "opticId"
            }
            return "unknown"
        }
    }

    private func sanitizedReason(from rawReason: String?) -> String {
        guard let rawReason else {
            return defaultAuthReason
        }

        let trimmed = rawReason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return defaultAuthReason
        }

        if trimmed.count > maxReasonLength {
            return String(trimmed.prefix(maxReasonLength))
        }

        return trimmed
    }

    private func handleAuthenticationResult(success: Bool, authenticationError: Error?, call: CAPPluginCall) {
        DispatchQueue.main.async {
            if success {
                NSLog("[FaceIdPlugin] authenticate success")
                call.resolve(["success": true])
                return
            }

            let nsError = authenticationError as NSError?
            let code = nsError?.code ?? LAError.authenticationFailed.rawValue
            let message = nsError?.localizedDescription ?? "Authentication failed"
            NSLog("[FaceIdPlugin] authenticate failure code=%d message=%@", code, message)
            call.reject(message, String(code), nsError)
        }
    }

    private func rejectOnMain(_ call: CAPPluginCall, message: String, code: Int, error: NSError?) {
        DispatchQueue.main.async {
            NSLog("[FaceIdPlugin] reject code=%d message=%@", code, message)
            call.reject(message, String(code), error)
        }
    }
}
