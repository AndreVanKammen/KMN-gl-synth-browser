import WebGLSynth from "../../KMN-gl-synth.js/webgl-synth.js";
import { animationFrame } from "../../KMN-utils-browser/animation-frame.js";
import PanZoomControl from "../../KMN-utils-browser/pan-zoom-control.js";
import getWebGLContext from "../../KMN-utils.js/webglutils.js";

function getVertexShader() {
  return /*glsl*/`precision highp float;
    precision highp float;
    precision highp int;

    in vec2 vertexPosition;

    uniform sampler2D pointDataTexture;

    uniform vec2 scale;
    uniform vec2 position;
    uniform vec2 windowSize;

    uniform float dpr;
    uniform float duration;
    uniform float startTime;
    uniform float timeStep;

    flat out vec4 lineStart;
    flat out vec4 lineEnd;

    flat out vec2 lineStartScreen;
    flat out vec2 lineEndScreen;

    out vec2 textureCoord;
    out vec2 textureCoordScreen;

    void main(void) {
      int pointIx = gl_VertexID / 6;

      lineStart = texelFetch(pointDataTexture, ivec2(pointIx % 1024, pointIx / 1024), 0);
      pointIx++;
      lineEnd = texelFetch(pointDataTexture, ivec2(pointIx % 1024, pointIx / 1024), 0);
      float startX = startTime + float(pointIx) * timeStep;
      
      vec2 pixelSize = vec2(2.0) / scale / windowSize * dpr;
      lineStart.x = startX;
      lineEnd.x = startX + timeStep;

      // pixelSize *= 3.0;  // Line width
      int subPointIx = gl_VertexID % 6;

      vec2 pos;
      if (subPointIx == 1 || subPointIx >= 4) {
        pos.x = lineStart.x - pixelSize.x;
      } else {
        pos.x = lineEnd.x + pixelSize.x;
      }

      if (subPointIx <= 1 || subPointIx == 4) {
        pos.y = min(lineStart.y, lineEnd.y) - pixelSize.y;
      } else {
        pos.y = max(lineStart.y, lineEnd.y) + pixelSize.y;
      }

      lineStartScreen = lineStart.xy;
      lineEndScreen = lineEnd.xy;

      textureCoord = pos;
      pos = (pos - position * 2.0 + 1.0) * scale - 1.0;
      lineStartScreen = (lineStartScreen - position * 2.0 + 1.0) * scale - 1.0;
      lineEndScreen = (lineEndScreen - position * 2.0 + 1.0) * scale - 1.0;

      lineStartScreen = (lineStartScreen + 1.0) * 0.5 * windowSize;
      lineEndScreen = (lineEndScreen + 1.0) * 0.5 * windowSize;
      textureCoordScreen = (pos + 1.0) * 0.5 * windowSize;

      gl_Position = vec4(pos, 0.0, 1.0);
    }`
}

  // The shader that calculates the pixel values for the filled triangles
function getFragmentShader() {
  return /*glsl*/`precision highp float;
  precision highp float;
  precision highp int;
  precision highp sampler2DArray;

  const float pi = 3.141592653589793;

  uniform vec2 windowSize;
  uniform float dpr;
  uniform float lineAlpha;

  flat in vec4 lineStart;
  flat in vec4 lineEnd;

  flat in vec2 lineStartScreen;
  flat in vec2 lineEndScreen;

  in vec2 textureCoord;
  in vec2 textureCoordScreen;
  out vec4 fragColor;

  float line(vec2 p, vec2 a, vec2 b)
  {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
  }

  const vec3 pointBorderColor = vec3(0.8);

  void main(void) {
    vec4 color = vec4(0.0);

    float lineDist = line(textureCoordScreen.xy, lineStartScreen.xy, lineEndScreen.xy);
    float lineWidth = 0.02 * dpr;
    float hasLine = 1.0 - smoothstep(lineWidth, lineWidth + 1.5 * dpr, lineDist);

    color = hasLine * vec4(1.0,1.0,1.0,lineAlpha);
    fragColor = vec4(pow(color.rgb,vec3(1.0/2.2)),color.a);
  }
  `
}
export class WavLineView {
  constructor (options) {
    this.options = options;
    this.updateCanvasBound = this.updateCanvas.bind(this);
    this.width  = 10;
    this.height = 10;
    this.mouseDownOnPoint = null;
    this.leftSamples = new Float32Array();
    this.rightSamples = new Float32Array();
    this.sampleRate = 44100;
  }

  /**
   * @param {HTMLElement} parentElement
   */
  initializeDOM(parentElement) {
    this.parentElement = parentElement;

    this.canvas = this.options.canvas || this.parentElement.$el({tag:'canvas', cls:'analyzerCanvas'});
    const gl = this.gl = getWebGLContext(this.canvas);

    /** @type {PanZoomControl} */
    this.control = this.options.control || new PanZoomControl(this.parentElement, {
      minYScale: 1.0,
      maxYScale: 1.0,
      minXScale: 1.0,
      maxXScale: 1000.0
    });

    this.shader = gl.checkUpdateShader(this, getVertexShader(), getFragmentShader());

    if (!this.options.noRequestAnimationFrame) {
      animationFrame(this.updateCanvasBound);
    }
  }

  udatePoints() {
    this.duration = this.leftSamples.length / this.sampleRate;
    let durationOnScreen = (this.duration / this.control.xScaleSmooth);
    let screenStartTime = this.control.xOffsetSmooth * this.duration;
    if (screenStartTime > this.startTime &&
      screenStartTime + durationOnScreen < this.endTime) {
      // No need for update
      return;
    }

    let points = this.points = [];
    let wavLeft = this.leftSamples;
    let wavRight = this.rightSamples;

    this.timeStep = 1.0 / this.sampleRate;

    let sampleCount = ~~Math.ceil(this.sampleRate / 6.0) * 2.0;
    let startSample = ~~Math.round((screenStartTime + 0.5 * durationOnScreen) * this.sampleRate) - sampleCount / 2;
    this.startTime = startSample / this.sampleRate;
    this.endTime = (startSample+sampleCount) / this.sampleRate;
    
    for (let ix = startSample; ix < startSample + sampleCount; ix++) {
      points.push(0.5* (wavLeft[ix] + wavRight[ix]));
    }
    
    this.updatePointData();
  }

  updatePointData(skipUpdate = false) {
    const gl = this.gl;
    // TODO size is multiple check for more then 1000 points
    const data = this.pointData = new Float32Array(Math.ceil(this.points.length * 4.0 / 4096) * 4096);
    let ofs = 0;
    for (const point of this.points) {
      data[ofs++] = 0.0;
      data[ofs++] = point;
      data[ofs++] = 0; // use for hover and stuff
      data[ofs++] = 0;
    }
    if (!skipUpdate) {
      this.pointInfo = gl.createOrUpdateFloat32TextureBuffer(data, this.pointInfo, 0, ofs);
    }
  }

  updateCanvas() {
    let gl = this.gl;
    this.shader = gl.checkUpdateShader(this, getVertexShader(), getFragmentShader());
    let shader = this.shader;
  
    if (gl && shader && this.parentElement) {
      this.duration = this.leftSamples.length / this.sampleRate;
      let durationOnScreen = this.duration / this.control.xScale;
      if (durationOnScreen < 0.25) {
        this.udatePoints();
    
        let { w, h, dpr } = gl.updateCanvasSize(this.canvas);
        // gl.blendFunc(gl.ONE, gl.ZERO);
        // gl.blendEquationSeparate(gl.MAX, gl.FUNC_ADD);

        let rect = this.parentElement.getBoundingClientRect();
        if (rect.width && rect.height) {
          gl.viewport(rect.x * dpr, h - (rect.y + rect.height) * dpr, rect.width * dpr, rect.height * dpr);
          this.width = w = rect.width * dpr;
          this.height = h = rect.height * dpr;

          // gl.lineWidth(3.0);
          // Tell WebGL how to convert from clip space to pixels
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.useProgram(shader);

          if (shader.u.pointDataTexture) {
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, this.pointInfo.texture);
            gl.uniform1i(shader.u.pointDataTexture, 2);
            gl.activeTexture(gl.TEXTURE0);
          }

          shader.u.windowSize?.set(w, h);
          shader.u.scale?.set(this.control.xScaleSmooth, this.control.yScaleSmooth);
          shader.u.position?.set(this.control.xOffsetSmooth, this.control.yOffsetSmooth);
          shader.u.dpr?.set(dpr);
          shader.u.duration?.set(this.duration);
          shader.u.startTime?.set(this.startTime / this.duration * 2.0 - 1.0);
          shader.u.timeStep?.set(this.timeStep / this.duration * 2.0);
          shader.u.lineAlpha?.set(1.0 - Math.pow(Math.max(0.0,durationOnScreen * 5.0-0.5),.2));
    
          gl.drawArrays(gl.TRIANGLES, 0, (this.points.length - 1) * 6.0);
          gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
        }
      }
    }
    if (!this.options.noRequestAnimationFrame) {
      animationFrame(this.updateCanvasBound);
    }
  }

}