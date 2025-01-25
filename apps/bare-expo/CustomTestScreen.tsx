import BufferViewer from 'components/BufferViewer';
import { useGLBufferFrameManager } from 'components/GLBufferFrameManager';
import { renderYUVToRGB, checkGLError } from 'components/GLContextManager';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import {
  Frame,
  FrameInternal,
  useCameraDevice,
  useFrameProcessor,
  Camera,
} from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';

const CustomTestScreen = () => {
  const { initializeContext, addFrame, frames } = useGLBufferFrameManager();
  const [gl, setGL] = useState(null);
  const [currentFrameId, setCurrentFrameId] = useState(0);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progYUV, setProgYuv] = useState(null);
  const [vtxBuffer, setvtxBuffer] = useState(null);
  const [frameBuffer, setFrameBuffer] = useState(null);

  const device = useCameraDevice('front');

  // Initialize GL context when the component mounts
  useEffect(() => {
    const setupGL = async () => {
      const glCtx = await initializeContext();
      if (glCtx) {
        setGL(glCtx);
        await onContextCreate(glCtx);
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

  const yuvToRGBCallback = Worklets.createRunOnJS(async (frame: Frame) => {
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

      addFrame(rgbTexture, { textureWidth, textureHeight });
    } catch (error) {
      console.error('Error in HB upload:', error);
      throw error;
    }
  });

  const frameProcessor = useFrameProcessor(
    async (frame: Frame) => {
      'worklet';
      if (isProcessing) {
        await yuvToRGBCallback(frame);
      }
    },
    [isProcessing]
  );

  const handleScreenTap = useCallback(() => {
    if (!isProcessing && gl != null) {
      setIsProcessing(true);
      setTimeout(() => {
        setIsProcessing(false);
        setTimeout(() => {
          console.log('removing camera...');
          setIsCameraActive(false); // Render an empty view
        }, 2000);
      }, 2500);
    }
  }, [isProcessing, gl]);

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
