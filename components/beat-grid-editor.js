import WebGLSynth from "../../KMN-gl-synth.js/webgl-synth.js";
import { animationFrame } from "../../KMN-utils-browser/animation-frame.js";
import PanZoomControl from "../../KMN-utils-browser/pan-zoom-control.js";
import getWebGLContext from "../../KMN-utils.js/webglutils.js";
// 0 1
// 2
// 2 1 3 4 
//   3   5

function getVertexShader() {
  return /*glsl*/`
    in vec2 vertexPosition;

    uniform sampler2D pointDataTexture;

    uniform vec2 scale;
    uniform vec2 position;
    uniform vec2 windowSize;
    uniform float dpr;
    uniform float duration;

    flat out vec4 lineInfo;

    flat out float lineXScreen;
  
    out vec2 textureCoord;
    out vec2 textureCoordScreen;

    void main(void) {
      int pointIx = gl_VertexID / 6;

      lineInfo = texelFetch(pointDataTexture, ivec2(pointIx % 1024, pointIx / 1024), 0);

      vec2 pixelSize = vec2(2.0) / scale / windowSize * dpr;
      pixelSize *= 2.0; // Maximum line width + aliasing
        
      int subPointIx = gl_VertexID % 6;
      vec2 pos;
      if (subPointIx == 1 || subPointIx >= 4) {
        pos.x = lineInfo.x - pixelSize.x;
      } else {
        pos.x = lineInfo.x + pixelSize.x;
      }

      if (subPointIx <= 1 || subPointIx == 4) {
        pos.y = -1.0;
      } else {
        pos.y = 1.0;
      }

      lineXScreen = lineInfo.x;

      textureCoord = pos;
      pos = (pos - position * 2.0 + 1.0) * scale - 1.0;
      lineXScreen = (lineXScreen - position.x * 2.0 + 1.0) * scale.x - 1.0;
      lineXScreen = (lineXScreen + 1.0) * 0.5 * windowSize.x;
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

  uniform vec2 scale;
  uniform vec2 position;

  uniform int beatsPerBar;
  uniform float timePerBeat;
  uniform float duration;

  flat in vec4 lineInfo;

  flat in float lineXScreen;

  in vec2 textureCoord;
  in vec2 textureCoordScreen;
  out vec4 fragColor;

  const vec4 beatColor = vec4(0.5,0.5,0.5, 0.7);
  const vec4 barColor = vec4(0.6,0.6,0.6, 0.75);
  const vec4 bar4Color = vec4(0.75,0.75,0.75, 0.85);
  const vec4 bar16Color = vec4(0.9,0.9,0.9, 0.95);

  void main(void) {
    vec4 color = vec4(0.0);
    // float lineDist = line(textureCoordScreen.xy, lineStartScreen.xy, lineEndScreen.xy);
    float lineDist = abs(textureCoordScreen.x - lineXScreen);
    float halfHeight = windowSize.y * 0.5;
    float barDist = halfHeight * 0.9 - abs(halfHeight-textureCoordScreen.y);

    float lineWidth = 0.15 * dpr;

    float durationOnScreen = duration / scale.x;
    float beatsOnSreen = durationOnScreen / timePerBeat;
    float pixelsPerLine = windowSize.x / beatsOnSreen;

    vec4 lineColor = beatColor;
    if ((int(lineInfo.y) % (beatsPerBar * 16)) == 0 && barDist < 0.1) {
      pixelsPerLine *= 64.0;
      lineColor = bar16Color;
      lineWidth = 0.95 * dpr;
      lineDist = max(lineDist,barDist);
    } else if ((int(lineInfo.y) % (beatsPerBar * 4)) == 0 && barDist < 0.1) {
      pixelsPerLine *= 16.0;
      lineColor = bar4Color;
      lineWidth = 0.6 * dpr;
      lineDist = max(lineDist,barDist);
    } else if ((int(lineInfo.y) % beatsPerBar == 0 && barDist < 0.1)) {
      pixelsPerLine *= 4.0;
      lineColor = barColor;
      lineWidth = 0.3 * dpr;
      lineDist = max(lineDist,barDist);
    } else {
      lineColor = beatColor;
    }
    lineColor.a *= clamp(pow(pixelsPerLine, 0.3) - 1.8, 0.0, 1.0);
                  // * pow(durationOnScreen, 0.1) / 3.0;

    float hasLine = 1.0 - smoothstep(lineWidth, lineWidth + 1.5*dpr, lineDist);

    color = hasLine * lineColor;
 
    fragColor = color; //vec4(pow(color.rgb,vec3(1.0/2.2)),color.a);
  }
  `
}

export class BeatGridEditor {
  constructor (options) {
    this.options = options;
    this.updateCanvasBound = this.updateCanvas.bind(this);
    this.width  = 10;
    this.height = 10;
    this.mouseDownOnPoint = null;
    this.beatsPerBar = 4;
    this.timePerBeat = 1.0;
    this.duration = 10.0;
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

    // this.control.addHandler(this);

    this.udateGrid( [
        {time:0.0, beatNr: 1.0}, 
        {time:1.0, beatNr: 2.0},
        {time:2.0, beatNr: 3.0},
        {time:3.0, beatNr: 4.0},
        {time:4.0, beatNr: 5.0}
      ], 1.0, 10.0);

    this.shader = gl.checkUpdateShader(this, getVertexShader(), getFragmentShader());

    if (!this.options.noRequestAnimationFrame) {
      animationFrame(this.updateCanvasBound);
    }
  }

  udateGrid(lines, timePerBeat, duration) {
    this.lines = lines;
    this.duration = duration;
    this.timePerBeat = timePerBeat;
    
    this.minValue = 0.0;
    this.maxValue = 1.0;
    this.valueRange = this.maxValue - this.minValue;

    this.updateLines();
  }

  updateLines(skipUpdate = false) {
    const gl = this.gl;
    // TODO size is multiple check for more then 1000 points
    const data = this.pointData = new Float32Array(Math.ceil(this.lines.length * 4.0 / 4096) * 4096);
    let ofs = 0;
    for (const line of this.lines) {
      data[ofs++] = (line.time / this.duration) * 2.0 - 1.0;
      data[ofs++] = line.beatNr;
      data[ofs++] = 0;
      data[ofs++] = 0;
    }
    if (!skipUpdate) {
      this.lineInfo = gl.createOrUpdateFloat32TextureBuffer(data, this.lineInfo, 0, ofs);
    }
  }

  handleClick(x, y) {
    if (this.selectedLineIx !== -1) {
      // Done in mouse down now
      // this.createNewPoint(x,y);
      this.lastClickTime = undefined;
    } else if (this.selectedPointIx !== -1) {
      let newClickTime = performance.now();
      if (this.lastClickTime && ((newClickTime - this.lastClickTime) < 400)) {
        this.lines.splice(this.selectedPointIx, 1);
        this.updateLines();
      }
      this.lastClickTime = newClickTime;
    } else {
      this.lastClickTime = undefined;
    }
    return false;
  }
  
  handleDown(x,y) {
    this.updateSelect(x,y);
    if (this.selectedLineIx !== -1) {
      this.mouseDownOnPoint = {x,y};
      //this.pointData[this.selectedLineIx * 4 + 2] = 1.0;
      this.lineInfo = this.gl.createOrUpdateFloat32TextureBuffer(this.pointData, this.lineInfo);
      return false;
    }
    return true;
  }
  handleMove(x,y) {
    if (this.mouseDownOnPoint) {
      let dx = this.mouseDownOnPoint.x - x;
      let dy = this.mouseDownOnPoint.y - y;
    } else {
      // this.updateSelect(x,y);
    }
    this.lineInfo = this.gl.createOrUpdateFloat32TextureBuffer(this.pointData, this.lineInfo);
    return false;
  }
  handleUp(x,y) {
    this.mouseDownOnPoint = null;
    return false;
  }
  handleKey(x,y,up) {
    console.log('key', this.control.event);
    this.updateSelect(x,y);
    this.lineInfo = this.gl.createOrUpdateFloat32TextureBuffer(this.pointData, this.lineInfo);
    return false;
  }
  updateSelect(x,y) {
    const pointSize = 20.0;
    const xOfs = x * 2.0 - 1.0;
    const yOfs = y * 2.0 - 1.0;
    const xFact = this.width * this.control.xScale / 2.0;
    const yFact = this.height * this.control.yScale / 2.0;
    let ofs = 0;
    let minDist = pointSize;
    let selectedIx = -1;
    let lineIx = -1;
    let lastSdx = 0.0;
    while (ofs < this.pointData.length) {
      const sdx = (this.pointData[ofs] - xOfs) * xFact;
      const dx = Math.abs(sdx);
      if (dx < pointSize) {
        const dy = Math.abs(this.pointData[ofs + 1] - yOfs) * yFact;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          minDist = dist;
          selectedIx = ofs / 4;
        }
      }
      if (lastSdx < 0.0 && sdx > 0.0) {
        lineIx = ofs / 4;
      }
      this.pointData[ofs + 2] = 0.0;
      this.pointData[ofs + 3] = 0.0;
      lastSdx = sdx;
      ofs += 4;
    }
    this.selectedLineIx = -1;
    if (selectedIx !== -1) {
      this.pointData[selectedIx * 4 + 2] = 1.0;
      this.parentElement.style.cursor = 'move';
    } else {
      this.parentElement.style.cursor = '';
      if (lineIx >= 1) {
        let pax = this.pointData[(lineIx - 1) * 4];
        let pbx = this.pointData[lineIx * 4];
        let pay = this.pointData[(lineIx - 1) * 4 + 1];
        let pby = this.pointData[lineIx * 4 + 1];
        let lineX = (xOfs - pax) / (pbx - pax);
        let yVal = (pay * (1.0 - lineX)) + lineX * pby;
        if (Math.abs(yVal - yOfs) * yFact < pointSize) {
          this.selectedLineIx = lineIx - 1;
          this.selectedLineOffset = lineX;
          if (this.control.event.ctrlKey) {
            this.parentElement.style.cursor = 'copy';
          } else {
            this.parentElement.style.cursor = 'ns-resize';
            lineX = 2.0;
          }
          this.pointData[this.selectedLineIx * 4 + 3] = lineX;
        }
      }
    }
    this.selectedPointIx = selectedIx;
  }

  updateCanvas() {
    let gl = this.gl;
    this.shader = gl.checkUpdateShader(this, getVertexShader(), getFragmentShader());
    let shader = this.shader;

    if (gl && shader && this.parentElement && this.lines?.length > 0) {

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
          gl.bindTexture(gl.TEXTURE_2D, this.lineInfo.texture);
          gl.uniform1i(shader.u.pointDataTexture, 2);
          gl.activeTexture(gl.TEXTURE0);
        }
  
        shader.u.windowSize?.set(w,h);
        shader.u.scale?.set(this.control.xScaleSmooth, this.control.yScaleSmooth);
        shader.u.position?.set(this.control.xOffsetSmooth, this.control.yOffsetSmooth);
        shader.u.dpr?.set(dpr);
        shader.u.beatsPerBar?.set(this.beatsPerBar);
        shader.u.timePerBeat?.set(this.timePerBeat);
        shader.u.duration?.set(this.duration);

        gl.drawArrays(gl.TRIANGLES, 0, (this.lines.length-1) * 6.0 );
      }
    }
    if (!this.options.noRequestAnimationFrame) {
      animationFrame(this.updateCanvasBound);
    }
  }

}