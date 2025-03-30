package expo.modules.gl;

import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.JavaScriptContextHolder;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class GLFrameProcessorModule extends ReactContextBaseJavaModule {
  public static final String NAME = "GLFrameProcessor";

  GLFrameProcessorModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  @NonNull
  public String getName() {
    return NAME;
  }
  // No static block for System.loadLibrary here; rely on EXGL.java to load "expo-gl"

  // Native method to register frame processor plugins with the JSI runtime
  public static native void registerFrameProcessorPlugin(long jsiPtr, String pluginName);

  @ReactMethod(isBlockingSynchronousMethod = true)
  public void install() {
    JavaScriptContextHolder jsContext = getReactApplicationContext().getJavaScriptContextHolder();

    if (jsContext.get() != 0) {
      // Register the uploadTexturePlugin specifically
      registerFrameProcessorPlugin(jsContext.get(), "uploadTexturePlugin");
    } else {
      Log.e("GLFrameProcessorModule", "JSI Runtime is not available in debug mode");
    }
  }
}