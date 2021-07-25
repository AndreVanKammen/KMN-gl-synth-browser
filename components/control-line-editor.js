import WebGLSynth from "../../KMN-gl-synth.js/webgl-synth.js";
import PanZoomControl from "../../KMN-utils-browser/pan-zoom-control.js";
import getWebGLContext from "../../KMN-utils.js/webglutils.js";
// 0 1
// 2
// 2 1 3 4 
//   3   5

function getVertexShader() {
  return `
    in vec2 vertexPosition;

    uniform sampler2D pointDataTexture;

    uniform vec2 scale;
    uniform vec2 position;
    uniform vec2 windowSize;

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
      
      int subPointIx = gl_VertexID % 6;
      vec2 pos;
      if (subPointIx == 1 || subPointIx >= 4) {
        pos.x = lineStart.x - 0.1;
      } else {
        pos.x = lineEnd.x + 0.1;
      }

      if (subPointIx <= 1 || subPointIx == 4) {
        pos.y = min(lineStart.y, lineEnd.y) - 0.1;
      } else {
        pos.y = max(lineStart.y, lineEnd.y) + 0.1;
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
  return `precision highp float;
  precision highp float;
  precision highp int;
  precision highp sampler2DArray;

  const float pi = 3.141592653589793;

  uniform vec2 windowSize;

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
  const vec3 lineColor = vec3(0.6,0.6,0.6);

  void main(void) {
    vec4 color = vec4(0.0);
    float lineDist = line(textureCoordScreen.xy, lineStartScreen.xy, lineEndScreen.xy);
    float pointDist =
            // min(distance(textureCoordScreen.xy, lineEndScreen.xy  ),
                distance(textureCoordScreen.xy, lineStartScreen.xy);

    vec3 pointColor = vec3(0.19,0.19,0.9);
    float pointBorderWidth = 0.25;
    float lineWidth = 0.5;
    float pointWidth = 6.0;
    if (lineStart.z > 0.0) {
      pointWidth = 14.0;
    }

    float hasPointBorder = 1.0 - smoothstep(pointBorderWidth, pointBorderWidth + 1.25, abs(pointDist - pointWidth));
    float hasPoint = 1.0 - smoothstep(pointWidth, pointWidth + 1.5, pointDist);

    if (lineStart.w > 0.0) {
      lineWidth = 2.0;
      if (lineStart.w < 1.0) {
        vec2 newPointPos = mix(lineStartScreen, lineEndScreen, lineStart.w);
        vec2 newPointDelta = abs(textureCoordScreen - newPointPos);
        float newPointDist = length(newPointDelta);
        // pointColor = vec3(0.0);

        float newHasPoint = 1.0 - smoothstep(14.0, 15.5, newPointDist);
        hasPoint = max(hasPoint, newHasPoint);
        hasPointBorder = max(hasPointBorder - newHasPoint, 1.0 - smoothstep(0.5, 2.0, abs(newPointDist-14.0)));

        float plus = min(1.0 - smoothstep(6.0, 7.5, newPointDist), 
                         1.0 - smoothstep(0.5, 2.0, min(newPointDelta.x, newPointDelta.y) ) );
        hasPointBorder = max(hasPointBorder, plus);

      }
    }

    float hasLine = 1.0 - smoothstep(lineWidth, lineWidth + 1.5, lineDist);

    hasLine = max(hasLine - hasPoint, 0.0);
    hasPoint = max(hasPoint - hasPointBorder, 0.0);

    color.rgb = hasPoint       * pointColor +
                hasPointBorder * pointBorderColor +
                hasLine        * lineColor;
                  
    color.a = max(max(hasPoint, hasLine), hasPointBorder);
    if (color.a > 0.001) {
      color.rgb = min(color.rgb / (color.a + 0.01), 1.0);
    }
    fragColor = pow(color,vec4(1.0/2.2));
  }
  `
}

export class ControlLineEditor {
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

    this.control = this.options.control || new PanZoomControl(this.parentElement, {
      minYScale: 1.0,
      maxYScale: 1.0,
      minXScale: 1.0,
      maxXScale: 1000.0
    });
    this.oldClick = this.control.onClick;
    this.control.onClick = this.handleClick.bind(this)
    this.control.onMove = this.handleMove.bind(this)
    this.control.onDown = this.handleDown.bind(this)
    this.control.onUp = this.handleUp.bind(this)
    this.control.onKeyDown = this.control.onKeyUp = this.handleKey.bind(this)

    // Create two triangles to form a square that covers the whole canvas
    this.udatePoints( [
        {time:0.0, value: 0.7}, 
        {time:1.0, value: 0.7}
      ], 1.0);

    // for (let ix = 0; ix < 1000; ix++) {
    //   const progress = ix / 1000;
    //   this.points.push({
    //     time: 4.0 + progress * 2.0,
    //     value: 0.5 + 0.5 * Math.sin(progress * Math.PI * 2.0)
    //   });
    // }
    // this.points.push({time:7.0, value: 0.2});

    this.shader = gl.getShaderProgram(
      getVertexShader(), 
      getFragmentShader(),
      2);

    if (!this.options.noRequestAnimationFrame) {
      window.requestAnimationFrame(this.updateCanvasBound);
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
    const data = this.pointData = new Float32Array(4096);//this.points.length * 4.0);
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

  setLineData(points, maxX) {
    this.points = points;
    this.maxX = maxX;
  }

  createNewPoint(x,y) {
    let pa = this.points[this.selectedLineIx];
    let pb = this.points[this.selectedLineIx + 1];
    const lineX = this.selectedLineOffset;
    let newTime = (pa.time * (1.0 - lineX)) + lineX * pb.time;
    let newValue = (pa.value * (1.0 - lineX)) + lineX * pb.value;
    console.log('click', newTime, newValue);
    this.points.splice(this.selectedLineIx + 1, 0, { time: newTime, value: newValue });
    this.updatePointData();
    this.selectedPointIx = this.selectedLineIx + 1;
  }

  handleClick(x, y) {
    if (this.selectedLineIx !== -1) {
      // Done in mouse down now
      // this.createNewPoint(x,y);
      this.lastClickTime = undefined;
    } else if (this.selectedPointIx !== -1) {
      let newClickTime = performance.now();
      if (this.lastClickTime && ((newClickTime - this.lastClickTime) < 400)) {
        this.points.splice(this.selectedPointIx, 1);
        this.updatePointData();
      }
      this.lastClickTime = newClickTime;
    } else {
      this.oldClick(x, y);
      this.lastClickTime = undefined;
    }
  }
  handleDown(x,y) {
    this.updateSelect(x,y);
    if (this.selectedLineIx !== -1 && this.control.event.ctrlKey) {
      this.createNewPoint(x,y);
    }
    if (this.selectedPointIx !== -1 || this.selectedLineIx !== -1) {
      this.mouseDownOnPoint = {x,y};
      this.mouseDownMinTime = 0;
      this.mouseDownMaxTime = this.duration;
      if (this.selectedPointIx > 0) {
        this.mouseDownMinTime = this.points[this.selectedPointIx-1].time;
      
        if (this.selectedPointIx < this.points.length - 1) {
          this.mouseDownMaxTime = this.points[this.selectedPointIx+1].time;
        }
        this.mouseDownTime = this.points[this.selectedPointIx].time;
        this.mouseDownValue = this.points[this.selectedPointIx].value;

        this.pointData[this.selectedPointIx * 4 + 2] = 1.0;
      } else {
        if (!this.control.event.ctrlKey) {
          this.mouseDownValue = this.points[this.selectedLineIx].value;
          this.mouseDownValue2 = this.points[this.selectedLineIx + 1].value;
          this.pointData[this.selectedLineIx * 4 + 2] = 1.0;
          this.pointData[this.selectedLineIx * 4 + 6] = 1.0;
        }
      }
      this.pointInfo = this.gl.createOrUpdateFloat32TextureBuffer(this.pointData, this.pointInfo);
      return false;
    }
    return true;
  }
  handleMove(x,y) {
    if (this.mouseDownOnPoint) {
      let dx = this.mouseDownOnPoint.x - x;
      let dy = this.mouseDownOnPoint.y - y;
      if (!this.control.event.ctrlKey && this.selectedLineIx !== -1) {

        let newValue1 = this.mouseDownValue - dy * this.valueRange;
        let newValue2 = this.mouseDownValue2 - dy * this.valueRange;
        if (newValue2 < 0) {
          newValue1 -= newValue2;
          newValue2 = 0;
        }
        if (newValue1 < 0) {
          newValue2 -= newValue1;
          newValue1 = 0;
        }
        let dyCorrection = 0.0;
        if (newValue2 > this.maxValue) {
          dyCorrection = newValue2 - this.maxValue;
        }
        if (newValue1 > this.maxValue) {
          dyCorrection = Math.max(dyCorrection,newValue1 - this.maxValue);
        }
        newValue1 -= dyCorrection;
        newValue2 -= dyCorrection;
        this.points[this.selectedLineIx].value = newValue1;
        this.points[this.selectedLineIx + 1].value = newValue2;

        this.updatePointData(true);

        this.pointData[this.selectedLineIx * 4 + 2] = 1.0;
        this.pointData[this.selectedLineIx * 4 + 3] = 2.0;
        this.pointData[this.selectedLineIx * 4 + 6] = 1.0;
      } else {
        let newTime = this.mouseDownTime - dx * this.duration;
        newTime = Math.min(Math.max(newTime, this.mouseDownMinTime),this.mouseDownMaxTime);
        this.points[this.selectedPointIx].time = newTime;
  
        let newValue = this.mouseDownValue - dy * this.valueRange;
        newValue = Math.min(Math.max(newValue, this.minValue),this.maxValue);
        this.points[this.selectedPointIx].value = newValue;
  
        this.updatePointData(true);
        this.pointData[this.selectedPointIx * 4 + 2] = 1.0;
      }

    } else {
      this.updateSelect(x,y);
    }
    this.pointInfo = this.gl.createOrUpdateFloat32TextureBuffer(this.pointData, this.pointInfo);
  }
  handleUp(x,y) {
    this.mouseDownOnPoint = null;
  }
  handleKey(x,y) {
    console.log('key', this.control.event);
    this.updateSelect(x,y);
    this.pointInfo = this.gl.createOrUpdateFloat32TextureBuffer(this.pointData, this.pointInfo);
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
    let shader = this.shader;

    if (gl && shader && this.parentElement) {

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
        this.currentScaleX = (this.currentScaleX || 0.0) * 0.9 + 0.1 * this.control.xScale;
        this.currentScaleY = (this.currentScaleY || 0.0) * 0.9 + 0.1 * this.control.yScale;

        this.currentOffsetX = (this.currentOffsetX || 0.0) * 0.9 + 0.1 * this.control.xOffset;
        this.currentOffsetY = (this.currentOffsetY || 0.0) * 0.9 + 0.1 * this.control.yOffset;

        shader.u.windowSize?.set(w,h);
        if (shader.u.pointDataTexture) {
          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, this.pointInfo.texture);
          gl.uniform1i(shader.u.pointDataTexture, 2);
          gl.activeTexture(gl.TEXTURE0);
        }
  
        shader.u.scale?.set(this.currentScaleX, this.currentScaleY);
        shader.u.position?.set(this.currentOffsetX, this.currentOffsetY);

        gl.drawArrays(gl.TRIANGLES, 0, (this.points.length-1) * 6.0 );
      }
    }
    if (!this.options.noRequestAnimationFrame) {
      window.requestAnimationFrame(this.updateCanvasBound);
    }
  }

}