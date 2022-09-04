import PanZoomControl, { ControlHandlerBase, PanZoomBase, PanZoomParent } from "../../KMN-utils-browser/pan-zoom-control.js";
import defer from "../../KMN-utils.js/defer.js";
import getWebGLContext, { RenderingContextWithUtils } from "../../KMN-utils.js/webglutils.js";
import { RenderControl } from "../../KMN-varstack-browser/components/webgl/render-control.js";
// 0 1
// 2
// 2 1 3 4 
//   3   5
const colors = [
  [0.9, 0.9, 0.9],
  [1.0, 0.3, 0.0],
  [  0, 0.7,   0],
  [0.8, 0.5,   0],
  [  0, 0.5, 0.8],
  [0.8,   0, 0.8],
  [0.9, 0.5,   0],
  [  0, 0.5, 0.5],
  [0.5,   0, 0.9],
  [0.5, 0.5,   0],
  [  0, 0.25,1.0],
  [0.5,   0, 1.0]
];

function getVertexShader() {
  return /*glsl*/`precision highp float;
    precision highp float;
    precision highp int;
    
    uniform float pointSize;
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
      
      vec2 pixelSize = vec2(2.0) / scale / windowSize * (pointSize + 1.0) * dpr;

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
  uniform vec3 lineColor;
  uniform float pointSize;
  uniform float opacity;

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
    float pointDist =
            // min(distance(textureCoordScreen.xy, lineEndScreen.xy  ),
                distance(textureCoordScreen.xy, lineStartScreen.xy);

    vec3 pointColor = vec3(0.19,0.19,0.9);
    float pointBorderWidth = 0.25 * dpr;
    float lineWidth = 0.25 * dpr;
    float pointWidth = 0.5 * pointSize * dpr;
    if (lineStart.z > 0.0) {
      pointWidth = pointSize * dpr;  
    }

    float hasPointBorder = 1.0 - smoothstep(pointBorderWidth, pointBorderWidth + 1.25, abs(pointDist - pointWidth));
    float hasPoint = 1.0 - smoothstep(pointWidth, pointWidth + 1.5, pointDist);

    if (lineStart.w > 0.0) {
      lineWidth = 0.75 * dpr;
      if (lineStart.w < 1.0) {
        vec2 newPointPos = mix(lineStartScreen, lineEndScreen, lineStart.w);
        vec2 newPointDelta = abs(textureCoordScreen - newPointPos);
        float newPointDist = length(newPointDelta);
        // pointColor = vec3(0.0);

        float newHasPoint = 1.0 - smoothstep(8.0 * dpr, 9.5 * dpr, newPointDist);
        hasPoint = max(hasPoint, newHasPoint);
        hasPointBorder = max(hasPointBorder - newHasPoint, 0.6 - smoothstep(0.5, 2.0, abs(newPointDist-8.0)));

        float plus = min(1.0 - smoothstep(4.0* dpr, 4.5* dpr, newPointDist), 
                         1.0 - smoothstep(0.5* dpr, 1.0* dpr, min(newPointDelta.x, newPointDelta.y) ) );
        hasPointBorder = max(hasPointBorder, plus);

      }
    }

    float hasLine = 1.0 - pow(smoothstep(lineWidth, lineWidth + 1.5*dpr, lineDist),.5);

    hasLine = max(hasLine - hasPoint, 0.0);
    hasPoint = max(hasPoint - hasPointBorder, 0.0);

    color.rgb = clamp(hasPoint       * lineColor * 0.5 + //pointColor +
                      hasPointBorder * lineColor * 1.5 +
                      hasLine        * lineColor, 0.0, 1.0);
                  
    color.a = max(max(hasPoint, hasLine), hasPointBorder);
    if (color.a > 0.001) {
      color.rgb = min(color.rgb / (color.a + 0.01), 1.0);
    }
    color.a *= opacity;
    fragColor = pow(color.rgba,vec4(1.0/2.2));
  }
  `
}

export class ControlLineData extends ControlHandlerBase {
  /**
   * @param {ControlLineEditor} owner
   * @param {*} gl
   * @param {PanZoomBase} control
   * @param {string} [dataName]
   */
  constructor(owner, gl, control, dataName) {
    super();

    this.owner = owner;
    /** @type {RenderingContextWithUtils} */
    this.gl = gl;
    this.control = control;
    this.mouseDownOnPoint = null;
    this.onUpdatePointData = null;
    this.dataName = dataName;
    this.color = colors[this.owner.colorIx++ % colors.length];
    this.valueSnaps = [];
  }

  dispose() {
    this.owner = null;
    this.mouseDownOnPoint = null;
    this.onUpdatePointData = null;
    this.gl.deleteFloat32TextureBuffer(this.pointInfo);
    this.pointData = null;
  }

  updateStateToOwner() {
    if (this.selectedLineIx >= 0 || this.selectedPointIx > 0) {
      this.owner.selectedControl = this;
    } else {
      if (this.owner.selectedControl === this) {
        this.owner.selectedControl = null;
      }
    }
  }

  /**
   * 
   * @param {{time:number,value:number}[]} points
   * @param {number} minValue
   * @param {number} maxValue
   * @param {number} defaultValue
   * @param {number} timeOffset
   */
  setPoints(points, minValue = 0.0, maxValue = 1.0, defaultValue = 1.0, timeOffset = 0) {
    this.points = points;
    
    this.minValue = minValue;
    this.maxValue = maxValue
    this.defaultValue = defaultValue;
    this.timeOffset = timeOffset
    for (const point of this.points) {
      this.minValue = Math.min(this.minValue, point.value);
      this.maxValue = Math.max(this.maxValue, point.value);
    }
    this.valueRange = this.maxValue - this.minValue;
    this.valueSnapDist = this.valueRange * 0.03;

    this.updatePointData();
  }

  updatePointData(skipUpdate = false) {
    const gl = this.gl;
    // TODO size is multiple check for more then 1000 points
    const data = this.pointData = new Float32Array(Math.ceil((this.points.length + 1) * 4.0 / 4096) * 4096);
    let ofs = 0;
    for (const point of this.points) {
      let time = point.time + this.timeOffset;
      data[ofs++] = (time / this.owner.duration) * 2.0 - 1.0;
      data[ofs++] = (point.value - this.minValue) / this.valueRange * 2.0 - 1.0;
      data[ofs++] = 0; // use for hover and stuff
      data[ofs++] = 0;
    }
    // Copy last points data
    data[ofs++] = data[ofs - 5];
    data[ofs++] = data[ofs - 5];
    data[ofs++] = data[ofs - 5];
    data[ofs++] = data[ofs - 5];
    if (!skipUpdate) {
      this.pointInfo = gl.createOrUpdateFloat32TextureBuffer(data, this.pointInfo, 0, ofs);
    }
    if (this.owner.onUpdatePointData) {
      if (!this.owner.updateDefered) {
        this.owner.updateDefered = true;
        defer(this.owner.handlePointDataUpdatedBound);
      }
    }
  }

  createNewPoint(x, y) {
    let pa = this.points[this.selectedLineIx];
    let pb = this.points[this.selectedLineIx + 1];
    const lineX = this.selectedLineOffset;
    let newTime = (pa.time * (1.0 - lineX)) + lineX * pb.time;
    let newValue = (pa.value * (1.0 - lineX)) + lineX * pb.value;
    console.log('click', newTime, newValue);
    this.points.splice(this.selectedLineIx + 1, 0, { time: newTime, value: newValue });
    this.updatePointData();
    this.selectedPointIx = this.selectedLineIx + 1;
    this.updateStateToOwner()
    this.owner.controlDataUpdate(this);
  }

  handleClick(x, y) {
    if (this.selectedLineIx !== -1) {
      // Done in mouse down now
      // this.createNewPoint(x,y);
      let newClickTime = performance.now();
      if (this.lastClickTime && ((newClickTime - this.lastClickTime) < 400)) {
        this.createNewPoint(x, y);
        // this.updatePointData();
      }
      this.lastClickTime = newClickTime;
    } else if (this.selectedPointIx !== -1) {
      let newClickTime = performance.now();
      // Don't delete 1st or last point
      if (this.selectedPointIx !== 0 && this.selectedPointIx < this.points.length - 1) {
        if (this.lastClickTime && ((newClickTime - this.lastClickTime) < 400)) {
          this.points.splice(this.selectedPointIx, 1);
          this.updatePointData();
          this.owner.controlDataUpdate(this);
        }
      }
      this.lastClickTime = newClickTime;
    } else {
      // this.oldClick(x, y);
      this.lastClickTime = undefined;
      return false;
    }
    return true;
  }
  handleDblClick(x, y) {
    return this.selectedLineIx !== -1 || this.selectedPointIx !== -1;
  }
  
  handleDown(x, y) {
    this.updateSelect(x, y);
    if (this.selectedLineIx !== -1 && this.control.event.ctrlKey) {
      this.createNewPoint(x, y);
      return true;
    }
    this.pointsChanged = false;
    if (this.selectedPointIx >= 0 || this.selectedLineIx !== -1) {
      this.captureControl();
      this.mouseDownOnPoint = { x, y };
      this.mouseDownMinTime = 0;
      this.mouseDownMaxTime = this.owner.duration;
      if (this.selectedPointIx >= 0) {
        this.valueSnaps = [this.defaultValue];
        if (this.selectedPointIx > 0) {
          this.mouseDownMinTime = this.points[this.selectedPointIx - 1].time;
          this.valueSnaps.push(this.points[this.selectedPointIx - 1].value)
        }
        if (this.selectedPointIx < this.points.length - 1) {
          this.mouseDownMaxTime = this.points[this.selectedPointIx + 1].time;
          this.valueSnaps.push(this.points[this.selectedPointIx + 1].value)
        }
        console.log(this.defaultValue, this.minValue, this.maxValue, this.valueSnaps);
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
      return true;
    }
    return this.selectedPointIx !== -1 || this.selectedLineIx !== -1;
  }

  handleLeave(x, y) {
    this.releaseControl();
    this.blur();
    this.selectedLineIx = -1;
    this.selectedPointIx = -1;
    if (this.pointData) {
      this.pointInfo = this.gl.createOrUpdateFloat32TextureBuffer(this.pointData, this.pointInfo);
    }
  }

  updatePointValue(ix, value) {
    // console.log('value:',ix, this.points[ix].value, value);
    if (this.points[ix].value !== value) {
      this.points[ix].value = value;
      this.pointsChanged = true;
    }
  }

  updatePointTime(ix, time) {
    // console.log('time:',ix, this.points[ix].value, time);
    if (this.points[ix].time !== time) {
      this.points[ix].time = time;
      this.pointsChanged = true;
    }
  }

  handleMove(x, y) {
    if (this.mouseDownOnPoint) {
      let dx = this.mouseDownOnPoint.x - x;
      let dy = this.mouseDownOnPoint.y - y;
      if (!this.control.event.ctrlKey && this.selectedLineIx !== -1) {

        let newValue1 = this.mouseDownValue - dy * this.valueRange;
        let newValue2 = this.mouseDownValue2 - dy * this.valueRange;
        if (newValue2 < this.minValue) {
          // newValue1 -= newValue2;
          newValue2 = this.minValue;
        }
        if (newValue1 < this.minValue) {
          // newValue2 -= newValue1;
          newValue1 = this.minValue;
        }
        // let dyCorrection = 0.0;
        if (newValue2 > this.maxValue) {
          newValue2 = this.maxValue;
          // dyCorrection = newValue2 - this.maxValue;
        }
        if (newValue1 > this.maxValue) {
          newValue1 = this.maxValue;
          // dyCorrection = Math.max(dyCorrection,newValue1 - this.maxValue);
        }
        // newValue1 -= dyCorrection;
        // newValue2 -= dyCorrection;
        this.updatePointValue(this.selectedLineIx, newValue1);
        this.updatePointValue(this.selectedLineIx + 1, newValue2);
        this.updatePointData(true);

        this.pointData[this.selectedLineIx * 4 + 2] = 1.0;
        this.pointData[this.selectedLineIx * 4 + 3] = 2.0;
        this.pointData[this.selectedLineIx * 4 + 6] = 1.0;
      } else {
        if (this.selectedPointIx === 0 || this.selectedPointIx >= this.points.length - 1) {
          dx = 0;
        }
        let newTime = this.mouseDownTime - dx * this.owner.duration;
        newTime = Math.min(Math.max(newTime, this.mouseDownMinTime), this.mouseDownMaxTime);
        this.updatePointTime(this.selectedPointIx, newTime);
  
        let newValue = this.mouseDownValue - dy * this.valueRange;
        newValue = Math.min(Math.max(newValue, this.minValue), this.maxValue);

        let minDist = 100000000.0;
        let snapIx = -1;
        for (let ix = 0; ix <= this.valueSnaps.length; ix++) {
          let v = this.valueSnaps[ix];
          let dist = Math.abs(newValue - v);
          if (dist < this.valueSnapDist) {
            minDist = dist;
            snapIx = ix;
          }
        }
        if (snapIx >= 0) {
          newValue = this.valueSnaps[snapIx];
        }

        this.updatePointValue(this.selectedPointIx, newValue);
  
        this.updatePointData(true);
        this.pointData[this.selectedPointIx * 4 + 2] = 1.0;
      }
    } else {
      this.updateSelect(x, y);
    }
    this.pointInfo = this.gl.createOrUpdateFloat32TextureBuffer(this.pointData, this.pointInfo);
    let isSelected = this.selectedPointIx !== -1 || this.selectedLineIx !== -1;
    if (isSelected) {
      this.focus();
    } else {
      this.blur();
    }
    return isSelected;
  }
  handleUp(x, y) {
    this.releaseControl();
    this.mouseDownOnPoint = null;
    if (this.pointsChanged) {
      this.owner.controlDataUpdate(this);
    }
    return false;
  }
  handleKey(x, y, up) {
    this.updateSelect(x, y);
    this.pointInfo = this.gl.createOrUpdateFloat32TextureBuffer(this.pointData, this.pointInfo);
    return false;
  }
  updateSelect(x, y) {
    const pointSize = 10.0;
    if (!this.points) {
      this.selectedLineIx = -1;
      this.selectedPointIx = -1;
      this.updateStateToOwner()
      return;
    }

    const cd = {
      xOffset: x * 2.0 - 1.0,
      yOffset: y * 2.0 - 1.0,
      xFactor: this.owner.width * this.control.xScale / 2.0,
      yFactor: this.owner.height * this.control.yScale / 2.0
    }

    let ofs = 0;
    let minDist = pointSize * 2.0;
    let selectedIx = -1;
    let lineIx = -1;
    let lastSdx = 0.0;
    while (ofs < this.points.length * 4) {
      const sdx = (this.pointData[ofs] - cd.xOffset) * cd.xFactor;
      const dx = Math.abs(sdx);
      if (dx < pointSize) {
        const dy = Math.abs(this.pointData[ofs + 1] - cd.yOffset) * cd.yFactor;
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
      this.setCursor('move');
    } else {
      this.setCursor('');
      if (lineIx >= 1) {
        let lineStartIx = lineIx - 1;
        let pax = this.pointData[lineStartIx * 4];
        let pay = this.pointData[lineStartIx * 4 + 1];
        let pbx = this.pointData[lineIx * 4];
        let pby = this.pointData[lineIx * 4 + 1];
        let lineX = (cd.xOffset - pax) / (pbx - pax);
        let yVal = (pay * (1.0 - lineX)) + lineX * pby;
        if (Math.abs(yVal - cd.yOffset) * cd.yFactor < pointSize) {
          this.selectedLineIx = lineIx - 1;
          this.selectedLineOffset = lineX;
          if (this.control.event.ctrlKey) {
            this.setCursor('copy');
          } else {
            this.setCursor('ns-resize');
            lineX = 2.0;
          }
          this.pointData[this.selectedLineIx * 4 + 3] = lineX;
        }
      }
    }
    this.selectedPointIx = selectedIx;
    this.updateStateToOwner()
  }
}
export class ControlLineEditor extends ControlHandlerBase {
  constructor(options) {
    super();
    this.options = options;
    this.updateCanvasBound = this.updateCanvas.bind(this);
    this.width = 10;
    this.height = 10;
    this.mouseDownOnPoint = null;

    this.onUpdatePointData = null;
    this.updateDefered = false;
    this.handlePointDataUpdatedBound = this.handlePointDataUpdated.bind(this);
    this.colorIx = ~~0;
    /** @type {Record<string,ControlLineData>}*/
    this.controlData = {};
    /** @type {ControlLineData} */
    this.selectedControl = null;
    this.opacity = 1.0;
  }

  /**
   * 
   * @param {ControlLineData} lineData 
   */
  controlDataUpdate(lineData) {
  }

  set isVisible(x) {
    if (this._isVisible !== x) {
      super.isVisible = x
      for (let cd of Object.values(this.controlData)) {
        cd.isVisible = x;
      }
    }
  }

  // Thanks javascript, this cost me 15 minutes to find out that if you don't pass trough the getter it's undefined $%^&%^*^&I
  get isVisible() {
    return super.isVisible;
  }

  set isEnabled(x) {
    if (this._isEnabled !== x) {
      super.isEnabled = x
      for (let cd of Object.values(this.controlData)) {
        cd.isEnabled = x;
      }
    }
  }
  
  get isEnabled() {
    return super.isEnabled;
  }

  /**
   * @param {HTMLElement} parentElement
   */
  initializeDOM(parentElement) {
    this.parentElement = parentElement;

    this.canvas = this.options.canvas || this.parentElement.$el({tag:'canvas', cls:'analyzerCanvas'});
    const gl = this.gl = getWebGLContext(this.canvas);

    /** @type {PanZoomBase} */
    this.control = this.options.control || new PanZoomControl(this.parentElement, {
      minYScale: 1.0,
      maxYScale: 1.0,
      minXScale: 1.0,
      maxXScale: 1000.0
    });

    // this.shader = gl.checkUpdateShader('control-line',  getVertexShader(), getFragmentShader());

    if (this.options.canvasRoutine) {
      this.canvasRoutine = this.options.canvasRoutine;
    } else {
      this.canvasRoutine = RenderControl.geInstance().registerCanvasUpdate('control-line-edit', this.updateCanvasBound, this.parentElement);
    }
  }

  handlePointDataUpdated() {
    this.updateDefered = false;
    this.onUpdatePointData(this);
  }

/**
 * 
 * @param {string} dataName
 * @param {{time:number,value:number}[]} points
 * @param {number} duration
 * @param {number} minValue
 * @param {number} defaultValue
 * @param {number} timeOffset
 */
  setPoints(dataName, points, duration, minValue = 10000000.0, maxValue = -10000000.0, defaultValue = 1.0, timeOffset = 0.0) {
    this.duration = duration;
    /** @type {ControlLineData} */
    let data = this.controlData[dataName];
    if (!data) {
      data = new ControlLineData(this, this.gl, this.control, dataName);
      data.isVisible = this._isVisible;
      data.isEnabled = this._isEnabled;
      this.control.addHandler(data);
      this.controlData[dataName] = data;
    }
    data.setPoints(points, minValue, maxValue, defaultValue, timeOffset);
  }

  clearAll() {
    for (let data of Object.values(this.controlData)) {
      this.control.removeHandler(data);
      data.dispose();
    }
    this.controlData = {};
    this.colorIx = 0;
  }

  updateCanvas() {
    // F***** javascript if i use this.isVisible here it references the overriden setter which has no getter so undefined *()&^)*(*&
    if (!super.isVisible) {
      return
    }

    let gl = this.gl;
    // let shader = gl.checkUpdateShader('control-line', getVertexShader(), getFragmentShader());
    let shader = gl.checkUpdateShader2('control-line', getVertexShader, getFragmentShader);

    if (gl && shader && this.parentElement) {
      if (gl.updateShaderAndSize(this, shader, this.parentElement)) {
        shader.u.scale?.set(this.control.xScaleSmooth, this.control.yScaleSmooth);
        shader.u.position?.set(this.control.xOffsetSmooth, this.control.yOffsetSmooth);
        shader.u.duration?.set(this.duration);

        for (let key of Object.keys(this.controlData)) {
          let data = this.controlData[key];
          shader.u.lineColor?.set.apply(this, data.color);// (0.6,0.6,0.6);
          if (data._isFocused) {
            shader.u.pointSize?.set(7.0);
          } else {
            shader.u.pointSize?.set(0.0);
          }
          if (shader.u.pointDataTexture) {
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, data.pointInfo.texture);
            gl.uniform1i(shader.u.pointDataTexture, 2);
            gl.activeTexture(gl.TEXTURE0);
          }
          shader.u.opacity?.set(this.opacity);
          gl.drawArrays(gl.TRIANGLES, 0, (data.points.length) * 6.0);
        }
      }
    }
  }

}