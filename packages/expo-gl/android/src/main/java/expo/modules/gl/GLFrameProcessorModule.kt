package expo.modules.gl

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.JavaScriptContextHolder

class GLFrameProcessorModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("GLFrameProcessor")

        // Log when the module is initialized and definition is set up
        Log.d("GLFrameProcessorModule", "Module definition initialized")

        Function("install") {
            // Log when the install function is called
            Log.d("GLFrameProcessorModule", "install() function called")

            val reactContext = appContext.reactContext as? ReactApplicationContext
            // Log whether reactContext is available
            Log.d("GLFrameProcessorModule", "reactContext available: ${reactContext != null}")

            val jsContext = reactContext?.javaScriptContextHolder
            // Log whether jsContext is available
            Log.d("GLFrameProcessorModule", "jsContext available: ${jsContext != null}")

            if (jsContext != null && jsContext.get() != 0L) {
                // Log before calling the native function
                Log.d("GLFrameProcessorModule", "Registering uploadTexturePlugin with JSI runtime")
                registerFrameProcessorPlugin(jsContext.get(), "uploadTexturePlugin")
                // Log after successful registration
                Log.d("GLFrameProcessorModule", "uploadTexturePlugin registered successfully")
            } else {
                // Log failure case
                Log.e("GLFrameProcessorModule", "JSI Runtime is not available")
                throw Exception("JSI Runtime is not available")
            }
        }
    }

    private external fun registerFrameProcessorPlugin(jsiPtr: Long, pluginName: String)
}