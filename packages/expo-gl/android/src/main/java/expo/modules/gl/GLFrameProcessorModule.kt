package expo.modules.gl

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class GLFrameProcessorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GLFrameProcessor")

    Function("install") {
      val jsContext = appContext.reactContext?.javaScriptContextHolder
      if (jsContext != null && jsContext.get() != 0) {
        registerFrameProcessorPlugin(jsContext.get(), "uploadTexturePlugin")
      } else {
        Log.e("GLFrameProcessorModule", "JSI Runtime is not available")
        throw Exception("JSI Runtime is not available")
      }
    }
  }

  private external fun registerFrameProcessorPlugin(jsiPtr: Long, pluginName: String)
}