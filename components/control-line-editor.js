import PanZoomControl, { ControlHandlerBase, PanZoomBase, PanZoomParent } from "../../KMN-utils-browser/pan-zoom-control.js";
import defer from "../../KMN-utils.js/defer.js";
import getWebGLContext, { RenderingContextWithUtils } from "../../KMN-utils.js/webglutils.js";
import { RenderControl } from "../../KMN-varstack-browser/components/webgl/render-control.js";
import { BaseVar } from "../../KMN-varstack.js/vars/base.js";
import { ControlLineData } from "./control-line-data.js";
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

function getVertexShader(options) {
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

    ${options.flat}out vec4 lineStart;
    ${options.flat}out vec4 lineEnd;
    ${options.flat}out vec2 lineStartScreen;
    ${options.flat}out vec2 lineEndScreen;

    out vec2 textureCoord;
    out vec2 textureCoordScreen;

    void main(void) {
      int pointIx = gl_VertexID / 6;

      lineStart = texelFetch(pointDataTexture, ivec2(pointIx % 1024, pointIx / 1024), 0);
      pointIx++;
      lineEnd = texelFetch(pointDataTexture, ivec2(pointIx % 1024, pointIx / 1024), 0);

      vec2 pixelSize = vec2(2.0) / scale / windowSize * (pointSize + 2.0) * dpr;

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
function getFragmentShader(options) {
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

  ${options.flat}in vec4 lineStart;
  ${options.flat}in vec4 lineEnd;
  ${options.flat}in vec2 lineStartScreen;
  ${options.flat}in vec2 lineEndScreen;

  in vec2 textureCoord;
  in vec2 textureCoordScreen;
  out vec4 fragColor;

  float line(vec2 p, vec2 a, vec2 b)
  {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float l = length(ba);
    float h = clamp(dot(pa, ba) / dot(ba, ba), -2.0 / l, 1.0 + 2.0 / l);
    // float h = dot(pa, ba) / dot(ba, ba);
    return length(pa - ba * h);
  }

  const vec3 pointBorderColor = vec3(0.8);

  void main(void) {
    vec4 color = vec4(0.0);
    float lineDist = line(textureCoordScreen.xy, lineStartScreen.xy, lineEndScreen.xy);
    if (lineStartScreen.x == lineEndScreen.x && abs(lineStartScreen.y - lineEndScreen.y) < 1.0) {
      fragColor = vec4(0.0);
      return;
    }
    // fragColor = pow(vec4(1.0 - smoothstep(0.25,3.5,lineDist)),vec4(1.0/2.2));
    // return;
    float pointDist =
            // min(distance(textureCoordScreen.xy, lineEndScreen.xy  ),
                distance(textureCoordScreen.xy, lineStartScreen.xy);

    vec3 pointColor = vec3(0.19,0.19,0.9);
    float pointBorderWidth = 0.25 * dpr;
    float lineWidth = 0.6;
    float pointWidth = 0.5 * pointSize * dpr;
    if (lineStart.z > 0.0) {
      pointWidth = pointSize * dpr;
    }

    float hasPointBorder = 1.0 - smoothstep(pointBorderWidth, pointBorderWidth + 1.25, abs(pointDist - pointWidth));
    float hasPoint = 1.0 - smoothstep(pointWidth, pointWidth + 1.5, pointDist);
    hasPointBorder *= hasPoint;

    if (lineStart.w > 0.0) {
      lineWidth = 0.9;
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

    float hasLine = 1.0 - pow(smoothstep(lineWidth-0.5,lineWidth+1.0*dpr,lineDist),1.7);

    hasLine = max(hasLine - hasPoint, 0.0);

    color.rgb = clamp(hasPoint       * lineColor * 0.5 + //pointColor +
                      hasPointBorder * lineColor * 1.5 +
                      hasLine        * lineColor, 0.0, 1.0);

    color.a = max(max(hasPoint, hasLine), hasPointBorder);
    // if (color.a > 0.001) {
    //   color.rgb = min(color.rgb / (color.a + 0.01), 1.0);
    // }
    // color.a *= opacity;
    // color.a = 1.0;
    fragColor = pow(color.rgba,vec4(1.0/2.2));
  }
  `
}

export class ControlLineEditor extends ControlHandlerBase {
  constructor(options) {
    super();
    this.options = options;
    this.updateCanvasBound = this.updateCanvas.bind(this);
    this.width = 10;
    this.height = 10;
    this.mouseDownOnPoint = null;
    this.colors = colors;

    this.onUpdatePointData = null;
    this.updateDefered = false;
    this.handlePointDataUpdatedBound = this.handlePointDataUpdated.bind(this);
    /** @type {Record<string,ControlLineData>}*/
    this.controlData = {};
    /** @type {ControlLineData} */
    this._selectedControl = null;
    this.opacity = 1.0;
    this.rc = RenderControl.geInstance();
  }

  handleSelect() {
  }

  get selectedControl() {
    // return this.isSelected ? this._selectedControl : null;
    return this._selectedControl;
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
 * @param {number} colorIx
 * @param {import("./control-line-data.js").ControlLinePoint[]} points
 * @param {number} duration
 * @param {number} minValue
 * @param {number} defaultValue
 * @param {number} timeOffset
 * @param {BaseVar} labelVar
 * @returns {ControlLineData}
 */
  setPoints(dataName, colorIx, points, duration, minValue = 10000000.0, maxValue = -10000000.0, defaultValue = 1.0, timeOffset = 0.0, labelVar = null) {
    this.duration = duration;
    /** @type {ControlLineData} */
    let data = this.controlData[dataName];
    if (!data) {
      data = new ControlLineData(this, this.gl, this.control, dataName, colorIx);
      data.isVisible = this._isVisible;
      data.isEnabled = this._isEnabled;
      data.labelVar = labelVar;
      this.control.addHandler(data);
      this.controlData[dataName] = data;
    }
    data.setPoints(points, minValue, maxValue, defaultValue, timeOffset);
    return data;
  }

  clearAll() {
    for (let data of Object.values(this.controlData)) {
      this.control.removeHandler(data);
      data.dispose();
    }
    this.controlData = {};
    this.colorIx = 0;
  }

  dispose() {
    this.clearAll();
  }

  updateCanvas() {
    // F***** javascript if i use this.isVisible here it references the overriden setter which has no getter so undefined *()&^)*(*&
    if (!super.isVisible) {
      return
    }

    let gl = this.gl;
    // let shader = gl.checkUpdateShader('control-line', getVertexShader(), getFragmentShader());
    let shader = this.rc.checkUpdateShader2('control-line', getVertexShader, getFragmentShader);

    if (gl && shader && this.parentElement) {
      if (this.rc.updateShaderAndSize(this, shader, this.parentElement)) {
        shader.u.scale?.set(this.control.xScaleSmooth, this.control.yScaleSmooth);
        shader.u.position?.set(this.control.xOffsetSmooth, this.control.yOffsetSmooth);
        shader.u.duration?.set(this.duration);

        for (let key of Object.keys(this.controlData)) {
          let data = this.controlData[key];
          if (data.updatePointDataTexture()) {
            shader.u.lineColor?.set.apply(this, this.colors[data.colorIx % this.colors.length]);
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
            gl.drawArrays(gl.TRIANGLES, 0, (data.points.length + data.extraVertexPoints - 1) * 6.0);
          }
        }
      }
    }
  }

}