import * as GL from 'expo-gl';
import React, { useEffect, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  Text,
  TouchableWithoutFeedback,
} from 'react-native';

import { ProcessedFrame } from './GLBufferFrameManager';
import {
  createVertexBuffer,
  drawObjectDetectionOutput,
  prepareForRgbToScreen,
  renderRGBToFramebuffer,
  renderFaces,
} from './GLContextManager';

interface BufferViewerProps {
  frames: ProcessedFrame[];
  glContext: GL.ExpoWebGLRenderingContext | null;
  id: number;
  onChangeFrame: (newId: number) => void;
  viewSize: { width: number; height: number }; // New prop for resolution
}

const BufferViewer: React.FC<BufferViewerProps> = ({
  frames,
  glContext,
  id,
  onChangeFrame,
  viewSize,
}) => {
  const [snapshot, setSnapshot] = useState<GL.GLSnapshot | null>(null);
  const [rgbToScreenProgram, setRgbToScreenProgram] = useState<WebGLProgram | null>(null);
  const [vertexBuffer, setVertexBuffer] = useState<WebGLBuffer | null>(null);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [showResizedTexture, setShowResizedTexture] = useState<boolean>(false);

  useEffect(() => {
    if (glContext) {
      const program = prepareForRgbToScreen(glContext);
      const vtxBuffer = createVertexBuffer(glContext);
      setRgbToScreenProgram(program);
      setVertexBuffer(vtxBuffer);
      console.log('Total frames loaded: ' + frames.length);
    }
  }, [glContext]);

  useEffect(() => {
    const renderFrame = async () => {
      if (glContext && vertexBuffer) {
        const frame = frames[id];
        if (!frame) return;

        console.log('View Size:', viewSize);
        const frameBuffer = glContext.createFramebuffer();

        const textureToRender =
          showResizedTexture && frame.resizedTexture ? frame.resizedTexture : frame.texture;

        const textureWidth = showResizedTexture
          ? frame.metadata?.resizedTextureWidth || 320
          : frame.metadata?.textureWidth || 320;

        const textureHeight = showResizedTexture
          ? frame.metadata?.resizedTextureHeight || 320
          : frame.metadata?.textureHeight || 320;

        console.log(
          `Rendering Frame ${id} - Using ${showResizedTexture ? 'Resized Texture' : 'Full Texture'}`
        );

        renderRGBToFramebuffer(
          glContext,
          rgbToScreenProgram,
          vertexBuffer,
          textureToRender,
          textureWidth,
          textureHeight,
          frameBuffer
        );

        if (!showResizedTexture && frame.metadata?.objectDetectionOutput) {
          drawObjectDetectionOutput(
            frame.metadata.objectDetectionOutput,
            glContext,
            textureWidth,
            textureHeight
          );
        }

        if (!showResizedTexture && frame.metadata?.faces) {
          renderFaces(frame.metadata.faces, glContext, textureWidth, textureHeight, 3, true);
        }

        glContext.endFrameEXP();

        const snap = await GL.GLView.takeSnapshotAsync(glContext, {
          flip: false,
        });
        glContext.deleteFramebuffer(frameBuffer);
        setSnapshot(snap);
      }
    };

    if (!isRendering) {
      setIsRendering(true);
      renderFrame();
      setIsRendering(false);
    }
  }, [
    glContext,
    frames[id],
    id,
    vertexBuffer,
    rgbToScreenProgram,
    isRendering,
    showResizedTexture,
    viewSize,
  ]);

  return (
    <TouchableWithoutFeedback>
      <View style={styles.container}>
        <View style={styles.flex}>
          {snapshot && (
            <Image
              style={styles.flex}
              fadeDuration={0}
              source={{ uri: snapshot.uri as string }}
              resizeMode="center"
            />
          )}
        </View>

        <TouchableOpacity
          style={styles.toggleButton}
          onPress={() => setShowResizedTexture((prev) => !prev)}>
          <Text style={styles.toggleButtonText}>
            {showResizedTexture ? 'Show Full Frame' : 'Show Resized Texture'}
          </Text>
        </TouchableOpacity>

        <View style={styles.frameCounter}>
          <Text style={styles.frameText}>
            {id + 1}/{frames.length}
          </Text>
        </View>

        <View style={styles.navigationContainer}>
          <TouchableOpacity
            style={[styles.navButton, styles.leftButton]}
            onPress={() => onChangeFrame(Math.max(0, id - 1))}>
            <Text style={styles.arrowText}>◀</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navButton, styles.rightButton]}
            onPress={() => onChangeFrame(Math.min(frames.length - 1, id + 1))}>
            <Text style={styles.arrowText}>▶</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
};

export default BufferViewer;

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', backgroundColor: 'white' },
  flex: { flex: 1, width: '100%' },
  navigationContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  navButton: { width: 50, height: '100%', justifyContent: 'center', alignItems: 'center' },
  leftButton: { backgroundColor: 'rgba(0, 0, 0, 0.2)' },
  rightButton: { backgroundColor: 'rgba(0, 0, 0, 0.2)' },
  arrowText: { fontSize: 24, color: 'white' },
  frameCounter: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
  },
  frameText: { color: 'white', fontSize: 16 },
  toggleButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 10,
    borderRadius: 5,
    zIndex: 10,
  },
  toggleButtonText: { color: 'white', fontSize: 14 },
});
