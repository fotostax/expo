import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import { Face } from 'react-native-vision-camera-face-detector';

let glContext: ExpoWebGLRenderingContext | null = null;
let rectangleProgram: WebGLProgram | null = null;
let isLineWidthSupported: boolean = false;
let resizeShader: WebGLShader | null = null;
const debugMode: boolean = true;

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

  uniform vec2 scale;

  void main() {
    gl_Position = vec4(position.xy * scale, position.z, 1.0);
    vTexCoord = texcoord;
  }
  `;

  const fragmentShaderSourceBlit = `
  precision mediump float;
  varying vec2 vTexCoord;
  uniform sampler2D rgbTex;
  uniform vec4 borderColor; // Define the border color

  void main() {
    if (vTexCoord.x < 0.0 || vTexCoord.x > 1.0 || vTexCoord.y < 0.0 || vTexCoord.y > 1.0) {
      // Use border color for out-of-bounds texture coordinates
      gl_FragColor = borderColor;
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
  framebuffer: WebGLFramebuffer,
  faces: Face[]
) => {
  // Bind the texture before attaching it to the framebuffer
  gl.bindTexture(gl.TEXTURE_2D, rgbTexture);
  checkGLError(gl, 'Binding RGB Texture');

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  checkGLError(gl, 'Binding Framebuffer');

  // Attach the texture to the framebuffer
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rgbTexture, 0);
  checkGLError(gl, 'Attaching Texture to Framebuffer');

  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    console.error('Framebuffer is incomplete!');
    return;
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
  const scaleLoc = gl.getUniformLocation(programBlit, 'scale');
  gl.uniform2f(scaleLoc, 1.0, 1.0);
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

      //console.log('Drawing detection rectangle with bounds (normalized):', bounds);

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
  height: number,
  returnFloat32 = false
) => {
  if (!glContext) {
    console.log('No context has been created. Please create one');
    return {
      pixels: returnFloat32 ? new Float32Array([]) : new Uint8Array([]),
      resizedTexture: null,
    };
  }

  // Check for required WebGL extensions
  const floatTexExt = glContext.getExtension('OES_texture_float');
  const floatBufferExt = glContext.getExtension('WEBGL_color_buffer_float');

  const useFloatTexture = returnFloat32 && floatTexExt && floatBufferExt;

  // Create a new texture for the resized output
  const resizedTexture = glContext.createTexture();
  glContext.bindTexture(glContext.TEXTURE_2D, resizedTexture);
  glContext.texImage2D(
    glContext.TEXTURE_2D,
    0,
    glContext.RGB,
    width,
    height,
    0,
    glContext.RGB,
    useFloatTexture ? glContext.FLOAT : glContext.UNSIGNED_BYTE,
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

  if (glContext.checkFramebufferStatus(glContext.FRAMEBUFFER) !== glContext.FRAMEBUFFER_COMPLETE) {
    console.error('Framebuffer is incomplete!');
    return { pixels: null, resizedTexture: null };
  }

  glContext.viewport(0, 0, width, height);

  if (!resizeShader) {
    resizeShader = createResizeShader(glContext);
  }
  glContext.useProgram(resizeShader);

  // Bind the input texture
  glContext.activeTexture(glContext.TEXTURE0);
  glContext.bindTexture(glContext.TEXTURE_2D, inputTexture);

  // Set shader uniform
  const inputTextureLocation = glContext.getUniformLocation(resizeShader, 'texture');
  glContext.uniform1i(inputTextureLocation, 0);

  // Render to framebuffer
  drawFullScreenQuad(glContext);

  // Read raw pixel data (RGB)
  const pixelsUint8 = new Uint8Array(width * height * 3);
  glContext.readPixels(0, 0, width, height, glContext.RGB, glContext.UNSIGNED_BYTE, pixelsUint8);

  let pixels;
  if (returnFloat32) {
    if (useFloatTexture) {
      // If float texture is supported, read directly as FLOAT
      pixels = new Float32Array(width * height * 3);
      glContext.readPixels(0, 0, width, height, glContext.RGB, glContext.FLOAT, pixels);
    } else {
      // If float texture is NOT supported, manually normalize values from Uint8 -> Float32
      pixels = new Float32Array(pixelsUint8.length);
      for (let i = 0; i < pixelsUint8.length; i++) {
        pixels[i] = pixelsUint8[i];
      }
    }
  } else {
    pixels = pixelsUint8;
  }

  // Cleanup
  glContext.bindFramebuffer(glContext.FRAMEBUFFER, null);
  glContext.deleteFramebuffer(framebuffer);

  console.log('Framebuffer processed successfully!');

  return { pixels, resizedTexture };
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

export const renderFaces = (
  faces: any[],
  gl: ExpoWebGLRenderingContext,
  textureWidth: number,
  textureHeight: number,
  strokeWidth: number = 3,
  shouldRenderLandmarks: boolean = false
) => {
  if (!faces || faces.length === 0) {
    console.log('No face landmarks available.');
    return;
  }

  if (rectangleProgram == null) {
    rectangleProgram = prepareRectangleShader(gl);
  }

  // Draw rectangles around faces (if any)
  if (faces && faces.length > 0) {
    faces.forEach((face) => {
      // Compute flipped bounds on X:
      // new x = textureWidth - face.bounds.x - face.bounds.width
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
      if (shouldRenderLandmarks && face.landmarks) {
        const leftEye = face.landmarks.LEFT_EYE;
        const rightEye = face.landmarks.RIGHT_EYE;

        const rectWidth = 40;
        const rectHeight = 40;

        // Flip the eye coordinates on X, similar to the face bounds.
        const leftEyeBounds = {
          x: textureWidth - leftEye.x - rectWidth / 2,
          y: leftEye.y - rectHeight / 2,
          width: rectWidth,
          height: rectHeight,
        };

        const rightEyeBounds = {
          x: textureWidth - rightEye.x - rectWidth / 2,
          y: rightEye.y - rectHeight / 2,
          width: rectWidth,
          height: rectHeight,
        };

        const greenVec4: [number, number, number, number] = [0, 1, 0, 1];

        drawRectangle(
          gl,
          rectangleProgram,
          leftEyeBounds,
          textureWidth,
          textureHeight,
          greenVec4,
          strokeWidth,
          false
        );

        drawRectangle(
          gl,
          rectangleProgram,
          rightEyeBounds,
          textureWidth,
          textureHeight,
          greenVec4,
          strokeWidth,
          false
        );
      }
    });
  }
};
