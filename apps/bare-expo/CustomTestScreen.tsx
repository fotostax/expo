import BufferViewer from 'components/BufferViewer';
import { useGLBufferFrameManager } from 'components/GLBufferFrameManager';
import { renderYUVToRGB, checkGLError } from 'components/GLContextManager';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useTensorflowModel } from 'react-native-fast-tflite';
import {
  Frame,
  FrameInternal,
  useCameraDevice,
  useFrameProcessor,
  Camera,
  useCameraFormat,
} from 'react-native-vision-camera';
import {
  Face,
  useFaceDetector,
  FaceDetectionOptions,
} from 'react-native-vision-camera-face-detector';
import { Worklets } from 'react-native-worklets-core';
import { useResizePlugin } from 'vision-camera-resize-plugin';

const CustomTestScreen = () => {
  const { initializeContext, addFrame, frames } = useGLBufferFrameManager();
  const [gl, setGL] = useState(null);
  const [currentFrameId, setCurrentFrameId] = useState(0);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progYUV, setProgYuv] = useState(null);
  const [vtxBuffer, setvtxBuffer] = useState(null);
  const [frameBuffer, setFrameBuffer] = useState(null);
  const objectDetection = useTensorflowModel(require('assets/efficientdet.tflite'));

  const model = objectDetection.state === 'loaded' ? objectDetection.model : undefined;
  
  const { resize } = useResizePlugin();

  const device = useCameraDevice('front');

  const format4k30fps = useCameraFormat(device, [
    { videoAspectRatio: 16 / 9 },
    { videoResolution: { width: 3048, height: 2160 } },
    { fps: 30 },
  ]);

  const format108030fps = useCameraFormat(device, [
    { videoAspectRatio: 16 / 9 },
    { videoResolution: { width: 1929, height: 1080 } },
    { fps: 30 },
  ]);

  const faceDetectionOptions = useRef<FaceDetectionOptions>({
    // detection options
  }).current;
  const { detectFaces } = useFaceDetector(faceDetectionOptions);

  // Initialize GL context when the component mounts
  useEffect(() => {
    const setupGL = async () => {
      const glCtx = await initializeContext();
      if (glCtx) {
        setGL(glCtx);
        await onContextCreate(glCtx);
        console.log(model)
      }
    };
    setupGL();
  }, [initializeContext]);

  // Function to prepare the GL context
  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    console.log('Preparing GL Context.');
    try {
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

      checkGLError(gl, 'Creating Framebuffer');
      setFrameBuffer(fbo);
      const { progYUV, vtxBuffer } = await GLView.prepareContextForNativeCamera(gl.contextId);
      checkGLError(gl, 'Preparing Native Camera Context');
      setProgYuv(progYUV);
      setvtxBuffer(vtxBuffer);
    } catch (error) {
      console.error('Error during GL context preparation:', error);
    }
  };

  const yuvToRGBCallback = Worklets.createRunOnJS(
    async (frame: Frame, faces: Face[], objectsModelOutput: any) => {
      const internal = frame as FrameInternal;
      internal.incrementRefCount();

      const nativeBuffer = frame.getNativeBuffer();
      const pointer = nativeBuffer.pointer;

      // Hardware Buffer width/height are inverted
      const textureWidth = frame.height;
      const textureHeight = frame.width;

      try {
        const textureId = await GLView.createTextureFromTexturePointer(gl.contextId, pointer);
        internal.decrementRefCount();
        nativeBuffer.delete();

        checkGLError(gl, 'Creating Texture from Pointer');
        const rgbTexture = renderYUVToRGB(
          gl,
          progYUV,
          vtxBuffer,
          frameBuffer,
          textureId,
          textureWidth,
          textureHeight
        );
        checkGLError(gl, 'Rendering Yuv to RGB');
        addFrame(rgbTexture, { textureWidth, textureHeight, faces, objectsModelOutput });
      } catch (error) {
        console.error('Error in HB upload:', error);
        throw error;
      }
    }
  );

  const frameProcessor = useFrameProcessor(
    async (frame: Frame) => {
      'worklet';
      if (isProcessing) {
        // 1. Resize 4k Frame to 192x192x3 using vision-camera-resize-plugin
        const resized = resize(frame, {
          scale: {
            width: 192,
            height: 192,
          },
          pixelFormat: 'rgb',
          dataType: 'uint8',
        });
        console.log(resized.length)
        const objectsModelOutput = model.runSync([resized]);
        /*
        // 3. Interpret outputs accordingly
        const detection_boxes = outputs[0]
        const detection_classes = outputs[1]
        const detection_scores = outputs[2]
        const num_detections = outputs[3]
        console.log(`Detected ${num_detections[0]} objects!`);
*/

        const faces = detectFaces(frame);
        await yuvToRGBCallback(frame, faces, objectsModelOutput);
      }
    },
    [isProcessing]
  );

  const handleScreenTap = useCallback(() => {
    if (!isProcessing && gl != null && model != null) {
      setIsProcessing(true);
      setTimeout(() => {
        setIsProcessing(false);
        setTimeout(() => {
          console.log('removing camera...');
          setIsCameraActive(false); // Render an empty view
        }, 1200);
      }, 2500);
    }
  }, [isProcessing, gl, model]);

  return (
    <TouchableOpacity style={styles.container} onPress={handleScreenTap}>
      {isCameraActive ? (
        device ? (
          <Camera
            style={styles.camera}
            device={device}
            isActive
            frameProcessor={frameProcessor}
            resizeMode="contain"
            format={format108030fps}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.text}>Loading Camera...</Text>
          </View>
        )
      ) : (
        <View style={styles.emptyView}>
          <BufferViewer
            frames={frames}
            glContext={gl} // Pass the actual GL context if available
            id={currentFrameId}
            onChangeFrame={setCurrentFrameId}
          />
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  camera: { flex: 1 },
  emptyView: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  text: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default CustomTestScreen;
