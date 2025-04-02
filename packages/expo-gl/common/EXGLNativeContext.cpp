#include "EXGLNativeContext.h"
#include "EXPlatformUtils.h"
#include <GLES/gl.h> // OpenGL ES 1.0 headers
#include <cstring> // For memcpy
#include <android/bitmap.h> // For Android Bitmap API
#include <cstdint> // for uint32_t
#include "EXWebGLMethods.h"
#include "EXWebGLMethodsHelpers.h"
#include "EXGLImageUtils.h"
//#include "EXWebGLConstants.def"

namespace expo {
namespace gl_cpp {

constexpr const char *OnJSRuntimeDestroyPropertyName = "__EXGLOnJsRuntimeDestroy";

void EXGLContext::prepareContext(jsi::Runtime &runtime, std::function<void(void)> flushMethod) {
  this->flushOnGLThread = flushMethod;
  try {
    this->initialGlesContext = prepareOpenGLESContext();
    createWebGLRenderer(runtime, this, this->initialGlesContext, runtime.global());
    tryRegisterOnJSRuntimeDestroy(runtime);

    maybeResolveWorkletContext(runtime);
  } catch (const std::runtime_error &err) {
    EXGLSysLog("Failed to setup EXGLContext [%s]", err.what());
  }
}


static void checkGLError(const char* msg) {
    GLenum err = glGetError();
    if (err != GL_NO_ERROR) {
        EXGLSysLog("OpenGL Error %d after %s", err, msg);
    }
}

int EXGLContext::uploadTextureToOpenGL(
  jsi::Runtime &runtime,
  AHardwareBuffer *hardwareBuffer
) {
  // Check for null pointer
  if (!hardwareBuffer) {
    __android_log_print(ANDROID_LOG_ERROR, "EXGLContext", "Null pointer exception: hardwareBuffer is null");
    return 0;
  }
  __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Hardware buffer is valid");

  // Create a new WebGL texture object ID in EXGL
  int exglObjId = createObject();
  __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Created EXGL object ID: %d", exglObjId);

  try {
    // Describe the buffer
    AHardwareBuffer_Desc desc = {};
    AHardwareBuffer_describe(hardwareBuffer, &desc);
    __android_log_print(ANDROID_LOG_INFO, "EXGLContext", 
                        "Hardware buffer: Width=%u, Height=%u, Format=%u", 
                        desc.width, desc.height, desc.format);

    // Validate format
    if (desc.format != AHARDWAREBUFFER_FORMAT_R8G8B8A8_UNORM &&
        desc.format != AHARDWAREBUFFER_FORMAT_Y8Cb8Cr8_420) {
      __android_log_print(ANDROID_LOG_ERROR, "EXGLContext", 
                          "Unsupported hardware buffer format %u", desc.format);
      return 0;
    }
    __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Format %u is supported", desc.format);

    int width = static_cast<int>(desc.width);
    int height = static_cast<int>(desc.height);

    if (desc.format == AHARDWAREBUFFER_FORMAT_Y8Cb8Cr8_420) {
      __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Processing YUV format");
      // --- YUV path ---
      AHardwareBuffer_Planes planes;
      int32_t lockResult = AHardwareBuffer_lockPlanes(
          hardwareBuffer,
          AHARDWAREBUFFER_USAGE_CPU_READ_OFTEN,
          -1,  // fence
          nullptr,  // rect
          &planes
      );
      if (lockResult != 0) {
        __android_log_print(ANDROID_LOG_ERROR, "EXGLContext", 
                            "Failed to lockPlanes() for YUV, error code: %d", lockResult);
        return 0;
      }
      __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Successfully locked YUV planes");

      void* yPlane = planes.planes[0].data;
      void* uPlane = planes.planes[1].data;
      void* vPlane = planes.planes[2].data;

      int yStride = planes.planes[0].rowStride;
      int uStride = planes.planes[1].rowStride;
      int vStride = planes.planes[2].rowStride;
      int pixelStride = planes.planes[1].pixelStride;
      __android_log_print(ANDROID_LOG_INFO, "EXGLContext", 
                          "YUV planes: yStride=%d, uStride=%d, vStride=%d, pixelStride=%d", 
                          yStride, uStride, vStride, pixelStride);

      // Create new EXGL object IDs for the U/V textures
      int uPlaneObjId = createObject();
      int vPlaneObjId = createObject();
      __android_log_print(ANDROID_LOG_INFO, "EXGLContext", 
                          "Created U/V plane IDs: %d, %d", uPlaneObjId, vPlaneObjId);

      // Copy the Y plane into a std::vector
      std::vector<uint8_t> yVec(height * width);
      for (int row = 0; row < height; ++row) {
        std::memcpy(
            yVec.data() + (row * width),
            static_cast<uint8_t*>(yPlane) + (row * yStride),
            width
        );
      }

      // Copy the U and V planes
      std::vector<uint8_t> uVec((height / 2) * (width / 2));
      std::vector<uint8_t> vVec((height / 2) * (width / 2));
      auto* srcU = static_cast<uint8_t*>(uPlane);
      auto* srcV = static_cast<uint8_t*>(vPlane);

      for (int row = 0; row < (height / 2); ++row) {
        for (int col = 0; col < (width / 2); ++col) {
          int dstIndex = row * (width / 2) + col;
          uVec[dstIndex] = srcU[row * uStride + col * pixelStride];
          vVec[dstIndex] = srcV[row * vStride + col * pixelStride];
        }
      }
      __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Copied YUV planes to vectors");

      // Unlock the buffer now that CPU copy is done
      int32_t unlockResult = AHardwareBuffer_unlock(hardwareBuffer, nullptr);
      if (unlockResult != 0) {
        __android_log_print(ANDROID_LOG_ERROR, "EXGLContext", 
                            "Failed to unlock YUV buffer, error code: %d", unlockResult);
      } else {
        __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Unlocked YUV buffer");
      }

      // Flip Y/U/V images in CPU memory
      gl_cpp::flipPixels(yVec.data(), width, height);
      gl_cpp::flipPixels(uVec.data(), width / 2, height / 2);
      gl_cpp::flipPixels(vVec.data(), width / 2, height / 2);
      __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Flipped YUV images");

      // Schedule GL upload on the queued thread
      addToNextBatch([=, yVec{std::move(yVec)}, uVec{std::move(uVec)}, vVec{std::move(vVec)}] {
        try {
          __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Starting YUV texture upload batch");
          glPixelStorei(GL_UNPACK_ALIGNMENT, 1);

          GLuint textureY, textureU, textureV;
          glGenTextures(1, &textureY);
          glGenTextures(1, &textureU);
          glGenTextures(1, &textureV);
          __android_log_print(ANDROID_LOG_INFO, "EXGLContext", 
                              "Generated YUV textures: Y=%u, U=%u, V=%u", 
                              textureY, textureU, textureV);

          // Upload Y-plane
          glActiveTexture(GL_TEXTURE0);
          glBindTexture(GL_TEXTURE_2D, textureY);
          glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
          glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
          glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
          glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
          glTexImage2D(
              GL_TEXTURE_2D,
              0,
              GL_LUMINANCE,
              width,
              height,
              0,
              GL_LUMINANCE,
              GL_UNSIGNED_BYTE,
              yVec.data()
          );
    

          // Upload U-plane
          glActiveTexture(GL_TEXTURE1);
          glBindTexture(GL_TEXTURE_2D, textureU);
          glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
          glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
          glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
          glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
          glTexImage2D(
              GL_TEXTURE_2D,
              0,
              GL_LUMINANCE,
              width / 2,
              height / 2,
              0,
              GL_LUMINANCE,
              GL_UNSIGNED_BYTE,
              uVec.data()
          );
         
          // Upload V-plane
          glActiveTexture(GL_TEXTURE2);
          glBindTexture(GL_TEXTURE_2D, textureV);
          glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
          glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
          glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
          glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
          glTexImage2D(
              GL_TEXTURE_2D,
              0,
              GL_LUMINANCE,
              width / 2,
              height / 2,
              0,
              GL_LUMINANCE,
              GL_UNSIGNED_BYTE,
              vVec.data()
          );
          __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Uploaded YUV textures");

          // Register the Y/U/V textures with the EXGL object IDs
          mapObject(exglObjId, textureY);
          mapObject(uPlaneObjId, textureU);
          mapObject(vPlaneObjId, textureV);
        } catch (const std::exception &e) {
          __android_log_print(ANDROID_LOG_ERROR, "EXGLContext", 
                              "Exception in YUV upload batch: %s", e.what());
        }
      });

      // Attempt to create the JS WebGLTexture object
      __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Attempting to create JS WebGLTexture object");
      const char* constructorName = getConstructorName(EXWebGLClass::WebGLTexture).c_str(); // Fixed: Use .c_str()
      __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Constructor name: %s", constructorName);

      jsi::Value constructorValue = runtime.global().getProperty(runtime, jsi::PropNameID::forUtf8(runtime, constructorName));
      if (constructorValue.isUndefined() || !constructorValue.isObject()) {
        __android_log_print(ANDROID_LOG_ERROR, "EXGLContext", "Constructor %s is undefined or not an object", constructorName);
        return 0;
      }

      jsi::Function constructorFunc = constructorValue.asObject(runtime).asFunction(runtime);
      jsi::Object webglObject = constructorFunc.callAsConstructor(runtime, {}).asObject(runtime);
      webglObject.setProperty(runtime, "id", jsi::Value(static_cast<double>(exglObjId)));
      __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Created JS WebGLTexture object with ID: %d", exglObjId);

      return exglObjId;

    } else {
      __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Processing RGBA format");
      // --- RGBA path ---
      void *bufferData = nullptr;
      int32_t lockResult = AHardwareBuffer_lock(
          hardwareBuffer,
          AHARDWAREBUFFER_USAGE_CPU_READ_OFTEN,
          -1,    // fence
          nullptr,
          &bufferData
      );
      if (lockResult != 0 || !bufferData) {
        __android_log_print(ANDROID_LOG_ERROR, "EXGLContext", 
                            "Failed to lock RGBA buffer, error code: %d", lockResult);
        return 0;
      }
      __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Locked RGBA buffer");

      addToNextBatch([=, bufferData{bufferData}] {
        try {
          GLuint texId;
          glGenTextures(1, &texId);
          __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Generated RGBA texture: %u", texId);

          glBindTexture(GL_TEXTURE_2D, texId);
          glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
          glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
          glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
          glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);

          glTexImage2D(
              GL_TEXTURE_2D,
              0,
              GL_RGBA,
              width,
              height,
              0,
              GL_RGBA,
              GL_UNSIGNED_BYTE,
              bufferData
          );
          GLenum err = glGetError();
          if (err != GL_NO_ERROR) {
            __android_log_print(ANDROID_LOG_ERROR, "EXGLContext", 
                                "glTexImage2D (RGBA) failed, GL error: %u", err);
          }

          __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Uploaded RGBA texture");

          mapObject(exglObjId, texId);

          int32_t unlockResult = AHardwareBuffer_unlock(hardwareBuffer, nullptr);
          if (unlockResult != 0) {
            __android_log_print(ANDROID_LOG_ERROR, "EXGLContext", 
                                "Failed to unlock RGBA buffer, error code: %d", unlockResult);
          } else {
            __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Unlocked RGBA buffer");
          }
        } catch (const std::exception &e) {
          __android_log_print(ANDROID_LOG_ERROR, "EXGLContext", 
                              "Exception in RGBA upload: %s", e.what());
        }
      });
/*
      // Create the JS-side WebGLTexture object for RGBA
      __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Attempting to create JS WebGLTexture object for RGBA");
      const char* constructorName = getConstructorName(EXWebGLClass::WebGLTexture).c_str(); // Fixed: Use .c_str()
      __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Constructor name: %s", constructorName);

      jsi::Value constructorValue = runtime.global().getProperty(runtime, jsi::PropNameID::forUtf8(runtime, constructorName));
      if (constructorValue.isUndefined() || !constructorValue.isObject()) {
        __android_log_print(ANDROID_LOG_ERROR, "EXGLContext", "Constructor %s is undefined or not an object", constructorName);
        return 0;
      }

      jsi::Function constructorFunc = constructorValue.asObject(runtime).asFunction(runtime);
      jsi::Object webglObject = constructorFunc.callAsConstructor(runtime, {}).asObject(runtime);
      webglObject.setProperty(runtime, "id", jsi::Value(static_cast<double>(exglObjId)));*/

      __android_log_print(ANDROID_LOG_INFO, "EXGLContext", "Created JS WebGLTexture object with ID: %d", exglObjId);

      return exglObjId;
    }

  } catch (const std::exception &e) {
    __android_log_print(ANDROID_LOG_ERROR, "EXGLContext", "Exception in uploadTextureToOpenGL: %s", e.what());
    return 0;
  } catch (...) {
    __android_log_print(ANDROID_LOG_ERROR, "EXGLContext", "Unknown exception in uploadTextureToOpenGL");
    return 0;
  }
}
void EXGLContext::maybeResolveWorkletContext(jsi::Runtime &runtime) {
  jsi::Value workletRuntimeValue = runtime.global().getProperty(runtime, "_WORKLET_RUNTIME");
  if (!workletRuntimeValue.isObject()) {
    return;
  }
  jsi::Object workletRuntimeObject = workletRuntimeValue.getObject(runtime);
  if (!workletRuntimeObject.isArrayBuffer(runtime)) {
    return;
  }
  size_t pointerSize = sizeof(void *);
  jsi::ArrayBuffer workletRuntimeArrayBuffer = workletRuntimeObject.getArrayBuffer(runtime);
  if (workletRuntimeArrayBuffer.size(runtime) != pointerSize) {
    return;
  }
  uintptr_t rawWorkletRuntimePointer =
      *reinterpret_cast<uintptr_t *>(workletRuntimeArrayBuffer.data(runtime));
  jsi::Runtime *workletRuntime = reinterpret_cast<jsi::Runtime *>(rawWorkletRuntimePointer);
  this->maybeWorkletRuntime = workletRuntime;
}

void EXGLContext::prepareWorkletContext() {
  if (maybeWorkletRuntime == nullptr) {
    return;
  }
  jsi::Runtime &runtime = *this->maybeWorkletRuntime;
  createWebGLRenderer(
      runtime, this, initialGlesContext, runtime.global().getPropertyAsObject(runtime, "global"));
  tryRegisterOnJSRuntimeDestroy(runtime);
}

void EXGLContext::endNextBatch() noexcept {
  std::lock_guard<std::mutex> lock(backlogMutex);
  backlog.push_back(std::move(nextBatch));
  nextBatch = std::vector<Op>();
  nextBatch.reserve(16); // default batch size
}

// [JS thread] Add an Op to the 'next' batch -- the arguments are any form of
// constructor arguments for Op
void EXGLContext::addToNextBatch(Op &&op) noexcept {
  nextBatch.push_back(std::move(op));
}

// [JS thread] Add a blocking operation to the 'next' batch -- waits for the
// queued function to run before returning
void EXGLContext::addBlockingToNextBatch(Op &&op) {
  std::packaged_task<void(void)> task(std::move(op));
  auto future = task.get_future();
  addToNextBatch([&] { task(); });
  endNextBatch();
  flushOnGLThread();
  future.wait();
}

// [JS thread] Enqueue a function and return an EXGL object that will get mapped
// to the function's return value when it is called on the GL thread.
jsi::Value EXGLContext::addFutureToNextBatch(
    jsi::Runtime &runtime,
    std::function<unsigned int(void)> &&op) noexcept {
  auto exglObjId = createObject();
  addToNextBatch([=] {
    assert(objects.find(exglObjId) == objects.end());
    mapObject(exglObjId, op());
  });
  return static_cast<double>(exglObjId);
}

// [GL thread] Do all the remaining work we can do on the GL thread
void EXGLContext::flush(void) {
  // Keep a copy and clear backlog to minimize lock time
  std::vector<Batch> copy;
  {
    std::lock_guard<std::mutex> lock(backlogMutex);
    std::swap(backlog, copy);
  }
  for (const auto &batch : copy) {
    for (const auto &op : batch) {
      op();
    }
  }
}

EXGLObjectId EXGLContext::createObject(void) noexcept {
  return nextObjectId++;
}

void EXGLContext::destroyObject(EXGLObjectId exglObjId) noexcept {
  objects.erase(exglObjId);
}

void EXGLContext::mapObject(EXGLObjectId exglObjId, GLuint glObj) noexcept {
  objects[exglObjId] = glObj;
}

GLuint EXGLContext::lookupObject(EXGLObjectId exglObjId) noexcept {
  auto iter = objects.find(exglObjId);
  if(iter == objects.end()){
      EXGLSysLog("lookup for exglObjId %d failed.", exglObjId);
  }
  return iter == objects.end() ? 0 : iter->second;
}

void EXGLContext::tryRegisterOnJSRuntimeDestroy(jsi::Runtime &runtime) {
  auto global = runtime.global();

  if (global.getProperty(runtime, OnJSRuntimeDestroyPropertyName).isObject()) {
    return;
  }
  // Property `__EXGLOnJsRuntimeDestroy` of the global object will be released when entire
  // `jsi::Runtime` is being destroyed and that will trigger destructor of
  // `InvalidateCacheOnDestroy` class which will invalidate JSI PropNameID cache.
  global.setProperty(
      runtime,
      OnJSRuntimeDestroyPropertyName,
      jsi::Object::createFromHostObject(
          runtime, std::make_shared<InvalidateCacheOnDestroy>(runtime)));
}

glesContext EXGLContext::prepareOpenGLESContext() {
  glesContext result;
  // Clear everything to initial values

  
  addBlockingToNextBatch([&] {
    std::string version = reinterpret_cast<const char *>(glGetString(GL_VERSION));
    double glesVersion = strtod(version.substr(10).c_str(), 0);
    this->supportsWebGL2 = glesVersion >= 3.0;

    glBindFramebuffer(GL_FRAMEBUFFER, defaultFramebuffer);
    GLenum status = glCheckFramebufferStatus(GL_FRAMEBUFFER);

    // This should not be called on headless contexts as they don't have default framebuffer.
    // On headless context, status is undefined.
    if (status != GL_FRAMEBUFFER_UNDEFINED) {
      glClearColor(0, 0, 0, 0);
      glClearDepthf(1);
      glClearStencil(0);
      glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT | GL_STENCIL_BUFFER_BIT);
      int32_t viewport[4];
      glGetIntegerv(GL_VIEWPORT, viewport);
      result.viewportWidth = viewport[2];
      result.viewportHeight = viewport[3];
    } else {
      // Set up an initial viewport for headless context.
      // These values are the same as newly created WebGL context has,
      // however they should be changed by the user anyway.
      glViewport(0, 0, 300, 150);
      result.viewportWidth = 300;
      result.viewportHeight = 150;
    }
  });
  return result;
}

void EXGLContext::maybeReadAndCacheSupportedExtensions() {
  if (supportedExtensions.size() == 0) {
    addBlockingToNextBatch([&] {
      GLint numExtensions = 0;
      glGetIntegerv(GL_NUM_EXTENSIONS, &numExtensions);

      for (auto i = 0; i < numExtensions; i++) {
        std::string extensionName(reinterpret_cast<const char *>(glGetStringi(GL_EXTENSIONS, i)));

        // OpenGL ES prefixes extension names with `GL_`, need to trim this.
        if (extensionName.substr(0, 3) == "GL_") {
          extensionName.erase(0, 3);
        }
        if (extensionName != "OES_vertex_array_object") {
          supportedExtensions.insert(extensionName);
        }
      }
    });

    supportedExtensions.insert("OES_texture_float_linear");
    supportedExtensions.insert("OES_texture_half_float_linear");

    // OpenGL ES 3.0 supports these out of the box.
    if (supportsWebGL2) {
      supportedExtensions.insert("WEBGL_compressed_texture_astc");
      supportedExtensions.insert("WEBGL_compressed_texture_etc");
    }

#ifdef __APPLE__
    // All iOS devices support PVRTC compression format.
    supportedExtensions.insert("WEBGL_compressed_texture_pvrtc");
#endif
  }
}

} // namespace gl_cpp
} // namespace expo
