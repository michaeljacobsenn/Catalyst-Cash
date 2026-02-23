import Foundation
import Capacitor
import LocalAuthentication

@objc(FaceIdPlugin)
public class FaceIdPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FaceId"
    public let jsName = "FaceId"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise)
    ]
    
    @objc func isAvailable(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?

        // Check biometric/passcode availability
        let canBiometric = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)

        // Determine the biometric type
        var biometryType = "passcode"
        if canBiometric {
            switch context.biometryType {
            case .none:
                biometryType = "none"
            case .faceID:
                biometryType = "faceId"
            case .touchID:
                biometryType = "touchId"
            case .opticID:
                biometryType = "opticId"
            @unknown default:
                biometryType = "unknown"
            }
        }

        call.resolve([
            "isAvailable": canBiometric,
            "biometryType": biometryType,
            "errorCode": error?.code ?? 0,
            "errorMessage": error?.localizedDescription ?? ""
        ])
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "Authenticate to access Catalyst Cash"
        let context = LAContext()

        var error: NSError?

        // Evaluate biometrics only (no device passcode fallback)
        if context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) {
            context.localizedFallbackTitle = "" // Hide the generic "Enter Password" button
            context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, authError in
                DispatchQueue.main.async {
                    if success {
                        call.resolve(["success": true])
                    } else {
                        let code = (authError as NSError?)?.code ?? -1
                        let msg = authError?.localizedDescription ?? "Authentication failed"
                        call.reject(msg, String(code), authError)
                    }
                }
            }
        } else {
            // Biometrics not available — return detailed error
            let code = error?.code ?? -1
            let msg = error?.localizedDescription ?? "Biometrics not available"
            call.reject(msg, String(code), error)
        }
    }
}
