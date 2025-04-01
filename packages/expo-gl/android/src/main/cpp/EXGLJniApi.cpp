#include <stdint.h>
#include <jni.h>
#include <thread>
#include <android/log.h>
#include <android/hardware_buffer.h>
#include <jsi/jsi.h>
#include "EXGLNativeApi.h"
#include "EXPlatformUtils.h"
#include <stdio.h>
#include "EXGLImageUtils.h"
#include "react-native-vision-camera/FrameHostObject.h"

using namespace facebook::jsi;

extern "C" {

thread_local JNIEnv* threadLocalEnv;

JNIEXPORT jint JNICALL
Java_expo_modules_gl_cpp_EXGL_EXGLContextCreate
(JNIEnv *env, jclass clazz) {
  return EXGLContextCreate();
}

JNIEXPORT void JNICALL
Java_expo_modules_gl_cpp_EXGL_EXGLContextPrepare
(JNIEnv *env, jclass clazz, jlong jsiPtr, jint exglCtxId, jobject glContext) {
  threadLocalEnv = env;
  jclass GLContextClass = env->GetObjectClass(glContext);
  jobject glContextRef = env->NewGlobalRef(glContext);
  jmethodID flushMethodRef = env->GetMethodID(GLContextClass, "flush", "()V");

  std::function<void(void)> flushMethod = [glContextRef, flushMethodRef] {
    threadLocalEnv->CallVoidMethod(glContextRef, flushMethodRef);
  };
  EXGLContextPrepare((void*) jsiPtr, exglCtxId, flushMethod);
}

JNIEXPORT void JNICALL
Java_expo_modules_gl_cpp_EXGL_EXGLRegisterFrameProcessorPlugin(
    JNIEnv *env,
    jclass clazz,
    jlong jsiPtr,
    jstring pluginName) {
  Runtime* runtime = reinterpret_cast<Runtime*>(jsiPtr);
  const char* name = env->GetStringUTFChars(pluginName, nullptr);

  auto uploadTexturePlugin = [](jsi::Runtime& runtime, const jsi::Value& thisArg, const jsi::Value* args, size_t count) -> jsi::Value {
    __android_log_print(ANDROID_LOG_INFO, "EXGLJni", "uploadTexturePlugin called with %zu arguments", count);
    if (count < 2) {
      throw jsi::JSError(runtime, "Expected 2 arguments");
    }
    __android_log_print(ANDROID_LOG_INFO, "EXGLJni", "Arg 0 is number: %d", args[0].isNumber());
    __android_log_print(ANDROID_LOG_INFO, "EXGLJni", "Arg 1 is object: %d", args[1].isObject());
    if (!args[1].isObject()) {
      throw jsi::JSError(runtime, "Second argument is not an object");
    }
    auto frameHostObject = args[1].asObject(runtime).asHostObject<vision::FrameHostObject>(runtime);
    __android_log_print(ANDROID_LOG_INFO, "EXGLJni", "FrameHostObject retrieved");
    // Continue with frame processing
    int textureId = EXGLContextUploadTexture(&runtime, exglCtxId, hardwareBuffer);
    return jsi::Value(textureId);
  };

  runtime->global().setProperty(
      *runtime,
      name,
      Function::createFromHostFunction(
          *runtime,
          PropNameID::forUtf8(*runtime, name),
          2,
          uploadTexturePlugin
      )
  );

  __android_log_print(ANDROID_LOG_INFO, "EXGLJni", "Registered frame processor plugin: %s", name);
  env->ReleaseStringUTFChars(pluginName, name);
}

JNIEXPORT void JNICALL
Java_expo_modules_gl_GLObjectManagerModule_EXGLObjectManagerRegisterFrameProcessorPlugin(
    JNIEnv *env,
    jobject thiz,  // Changed from jclass to jobject
    jlong jsiPtr,
    jstring pluginName) {
  // Optionally, get the class if needed for delegation
  jclass clazz = env->GetObjectClass(thiz);
  // Delegate to the existing static method
  Java_expo_modules_gl_cpp_EXGL_EXGLRegisterFrameProcessorPlugin(env, clazz, jsiPtr, pluginName);
  // Add logging to verify execution
  __android_log_print(ANDROID_LOG_INFO, "EXGLJni", "EXGLObjectManagerRegisterFrameProcessorPlugin called");
}

JNIEXPORT void JNICALL
Java_expo_modules_gl_cpp_EXGL_EXGLContextPrepareWorklet
(JNIEnv *env, jclass clazz, jint exglCtxId) {
  threadLocalEnv = env;
  EXGLContextPrepareWorklet(exglCtxId);
}

JNIEXPORT void JNICALL
Java_expo_modules_gl_cpp_EXGL_EXGLContextDestroy
(JNIEnv *env, jclass clazz, jint exglCtxId) {
  EXGLContextDestroy(exglCtxId);
}

JNIEXPORT void JNICALL
Java_expo_modules_gl_cpp_EXGL_EXGLContextFlush
(JNIEnv *env, jclass clazz, jint exglCtxId) {
  EXGLContextFlush(exglCtxId);
}

JNIEXPORT jint JNICALL
Java_expo_modules_gl_cpp_EXGL_EXGLContextCreateObject
(JNIEnv *env, jclass clazz, jint exglCtxId) {
  return EXGLContextCreateObject(exglCtxId);
}

JNIEXPORT void JNICALL
Java_expo_modules_gl_cpp_EXGL_EXGLContextDestroyObject
(JNIEnv *env, jclass clazz, jint exglCtxId, jint exglObjId) {
  EXGLContextDestroyObject(exglCtxId, exglObjId);
}

JNIEXPORT void JNICALL
Java_expo_modules_gl_cpp_EXGL_EXGLContextMapObject
(JNIEnv *env, jclass clazz, jint exglCtxId, jint exglObjId, jint glObj) {
  EXGLContextMapObject(exglCtxId, exglObjId, glObj);
}

JNIEXPORT jint JNICALL
Java_expo_modules_gl_cpp_EXGL_EXGLContextGetObject
(JNIEnv *env, jclass clazz, jint exglCtxId, jint exglObjId) {
  return EXGLContextGetObject(exglCtxId, exglObjId);
}

JNIEXPORT jboolean JNICALL
Java_expo_modules_gl_cpp_EXGL_EXGLContextNeedsRedraw
(JNIEnv *env, jclass clazz, jint exglCtxId) {
  return EXGLContextNeedsRedraw(exglCtxId);
}

JNIEXPORT void JNICALL
Java_expo_modules_gl_cpp_EXGL_EXGLContextDrawEnded
(JNIEnv *env, jclass clazz, jint exglCtxId) {
  EXGLContextDrawEnded(exglCtxId);
}

#if __ANDROID_API__ >= 26
JNIEXPORT jint JNICALL
Java_expo_modules_gl_cpp_EXGL_EXGLContextUploadTexture(
    JNIEnv *env,
    jclass clazz,
    jlong jsiPtr,
    jint exglCtxId,
    jlong hardwareBuffer)
{
    if (hardwareBuffer == 0) {
        __android_log_print(ANDROID_LOG_ERROR, "EXGLJni", "Error: hardwareBuffer handle is zero");
        return 0;
    }

    AHardwareBuffer *nativeBuffer = reinterpret_cast<AHardwareBuffer *>(hardwareBuffer);
    if (!nativeBuffer) {
        __android_log_print(ANDROID_LOG_ERROR, "EXGLJni",
                            "Error: Failed to reinterpret jlong to AHardwareBuffer*");
        return 0;
    }

    AHardwareBuffer_acquire(nativeBuffer);

    int textureId = 0;
    try {
        AHardwareBuffer_Desc desc;
        AHardwareBuffer_describe(nativeBuffer, &desc);
        __android_log_print(ANDROID_LOG_INFO, "EXGLJni",
                            "Uploading texture: Width=%u, Height=%u, Format=%u, Layers=%u",
                            desc.width, desc.height, desc.format, desc.layers);

        textureId = EXGLContextUploadTexture(
            reinterpret_cast<Runtime*>(jsiPtr),
            exglCtxId,
            nativeBuffer
        );
    } catch (const std::exception &e) {
        __android_log_print(ANDROID_LOG_ERROR, "EXGLJni",
                            "Exception: %s", e.what());
    } catch (...) {
        __android_log_print(ANDROID_LOG_ERROR, "EXGLJni",
                            "Unknown error occurred in EXGLContextUploadTexture");
    }

    AHardwareBuffer_release(nativeBuffer);
    return textureId;
}
#else
JNIEXPORT void JNICALL
Java_expo_modules_gl_cpp_EXGL_EXGLContextUploadTexture(
    JNIEnv *env,
    jclass clazz,
    jint exglCtxId,
    jobject hardwareBuffer
) {
    __android_log_print(ANDROID_LOG_ERROR, "EXGLJni",
                        "AHardwareBuffer not supported on this API level.");
}
#endif

JNIEXPORT jlong JNICALL
Java_expo_modules_gl_cpp_EXGL_EXGLContextCreateTestHardwareBuffer(
    JNIEnv *env,
    jclass clazz,
    jint bufferFormat)
{
    AHardwareBuffer_Desc desc = {};
    desc.width = 256;
    desc.height = 256;
    desc.layers = 1;
    desc.format = (bufferFormat == 1) ? AHARDWAREBUFFER_FORMAT_Y8Cb8Cr8_420 : AHARDWAREBUFFER_FORMAT_R8G8B8A8_UNORM;
    desc.usage = AHARDWAREBUFFER_USAGE_GPU_SAMPLED_IMAGE | AHARDWAREBUFFER_USAGE_CPU_WRITE_RARELY;
    __android_log_print(ANDROID_LOG_INFO, "EXGLJni",
                        "Creating test hardware buffer with format: %d", desc.format);

    AHardwareBuffer *hardwareBuffer = nullptr;
    int result = AHardwareBuffer_allocate(&desc, &hardwareBuffer);
    if (result != 0 || hardwareBuffer == nullptr) {
        __android_log_print(ANDROID_LOG_ERROR, "EXGLJni",
                            "Failed to create AHardwareBuffer: %d", result);
        return 0;
    }

    AHardwareBuffer_acquire(hardwareBuffer);

    void *bufferData = nullptr;
    int lock_result = AHardwareBuffer_lock(
        hardwareBuffer,
        AHARDWAREBUFFER_USAGE_CPU_WRITE_RARELY,
        -1,
        nullptr,
        &bufferData
    );

    if (lock_result != 0 || !bufferData) {
        __android_log_print(ANDROID_LOG_ERROR, "EXGLJni", "Failed to lock AHardwareBuffer");
        AHardwareBuffer_release(hardwareBuffer);
        return 0;
    }

    if (desc.format == AHARDWAREBUFFER_FORMAT_R8G8B8A8_UNORM) {
        uint32_t red = 0xFF0000FF;
        uint32_t white = 0xFFFFFFFF;
        uint32_t squareSize = 32;

        uint32_t *pixels = static_cast<uint32_t *>(bufferData);
        for (uint32_t y = 0; y < desc.height; ++y) {
            for (uint32_t x = 0; x < desc.width; ++x) {
                bool isRedSquare = ((x / squareSize) % 2) == ((y / squareSize) % 2);
                pixels[y * desc.width + x] = isRedSquare ? red : white;
            }
        }
    } else if (desc.format == AHARDWAREBUFFER_FORMAT_Y8Cb8Cr8_420) {
        uint8_t *yPlane = reinterpret_cast<uint8_t *>(bufferData);
        uint8_t *uPlane = yPlane + (desc.width * desc.height);
        uint8_t *vPlane = uPlane + ((desc.width / 2) * (desc.height / 2));

        for (uint32_t y = 0; y < desc.height; ++y) {
            for (uint32_t x = 0; x < desc.width; ++x) {
                bool isBright = ((x / 32) % 2) == ((y / 32) % 2);
                yPlane[y * desc.width + x] = isBright ? 255 : 0;
            }
        }

        for (uint32_t y = 0; y < desc.height / 2; ++y) {
            for (uint32_t x = 0; x < desc.width / 2; ++x) {
                uPlane[y * (desc.width / 2) + x] = 128;
                vPlane[y * (desc.width / 2) + x] = 128;
            }
        }
    }
    AHardwareBuffer_unlock(hardwareBuffer, nullptr);

    uintptr_t pointer = reinterpret_cast<uintptr_t>(hardwareBuffer);
    __android_log_print(ANDROID_LOG_INFO, "EXGLJni", "Pointer to be sent: %p", hardwareBuffer);
    __android_log_print(ANDROID_LOG_INFO, "EXGLJni", "Pointer (64-bit unsigned): %llu", (unsigned long long) pointer);
    return (jlong)pointer;
}

} // extern "C"