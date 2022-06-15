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

    out vec3 color;

    void main(void) {
      int vId = ${options.vertexIDDisabled ? 'int(round(vertexPosition))' : 'gl_VertexID'};
      int pointIx = vId / 2;

      vec4 lineStart = texelFetch(pointDataTexture, ivec2(pointIx % 1024, pointIx / 1024), 0);
      pointIx++;
      vec4 lineEnd = texelFetch(pointDataTexture, ivec2(pointIx % 1024, pointIx / 1024), 0);

      color = lineStart.yzw;
      
      int subPointIx = vId % 2;

      vec2 pos;

      float startX = startTime + float(pointIx) * timeStep;
      if (subPointIx == 0) {
        pos.x = startX;
        pos.y = lineStart.x;
      } else {
        pos.x = startX + timeStep;
        pos.y = lineEnd.x;
      }

      pos = (pos - position * 2.0 + 1.0) * scale - 1.0;

      gl_Position = vec4(pos, 0.0, 1.0);
    }`
}

  // The shader that calculates the pixel values for the filled triangles
function getFragmentShader() {
  return /*glsl*/`precision highp float;
  precision highp float;
  precision highp int;
  precision highp sampler2DArray;

  uniform float lineAlpha;

  in vec3 color;
  out vec4 fragColor;

  float line(vec2 p, vec2 a, vec2 b)
  {
    vec2 pa = p - a;
    vec2 ba = b - a;
    // float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float h = dot(pa, ba) / dot(ba, ba);
    return length(pa - ba * h);
  }

  const vec3 pointBorderColor = vec3(0.8);

  void main(void) {
    fragColor = vec4(color.rgb,lineAlpha);
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
    this.maxSamples = this.options.maxSamples || 256 * 1024;
    this.pointData = new Float32Array(Math.ceil(this.maxSamples * 4.0 / 4096) * 4096);
    this.sampleRate = 44100;
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
        data[ofs++] = 0.5 * (wavLeft[ix] + wavRight[ix]);
        data[ofs++] = 1.0; // R
        data[ofs++] = 1.0; // G
        data[ofs++] = 1.0; // B
        // ofs += 4;
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
          shader.u.lineAlpha?.set(1.0 - Math.max(0.0, Math.pow(durationOnScreen / this.durationTreshhold,0.33) - 0.2 ));
    
          if (this.vertexIDDisabled) {
            shader.a.vertexPosition.en();
            // @ts-ignore
            shader.a.vertexPosition.set(this.vertexBuffer, 1 /* elements per vertex */);
          }
          gl.drawArrays(gl.LINES, 0, (this.pointsLength - 1) * 2.0);
          if (this.vertexIDDisabled) {
            shader.a.vertexPosition.dis();
          }
        }
      }
    }
  }

}
