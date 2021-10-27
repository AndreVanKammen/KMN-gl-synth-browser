import { TimeLineBase } from "./time-line-base.js";

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
      lineInfo.x /= duration;

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
        pos.y = 0.0;
      } else {
        pos.y = 1.0;
      }

      lineXScreen = lineInfo.x;

      textureCoord = pos;
      pos = (pos - position) * scale;
      lineXScreen = (lineXScreen - position.x) * scale.x;
      lineXScreen = lineXScreen * windowSize.x;

      textureCoordScreen = pos * windowSize;

      gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
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

  const vec4 beatColor = vec4(0.50, 0.50, 0.50, 0.70);
  const vec4 barColor  = vec4(0.60, 0.60, 0.60, 0.75);
  const vec4 bar4Color = vec4(0.75, 0.75, 0.75, 0.85);
  const vec4 bar8Color = vec4(0.80, 0.80, 0.80, 0.80);

  void main(void) {
    vec4 color = vec4(0.0);
    // float lineDist = line(textureCoordScreen.xy, lineStartScreen.xy, lineEndScreen.xy);
    float lineDist = abs(textureCoordScreen.x - lineXScreen);
    float centerPoint = windowSize.y * ((0.5 - position.y) * scale.y);
    float halfHeight = windowSize.y * scale.y * 0.5;
    float edgeDist = halfHeight * 0.9 - abs(centerPoint-textureCoordScreen.y);
    
    float lineWidth = 0.15 * dpr;

    float durationOnScreen = duration / scale.x;
    float beatsOnSreen = durationOnScreen / timePerBeat;
    float pixelsPerLine = windowSize.x / beatsOnSreen;

    vec4 lineColor = beatColor;
    if ((int(lineInfo.y) % (beatsPerBar * 8)) == 0 && edgeDist < 0.1) {
      pixelsPerLine *= 64.0;
      lineColor = bar8Color;
      lineWidth = 0.95 * dpr;
      lineDist = max(lineDist,edgeDist);
    } else if ((int(lineInfo.y) % (beatsPerBar * 4)) == 0 && edgeDist < 0.1) {
      pixelsPerLine *= 16.0;
      lineColor = bar4Color;
      lineWidth = 0.6 * dpr;
      lineDist = max(lineDist,edgeDist);
    } else if ((int(lineInfo.y) % beatsPerBar == 0 && edgeDist < 0.1)) {
      pixelsPerLine *= 4.0;
      lineColor = barColor;
      lineWidth = 0.3 * dpr;
      lineDist = max(lineDist,edgeDist);
    } else {
      lineColor = beatColor;
    }
    if (lineInfo.z < 0.0 && edgeDist < 0.1) {
      lineColor = vec4(0.0);
    }
    if (lineInfo.w > 2.0) {
      pixelsPerLine *= 30.0;
      lineWidth = 0.15 * dpr;
      lineColor = vec4(1.0,1.0,0.0,1.0);
    }
    lineColor.a *= clamp(pow(pixelsPerLine, 0.3) - 1.8, 0.0, 1.0);
                  // * pow(durationOnScreen, 0.1) / 3.0;

    float hasLine = 1.0 - smoothstep(lineWidth, lineWidth + 1.5*dpr, lineDist);

    color = hasLine * lineColor;
 
    fragColor = color; //vec4(pow(color.rgb,vec3(1.0/2.2)),color.a);
  }
  `
}

export class BeatGridLines extends TimeLineBase {
  constructor(options) {
    super(options);
  }

  updateGrid(lines, duration) {
    this.lines = lines;
    this.duration = duration;
    
    this.updateLines();
  }

  updateLines(skipUpdate = false) {
    const gl = this.gl;
    // TODO size is multiple check for more then 1000 points
    this.lineDataLength = this.lines.length * 4;
    const data = this.lineData = new Float32Array(Math.ceil(this.lines.length * 4.0 / 4096) * 4096);
    let ofs = 0;
    for (const line of this.lines) {
      data[ofs++] = line.time;
      data[ofs++] = line.nr;
      data[ofs++] = line.type;
      data[ofs++] = line.phraseStart;
    }

    if (this.lines.length) {
      this.timePerBeat = (this.lines[this.lines.length - 1].time - this.lines[0].time) / this.lines.length;
    } else {
      this.timePerBeat = 1.0;
    }
    if (!skipUpdate) {
      this.lineInfo = gl.createOrUpdateFloat32TextureBuffer(data, this.lineInfo, 0, ofs);
    }
  }

  mouseOverLine(oldIx, newIx) {
  }

  mouseDownOnLine(ix) {
  }

  handleTimeChanged(ix, newTime) {
    this.lines[ix].time = newTime;
  }

  getShader() {
    return this.gl.checkUpdateShader('beat-grid-lines', getVertexShader(), getFragmentShader());
  }
}