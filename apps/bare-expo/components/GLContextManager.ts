import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import * as GL from 'expo-gl';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Face } from 'react-native-vision-camera-face-detector';

let glContext: ExpoWebGLRenderingContext | null = null;
let rectangleProgram: WebGLProgram | null = null;
let isLineWidthSupported: boolean = false;
let resizeShader: WebGLShader | null = null;
const debugMode: boolean = false;

export const checkGLError = (gl: ExpoWebGLRenderingContext, message: string) => {
  if (!debugMode) {
    return;
  }
  const error = gl.getError();
  if (error !== gl.NO_ERROR) {
    console.error(`[GL ERROR] ${message}: ${error}`);
  }
};

export const getGLContext = async (): Promise<ExpoWebGLRenderingContext> => {
  if (!glContext) {
    console.log('Creating a new GL context...');
    glContext = await GLView.createContextAsync();
    const lineArr = glContext.getParameter(glContext.ALIASED_LINE_WIDTH_RANGE);
    if (lineArr[1] > 1) {
      isLineWidthSupported = true;
      console.log('supported max lines = ' + lineArr[1]);
    }
  } else {
    console.log('Reusing existing GL context...');
  }
  return glContext;
};

export const clearGLContext = () => {
  console.log('Clearing GL context...');
  glContext = null;
};

export const prepareForRgbToScreen = (glCtx: ExpoWebGLRenderingContext) => {
  const vertexShaderSourceBlit = `
  precision mediump float;
  attribute vec3 position;
  attribute vec2 texcoord;
  varying vec2 vTexCoord;

  void main() {
    gl_Position = vec4(position.xy, position.z, 1.0);
    vTexCoord = texcoord;
  }
  `;

  const fragmentShaderSourceBlit = `
  precision mediump float;
  varying vec2 vTexCoord;
  uniform sampler2D rgbTex;

  void main() {
    if (vTexCoord.x < 0.0 || vTexCoord.x > 1.0 || vTexCoord.y < 0.0 || vTexCoord.y > 1.0) {
      // Static black border color
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
      // Sample the texture for in-bounds coordinates
      gl_FragColor = texture2D(rgbTex, vTexCoord);
    }
  }
  `;

  const vertBlit = glCtx.createShader(glCtx.VERTEX_SHADER);
  glCtx.shaderSource(vertBlit, vertexShaderSourceBlit);
  glCtx.compileShader(vertBlit);
  checkGLError(glCtx, 'Compiling Vertex Shader');

  const fragBlit = glCtx.createShader(glCtx.FRAGMENT_SHADER)!;
  glCtx.shaderSource(fragBlit, fragmentShaderSourceBlit);
  glCtx.compileShader(fragBlit);
  checkGLError(glCtx, 'Compiling Fragment Shader');

  const progBlit = glCtx.createProgram()!;
  glCtx.attachShader(progBlit, vertBlit);
  glCtx.attachShader(progBlit, fragBlit);
  glCtx.linkProgram(progBlit);
  checkGLError(glCtx, 'Linking Program');

  return progBlit;
};
// Helper function to create a resize shader
export const createResizeShader = (gl: ExpoWebGLRenderingContext): WebGLProgram => {
  const vertexShaderSource = `
    attribute vec4 position;
    varying vec2 texCoord;
    void main() {
      gl_Position = position;
      texCoord = (position.xy + 1.0) / 2.0;
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;
    uniform sampler2D texture;
    varying vec2 texCoord;
    void main() {
      gl_FragColor = texture2D(texture, texCoord);
    }
  `;

  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertexShader, vertexShaderSource);
  gl.compileShader(vertexShader);

  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, fragmentShaderSource);
  gl.compileShader(fragmentShader);

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    console.error('Could not initialize shaders');
  }
  return shaderProgram;
};

export const prepareRectangleShader = (glCtx: ExpoWebGLRenderingContext) => {
  const vertexShaderSourceRectangle = `
    precision mediump float;
    attribute vec3 position;
    void main() {
      gl_Position = vec4(position, 1.0);
    }
    `;
  const fragmentShaderSourceRectangle = `
    precision mediump float;
    uniform vec4 color;
    void main() {
      gl_FragColor = color;
    }
    `;
  const vertRectangle = glCtx.createShader(glCtx.VERTEX_SHADER);
  glCtx.shaderSource(vertRectangle, vertexShaderSourceRectangle);
  glCtx.compileShader(vertRectangle);
  checkGLError(glCtx, 'Compiling Rectangle Vertex Shader');

  const fragRectangle = glCtx.createShader(glCtx.FRAGMENT_SHADER);
  glCtx.shaderSource(fragRectangle, fragmentShaderSourceRectangle);
  glCtx.compileShader(fragRectangle);
  checkGLError(glCtx, 'Compiling Rectangle Fragment Shader');

  const progRectangle = glCtx.createProgram();
  glCtx.attachShader(progRectangle, vertRectangle);
  glCtx.attachShader(progRectangle, fragRectangle);
  glCtx.linkProgram(progRectangle);
  checkGLError(glCtx, 'Linking Rectangle Program');

  return progRectangle;
};

export const drawRectangle = (
  gl: ExpoWebGLRenderingContext,
  programRectangle: WebGLProgram,
  bounds: { x: number; y: number; width: number; height: number },
  textureWidth: number,
  textureHeight: number,
  color: [number, number, number, number] = [1.0, 0.0, 0.0, 1.0], // default color (red)
  strokeWidth: number = 1,
  areBoundsNormalized: boolean = false
) => {
  gl.useProgram(programRectangle);

  let x1, y1, x2, y2;

  if (areBoundsNormalized) {
    // If bounds are normalized (0-1) where (0,0) is the top-left,
    // convert them directly to clip space.
    // For x: clip = value * 2 - 1.
    // For y: clip = 1 - value * 2.
    x1 = bounds.x * 2 - 1;
    y1 = 1 - bounds.y * 2;
    x2 = (bounds.x + bounds.width) * 2 - 1;
    y2 = 1 - (bounds.y + bounds.height) * 2;
  } else {
    // Assume bounds are in pixel coordinates. Normalize them by the texture dimensions first.
    x1 = (bounds.x / textureWidth) * 2 - 1;
    y1 = 1 - (bounds.y / textureHeight) * 2;
    x2 = ((bounds.x + bounds.width) / textureWidth) * 2 - 1;
    y2 = 1 - ((bounds.y + bounds.height) / textureHeight) * 2;
  }

  const rectVertices = new Float32Array([x1, y1, 0.0, x2, y1, 0.0, x2, y2, 0.0, x1, y2, 0.0]);

  const rectBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, rectBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, rectVertices, gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(programRectangle, 'position');
  gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(posLoc);

  // Use the passed-in color for drawing the rectangle.
  const colorLoc = gl.getUniformLocation(programRectangle, 'color');
  gl.uniform4f(colorLoc, color[0], color[1], color[2], color[3]);

  if (typeof isLineWidthSupported !== 'undefined' && isLineWidthSupported) {
    gl.lineWidth(strokeWidth);
  }

  gl.drawArrays(gl.LINE_LOOP, 0, 4);
  gl.disableVertexAttribArray(posLoc);
};

export const renderRGBToFramebuffer = (
  gl: ExpoWebGLRenderingContext,
  programBlit: WebGLProgram,
  vertexBuffer: WebGLBuffer,
  rgbTexture: WebGLTexture,
  textureWidth: number,
  textureHeight: number,
  framebuffer: WebGLFramebuffer
) => {
  console.log('Debug: Binding rgbTexture to framebuffer:', rgbTexture);
  if (!rgbTexture) {
    console.error('Error: rgbTexture is NULL!');
  }
  // Bind the texture before attaching it to the framebuffer
  gl.bindTexture(gl.TEXTURE_2D, rgbTexture);
  checkGLError(gl, 'Binding RGB Texture');

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  checkGLError(gl, 'Binding Framebuffer');

  // Attach the texture to the framebuffer
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rgbTexture, 0);
  checkGLError(gl, 'Attaching Texture to Framebuffer');

  const fbstatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

  if (fbstatus !== gl.FRAMEBUFFER_COMPLETE) {
    switch (fbstatus) {
      case gl.FRAMEBUFFER_COMPLETE:
        console.log('Framebuffer is complete');
        break;
      case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
        console.error('Framebuffer incomplete: INCOMPLETE_ATTACHMENT');
        break;
      case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
        console.error('Framebuffer incomplete: MISSING_ATTACHMENT');
        break;
      case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
        console.error('Framebuffer incomplete: INCOMPLETE_DIMENSIONS');
        break;
      default:
        console.error('Framebuffer incomplete: Unknown error');
        return;
    }
  }

  // Activate the texture unit and bind texture for rendering
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, rgbTexture);
  checkGLError(gl, 'Activating and Binding RGB Texture');

  gl.viewport(0, 0, textureWidth, textureHeight);
  gl.useProgram(programBlit);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);

  const posLoc = gl.getAttribLocation(programBlit, 'position');
  gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 5 * 4, 0);
  gl.enableVertexAttribArray(posLoc);

  const tcLoc = gl.getAttribLocation(programBlit, 'texcoord');
  gl.vertexAttribPointer(tcLoc, 2, gl.FLOAT, false, 5 * 4, 3 * 4);
  gl.enableVertexAttribArray(tcLoc);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, rgbTexture);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, 0);
};

export const drawObjectDetectionOutput = (
  objectDetectionOutput: any,
  gl: ExpoWebGLRenderingContext,
  textureWidth: number,
  textureHeight: number,
  strokeWidth: number = 3
) => {
  if (!objectDetectionOutput) return;

  // Ensure your rectangle shader program is available.
  if (rectangleProgram == null) {
    rectangleProgram = prepareRectangleShader(gl);
  }

  const detection_boxes = objectDetectionOutput[0];
  const detection_scores = objectDetectionOutput[2];

  for (let i = 0; i < detection_boxes.length; i += 4) {
    const confidence = detection_scores[i / 4];
    if (confidence > 0.5) {
      const left = detection_boxes[i];
      const top = detection_boxes[i + 1];
      const right = detection_boxes[i + 2];
      const bottom = detection_boxes[i + 3];

      const bounds = {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      };

      drawRectangle(
        gl,
        rectangleProgram,
        bounds,
        textureWidth,
        textureHeight,
        [0.0, 0.0, 1.0, 1.0],
        strokeWidth,
        true
      );
    }
  }
};

export const renderYUVToRGB = (
  gl: ExpoWebGLRenderingContext,
  programYUV: WebGLProgram,
  vertexBuffer: WebGLBuffer,
  fbo: WebGLFramebuffer,
  yPlaneTexId: number,
  textureWidth: number,
  textureHeight: number
) => {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, textureWidth, textureHeight);
  checkGLError(gl, 'PostBind');

  const texRGB = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texRGB);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    textureWidth,
    textureHeight,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // Attach texture to framebuffer
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texRGB, // Texture created earlier
    0
  );
  // Check for completeness
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    console.error(`Framebuffer incomplete: ${status}`);
  }
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    textureWidth,
    textureHeight,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null
  );
  checkGLError(gl, 'TexImage2D');

  gl.useProgram(programYUV);
  checkGLError(gl, 'UseProgram');

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);

  checkGLError(gl, 'Bind of Vertex Buffer');

  const posLoc = gl.getAttribLocation(programYUV, 'position');
  gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 5 * 4, 0);
  gl.enableVertexAttribArray(posLoc);

  const tcLoc = gl.getAttribLocation(programYUV, 'texcoord');
  gl.vertexAttribPointer(tcLoc, 2, gl.FLOAT, false, 5 * 4, 3 * 4);
  gl.enableVertexAttribArray(tcLoc);

  for (let i = 0; i < 3; i++) {
    gl.activeTexture(gl.TEXTURE0 + i);
    const texture = { id: yPlaneTexId + i } as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D, texture);

    const uniformName = i === 0 ? 'yTexture' : i === 1 ? 'uTexture' : 'vTexture';
    gl.uniform1i(gl.getUniformLocation(programYUV, uniformName), i);
  }
  checkGLError(gl, 'Post YUV Binding');

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  checkGLError(gl, 'Post Draw in YUV ');

  return texRGB;
};

export const createVertexBuffer = (gl: ExpoWebGLRenderingContext) => {
  const vertices = new Float32Array([
    -1.0, -1.0, 0.0, 0.0, 0.0, 1.0, -1.0, 0.0, 1.0, 0.0, -1.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0,
    1.0, 1.0,
  ]);

  const vtxBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vtxBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  return vtxBuffer;
};

export const resizeRGBTexture = async (
  inputTexture: WebGLTexture,
  width: number,
  height: number
) => {
  if (!glContext) {
    console.log('No context has been created. Please create one');
    return { pixels: new Uint8Array([]), resizedTexture: null };
  }

  // Create a new texture for the resized output
  const resizedTexture = glContext.createTexture();
  glContext.bindTexture(glContext.TEXTURE_2D, resizedTexture);

  glContext.texImage2D(
    glContext.TEXTURE_2D,
    0,
    glContext.RGBA,
    width,
    height,
    0,
    glContext.RGBA,
    glContext.UNSIGNED_BYTE,
    null
  );
  glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MIN_FILTER, glContext.LINEAR);
  glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MAG_FILTER, glContext.LINEAR);
  glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_S, glContext.CLAMP_TO_EDGE);
  glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_T, glContext.CLAMP_TO_EDGE);

  // Create a framebuffer and attach the new texture to it
  const framebuffer = glContext.createFramebuffer();
  glContext.bindFramebuffer(glContext.FRAMEBUFFER, framebuffer);
  glContext.framebufferTexture2D(
    glContext.FRAMEBUFFER,
    glContext.COLOR_ATTACHMENT0,
    glContext.TEXTURE_2D,
    resizedTexture,
    0
  );

  // Check if framebuffer is complete
  if (glContext.checkFramebufferStatus(glContext.FRAMEBUFFER) !== glContext.FRAMEBUFFER_COMPLETE) {
    console.error('Framebuffer is incomplete!(Resize Texture)');
    return { pixels: null, resizedTexture: null };
  }
  glContext.viewport(0, 0, width, height);

  if (!resizeShader) {
    resizeShader = createResizeShader(glContext);
  }
  glContext.useProgram(resizeShader);

  // Bind the input texture (the one passed to this function)
  glContext.activeTexture(glContext.TEXTURE0);
  glContext.bindTexture(glContext.TEXTURE_2D, inputTexture);

  // Set uniform for the shader
  const inputTextureLocation = glContext.getUniformLocation(resizeShader, 'texture');
  glContext.uniform1i(inputTextureLocation, 0);

  // Render the full-screen quad to copy/resize the texture
  drawFullScreenQuad(glContext);

  // Read raw pixel data (RGBA)
  const rgbaPixels = new Uint8Array(width * height * 4);
  glContext.readPixels(0, 0, width, height, glContext.RGBA, glContext.UNSIGNED_BYTE, rgbaPixels);

  // Convert RGBA to RGB (Remove Alpha)
  const rgbPixels = new Uint8Array(width * height * 3);

  for (let i = 0, j = 0; i < rgbaPixels.length; i += 4, j += 3) {
    rgbPixels[j] = rgbaPixels[i]; // R
    rgbPixels[j + 1] = rgbaPixels[i + 1]; // G
    rgbPixels[j + 2] = rgbaPixels[i + 2]; // B
  }
  // Cleanup: unbind framebuffer and delete it (texture is kept for later use)
  glContext.bindFramebuffer(glContext.FRAMEBUFFER, null);
  glContext.deleteFramebuffer(framebuffer);
  if (debugMode) {
    console.log('resizedTexture created successfully:', resizedTexture);
  }
  return { rgbPixels, resizedTexture };
};

export const clearFramebuffer = (
  gl: ExpoWebGLRenderingContext,
  framebuffer: WebGLFramebuffer | null
) => {
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.clearColor(0.0, 0.0, 0.0, 0.0); // Black with full transparency
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); // Unbind framebuffer to avoid issues
};

// Helper function to draw a full-screen quad
const drawFullScreenQuad = (gl: ExpoWebGLRenderingContext) => {
  const vertices = new Float32Array([
    -1,
    -1, // Bottom-left
    1,
    -1, // Bottom-right
    -1,
    1, // Top-left
    1,
    1, // Top-right
  ]);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(gl.getParameter(gl.CURRENT_PROGRAM), 'position');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
};

export const renderFaces = async (
  faces: Face[],
  gl: ExpoWebGLRenderingContext,
  textureWidth: number,
  textureHeight: number,
  strokeWidth: number = 3,
  shouldRenderLandmarks: boolean = falsea
): Promise<string[]> => {
  if (!faces || faces.length === 0) {
    console.log('No face landmarks available.');
    return [];
  }

  if (rectangleProgram == null) {
    rectangleProgram = prepareRectangleShader(gl);
  }

  faces.forEach((face) => {
    const flippedBounds = {
      x: textureWidth - face.bounds.x - face.bounds.width,
      y: face.bounds.y,
      width: face.bounds.width,
      height: face.bounds.height,
    };

    drawRectangle(
      gl,
      rectangleProgram,
      flippedBounds,
      textureWidth,
      textureHeight,
      [1.0, 0.0, 0.0, 1.0], // red
      strokeWidth,
      false
    );
  });

  // Capture the snapshot and crop faces
  return captureAndCropFaces(gl, faces, textureWidth, textureHeight);
};

export const captureAndCropFaces = async (
  gl: ExpoWebGLRenderingContext,
  faces: Face[],
  textureWidth: number,
  textureHeight: number
): Promise<string[]> => {
  if (!gl || faces.length === 0) {
    console.warn('No GL context or no faces detected.');
    return [];
  }

  console.log(`Capturing ${faces.length} faces...`);

  // Take a snapshot of the full frame
  const snapshot = await GL.GLView.takeSnapshotAsync(gl, {
    format: 'png',
    flip: false,
  });

  if (!snapshot?.uri) {
    console.error('Failed to capture snapshot.');
    return [];
  }

  const faceSnapshots: string[] = [];

  for (const face of faces) {
    const x = Math.max(0, face.bounds.x);
    const y = Math.max(0, face.bounds.y);
    const width = Math.min(textureWidth - x, face.bounds.width);
    const height = Math.min(textureHeight - y, face.bounds.height);

    console.log(`Cropping face at: x=${x}, y=${y}, width=${width}, height=${height}`);

    try {
      // Use Expo ImageManipulator to crop the snapshot
      const croppedImage = await manipulateAsync(snapshot.uri, [
        { crop: { originX: x, originY: y, width, height } },
      ]);

      if (croppedImage?.uri) {
        faceSnapshots.push(croppedImage.uri);
      }
    } catch (error) {
      console.error('Error cropping face snapshot:', error);
    }
  }

  console.log(`Captured and cropped ${faceSnapshots.length} face images.`);
  return faceSnapshots;
};
