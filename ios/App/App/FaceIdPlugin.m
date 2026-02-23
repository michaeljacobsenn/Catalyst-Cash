#import <Capacitor/Capacitor.h>
#import <Foundation/Foundation.h>

CAP_PLUGIN(FaceIdPlugin, "FaceId",
           CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(authenticate, CAPPluginReturnPromise);)
