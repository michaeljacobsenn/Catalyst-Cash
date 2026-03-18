#import <Capacitor/Capacitor.h>
#import <Foundation/Foundation.h>

CAP_PLUGIN(ExportFilePlugin, "ExportFile",
           CAP_PLUGIN_METHOD(share, CAPPluginReturnPromise);)
