import PanZoomControl, { ControlHandlerBase } from "../../KMN-utils-browser/pan-zoom-control.js";
import getWebGLContext, { getVertexIDDiabled } from "../../KMN-utils.js/webglutils.js";
import { RectController } from "../../KMN-varstack-browser/components/webgl/rect-controller.js";

function getVertexShader(options) {
  return /*glsl*/`precision highp float;
    precision highp float;
    precision highp int;

    in float vertexPosition;

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
      int vId = ${options.vertexIDDisabled ? 'int(round(vertexPosition))' : 'gl_VertexID'};
      int pointIx = vId / 6;

      lineStart = texelFetch(pointDataTexture, ivec2(pointIx % 1024, pointIx / 1024), 0);
      pointIx++;
      lineEnd = texelFetch(pointDataTexture, ivec2(pointIx % 1024, pointIx / 1024), 0);
      float startX = startTime + float(pointIx) * timeStep;
      
      vec2 pixelSize = vec2(2.0) / scale / windowSize * dpr;
      lineStart.x = startX;
      lineEnd.x = startX + timeStep;

      // pixelSize *= 3.0;  // Line width
      int subPointIx = vId % 6;

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

    color = hasLine * vec4(1.0,1.0,1.0,lineAlpha) * lineStart.w;
    fragColor = vec4(pow(color.rgb,vec3(1.0/2.2)),color.a);
  }
  `
}
export class WavLineView extends ControlHandlerBase {
  constructor(options) {
    super();
    
    this.options = options;
    this.updateCanvasBound = this.updateCanvas.bind(this);
    this.width = 10;
    this.height = 10;
    this.mouseDownOnPoint = null;
    this.leftSamples = null;
    this.rightSamples = null;
    this.maxSamples = this.options.maxSamples || 64 * 1024;
    this.pointData = new Float32Array(Math.ceil(this.maxSamples * 4.0 / 4096) * 4096);
    this.sampleRate = 44100;
    /** @type {(data: Float32Array, length: number) => void} */
    this.onAddEnergyLevels = null;
    this.track = null;
    this.durationTreshhold = 3.0;
    this.onGetAudioTrack = (sender) => this.track;
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

    // this.shader = gl.checkUpdateShader(this, getVertexShader(), getFragmentShader());

    if (this.options.canvasRoutine) {
      this.canvasRoutine = this.options.canvasRoutine;
    } else {
      this.canvasRoutine = RectController.geInstance().registerCanvasUpdate('wav-line', this.updateCanvasBound, this.parentElement);
    }

    this.vertexIDDisabled = getVertexIDDiabled();
    if (this.vertexIDDisabled) {
      this.vertexBuffer = this.gl.getVertex_IDWorkaroundBuffer();
    }
  }

  udatePoints() {
    if (this.options.skipUpdatePoints) {
      return true;
    }
    let track = this.onGetAudioTrack(this);
    if (this.track !== track || !this.leftSamples) {
      this.track = track;
      if (!this.track) {
        return 
      }
      this.leftSamples = track.leftSamples;
      this.rightSamples = track.rightSamples;
      this.sampleRate = track.sampleRate;
      if (!this.leftSamples) {
        return 
      }
      this.duration = this.leftSamples.length / this.sampleRate;
    }
    
    this.duration = this.leftSamples.length / this.sampleRate;
    let durationOnScreen = (this.duration / this.control.xScaleSmooth);
    let screenStartTime = this.control.xOffsetSmooth * this.duration;

    if ((this.control.xOffsetSmooth + (1.0 / this.control.xScaleSmooth)) > 1.0) {
      return false;
    }
    if (this.control.xOffsetSmooth > 1.0) {
      return false;
    }
    if (screenStartTime >= this.startTime &&
      screenStartTime + durationOnScreen <= this.endTime) {
      // No need for update
      return true;
    }

    let wavLeft = this.leftSamples;
    let wavRight = this.rightSamples;

    this.timeStep = 1.0 / this.sampleRate;

    let sampleCount = this.maxSamples;
    let startSample = ~~Math.round((screenStartTime + 0.5 * durationOnScreen) * this.sampleRate) - sampleCount / 2;
    this.startTime = startSample / this.sampleRate;
    this.endTime = (startSample + sampleCount) / this.sampleRate;
    
    // if (startSample < 0) {
    //   sampleCount = Math.max(0, sampleCount + startSample);
    //   startSample = 0;
    // }
    // if (startSample + sampleCount > wavLeft.length) {
    //   let overflow = startSample + sampleCount - wavLeft.length;
    //   sampleCount = Math.max(0, sampleCount - overflow);
    // }
    const data = this.pointData;
    if (sampleCount !== 0) {
      let ofs = 0;
      this.pointsLength = sampleCount;
      for (let ix = startSample; ix < startSample + this.pointsLength; ix++) {
        data[ofs++] = 0.0;
        data[ofs++] = 0.5 * (wavLeft[ix] + wavRight[ix]);
        data[ofs++] = 0; // use for hover and stuff
        data[ofs++] = 1.0;
        // ofs += 4;
      }
      if (this.onAddEnergyLevels) {
        this.onAddEnergyLevels(data, this.pointsLength);
      }
    }
    this.pointInfo = this.gl.createOrUpdateFloat32TextureBuffer(data, this.pointInfo);//, 0, this.pointsLength * 4);
    return (sampleCount !== 0);
  }

  updateCanvas(doInit = true) {
    if (!this.isVisible) {
      return
    }
    if (!this.leftSamples) {
      this.udatePoints();
    }

    let gl = this.gl;

    let shader = gl.checkUpdateShader2('wav-line', getVertexShader, getFragmentShader);
  
    if (gl && shader && this.parentElement) {
      let durationOnScreen = this.duration / this.control.xScale;
      if (durationOnScreen <= this.durationTreshhold && this.udatePoints() && this.pointInfo) {
        if (gl.updateShaderAndSize(this, shader, this.parentElement)) {
          if (shader.u.pointDataTexture) {
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, this.pointInfo.texture);
            gl.uniform1i(shader.u.pointDataTexture, 2);
            gl.activeTexture(gl.TEXTURE0);
          }

          shader.u.scale?.set(this.control.xScaleSmooth, this.control.yScaleSmooth);
          shader.u.position?.set(this.control.xOffsetSmooth, this.control.yOffsetSmooth);
          shader.u.duration?.set(this.duration);
          shader.u.startTime?.set(this.startTime / this.duration * 2.0 - 1.0);
          shader.u.timeStep?.set(this.timeStep / this.duration * 2.0);
          shader.u.lineAlpha?.set(1.0);// - Math.pow(Math.max(0.0, durationOnScreen * 15.0 - 0.5), .2));
    
          if (this.vertexIDDisabled) {
            shader.a.vertexPosition.en();
            // @ts-ignore
            shader.a.vertexPosition.set(this.vertexBuffer, 1 /* elements per vertex */);
          }
          gl.drawArrays(gl.TRIANGLES, 0, (this.pointsLength - 1) * 6.0);
          if (this.vertexIDDisabled) {
            shader.a.vertexPosition.dis();
          }
        }
      }
    }
  }

}
