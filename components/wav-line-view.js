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
      
      vec2 pixelSize = vec2(2.0) / scale / windowSize * dpr;

      pixelSize *= 2.0;  // Line width
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
  const vec4 lineColor = vec4(1.0,1.0,1.0,0.8);

  void main(void) {
    vec4 color = vec4(0.0);

    float lineDist = line(textureCoordScreen.xy, lineStartScreen.xy, lineEndScreen.xy);
    float lineWidth = 0.5 * dpr;
    float hasLine = 1.0 - smoothstep(lineWidth, lineWidth + 1.5 * dpr, lineDist);

    color = hasLine * lineColor;
    fragColor = pow(color.rgba,vec4(1.0/2.2));
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

  udatePoints(points, duration) {
    this.points = points;
    this.duration = duration;
    
    this.minValue = 0.0;
    this.maxValue = 1.0;
    this.valueRange = this.maxValue - this.minValue;

    this.updatePointData();
  }

  updatePointData(skipUpdate = false) {
    const gl = this.gl;
    // TODO size is multiple check for more then 1000 points
    const data = this.pointData = new Float32Array(Math.ceil(this.points.length * 4.0 / 4096) * 4096);
    let ofs = 0;
    for (const point of this.points) {
      data[ofs++] = (point.time / this.duration) * 2.0 - 1.0;
      data[ofs++] = (point.value - this.minValue) / this.valueRange * 2.0 - 1.0;
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

    if (gl && shader && this.parentElement && this.points?.length > 0) {

      let {w, h, dpr} = gl.updateCanvasSize(this.canvas);

      let rect = this.parentElement.getBoundingClientRect();
      if (rect.width && rect.height) {
        gl.viewport(rect.x * dpr, h - (rect.y + rect.height) * dpr, rect.width * dpr, rect.height * dpr);
        this.width  = w = rect.width * dpr;
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

        shader.u.windowSize?.set(w,h);
        shader.u.scale?.set(this.control.xScaleSmooth, this.control.yScaleSmooth);
        shader.u.position?.set(this.control.xOffsetSmooth, this.control.yOffsetSmooth);
        shader.u.dpr?.set(dpr);
        shader.u.duration?.set(this.duration);

        gl.drawArrays(gl.TRIANGLES, 0, (this.points.length-1) * 6.0 );
      }
    }
    if (!this.options.noRequestAnimationFrame) {
      animationFrame(this.updateCanvasBound);
    }
  }

}