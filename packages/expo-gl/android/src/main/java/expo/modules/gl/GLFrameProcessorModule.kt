package expo.modules.gl

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.JavaScriptContextHolder

class GLFrameProcessorModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("GLFrameProcessor")

        Function("install") {
            val reactContext = appContext.reactContext as? ReactApplicationContext
            val jsContext = reactContext?.javaScriptContextHolder
            if (jsContext != null && jsContext.get() != 0L) {
                registerFrameProcessorPlugin(jsContext.get(), "uploadTexturePlugin")
            } else {
                Log.e("GLFrameProcessorModule", "JSI Runtime is not available")
                throw Exception("JSI Runtime is not available")
            }
        }
    }

    private external fun registerFrameProcessorPlugin(jsiPtr: Long, pluginName: String)
}