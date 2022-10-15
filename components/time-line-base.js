import PanZoomControl, { ControlHandlerBase } from "../../KMN-utils-browser/pan-zoom-control.js";
import getWebGLContext from "../../KMN-utils.js/webglutils.js";
import { RenderControl } from "../../KMN-varstack-browser/components/webgl/render-control.js";
// 0 1
// 2
// 2 1 3 4
//   3   5

export class TimeLineBase extends ControlHandlerBase {
  constructor(options) {
    super();

    this.options = options;
    this.updateCanvasBound = this.updateCanvas.bind(this);
    this.width = 10;
    this.height = 10;
    this.mouseDownOnPoint = null;
    this.beatsPerBar = 4;
    this.timePerBeat = 1.0;
    this.duration = 10.0;
    this.lineDataLength = 0;
    this.lineData = undefined;
    this.perfStart = performance.now();
    this.rc = RenderControl.geInstance();
  }

  /**
   * @param {HTMLElement} parentElement
   */
  initializeDOM(parentElement) {
    this.parentElement = parentElement;

    this.canvas = this.options.canvas || this.parentElement.$el({ tag: 'canvas', cls: 'analyzerCanvas' });
    const gl = this.gl = getWebGLContext(this.canvas);

    /** @type {PanZoomControl} */
    this.control = this.options.control || new PanZoomControl(this.parentElement, {
      minYScale: 1.0,
      maxYScale: 1.0,
      minXScale: 1.0,
      maxXScale: 1000.0
    });

    this.control.addHandler(this);
    this.vertexBuffer = this.rc.getVertex_IDWorkaroundBuffer();

    // this.shader = gl.checkUpdateShader(this, getVertexShader(), getFragmentShader());

    if (this.options.canvasRoutine) {
      this.canvasRoutine = this.options.canvasRoutine;
    } else {
      this.canvasRoutine = RenderControl.geInstance().registerCanvasUpdate('time-line', this.updateCanvasBound, this.parentElement);
    }
  }

  handleTimeChanged(ix, newTime) {
  }

  mouseOverLine(oldIx, newIx) {
  }

  mouseDownOnLine(ix) {
  }

  getShader() {
    return null;
  }

  handleClick(x, y) {
    if (this.selectedPointIx !== -1) {
      let newClickTime = performance.now();
      if (this.lastClickTime && ((newClickTime - this.lastClickTime) < 400)) {
        // this.points.splice(this.selectedPointIx, 1);
        // this.updateLines();
      }
      this.lastClickTime = newClickTime;
    } else {
      // this.oldClick(x, y);
      this.lastClickTime = undefined;
      return false;
    }
    return true;
  }

  handleDown(x, y) {
    this.updateSelect(x, y);
    if (this.selectedPointIx >= 0) {
      this.captureControl();
      this.mouseDownOnPoint = { x, y };
      this.mouseDownLineTime = this.lineData[this.selectedPointIx * 4];
      this.mouseDownOnLine(this.selectedPointIx);
      this.lineInfo = this.gl.createOrUpdateFloat32TextureBuffer(this.lineData, this.lineInfo);
      return true;
    }
    return this.selectedPointIx !== -1;
  }

  handleLeave(x, y) {
    this.releaseControl();
    this.updateSelect(-1, -1);
    if (this.lineData) {
      this.lineInfo = this.gl.createOrUpdateFloat32TextureBuffer(this.lineData, this.lineInfo);
    }
  }

  handleMove(x, y) {
    if (this.mouseDownOnPoint) {
      let dx = this.mouseDownOnPoint.x - x;
      let dy = this.mouseDownOnPoint.y - y;

      let newTime = this.mouseDownLineTime - dx * this.duration;
      newTime = Math.min(Math.max(newTime, 0.0), this.duration);
      this.lineData[this.selectedPointIx * 4] = newTime;

      // this.lineData[this.selectedPointIx * 4 + 3] = 100.0;
    } else {
      this.updateSelect(x, y);
    }
    if (this.lineData) {
      this.lineInfo = this.gl.createOrUpdateFloat32TextureBuffer(this.lineData, this.lineInfo);
    }
    return this.selectedPointIx !== -1;
  }

  handleUp(x, y) {
    if (this.selectedPointIx !== -1) {
      this.handleTimeChanged(this.selectedPointIx, this.lineData[this.selectedPointIx * 4]);
    }
    this.mouseDownOnPoint = null;
    this.releaseControl();
    return false;
  }

  handleKey(x, y, up) {
    this.updateSelect(x, y);
    if (this.lineData) {
      this.lineInfo = this.gl.createOrUpdateFloat32TextureBuffer(this.lineData, this.lineInfo);
    }
    return false;
  }

  getXoffset(ix) {
    return this.lineData[ix * 4] / this.duration;
  }

  updateSelect(x, y) {
    const pointSize = 10.0;
    const xOffset = x;
    const xFactor = this.width * this.control.xScale;

    let minDist = pointSize;
    let selectedIx = -1;
    for (let ix = 0; ix < this.lineDataLength / 4; ix++) {
      let offsetX = this.getXoffset(ix);
      if (offsetX >= 0 && offsetX <= 1.0) {
        const sdx = (offsetX - xOffset) * xFactor;
        let dist = Math.abs(sdx);
        if (dist < minDist) {
          minDist = dist;
          selectedIx = ix;
        }
      }
    }

    if (selectedIx !== -1) {
      this.setCursor('ew-resize');
    } else {
      this.setCursor('');
    }

    this.mouseOverLine(this.selectedPointIx, selectedIx);

    this.selectedPointIx = selectedIx;
  }

  updateCanvas() {
    if (!this.isVisible) {
      return
    }

    let gl = this.gl;
    // this.shader = gl.checkUpdateShader(this, getVertexShader(), getFragmentShader());
    let shader = this.getShader();

    if (gl && shader && this.parentElement && this.lineDataLength > 0) {
      if (this.rc.updateShaderAndSize(this, shader, this.parentElement)) {
        if (shader.u.pointDataTexture) {
          gl.activeTexture(gl.TEXTURE3);
          gl.bindTexture(gl.TEXTURE_2D, this.lineInfo.texture);
          gl.uniform1i(shader.u.pointDataTexture, 3);
          gl.activeTexture(gl.TEXTURE0);
        }

        // TODO: standardize this for shaders
        shader.u.time?.set((performance.now() - this.perfStart) / 1000.0);
        shader.u.isSelected?.set(this.isSelected);
        shader.u.isFocused?.set(this.isFocused);

        shader.u.scale?.set(this.control.xScaleSmooth, this.control.yScaleSmooth);
        shader.u.position?.set(this.control.xOffsetSmooth, this.control.yOffsetSmooth);

        shader.u.duration?.set(this.duration);

        shader.u.beatsPerBar?.set(this.beatsPerBar);
        shader.u.timePerBeat?.set(this.timePerBeat);

        shader.a.vertexPosition.en();
        shader.a.vertexPosition.set(this.vertexBuffer, 1 /* elements per vertex */);
        gl.drawArrays(gl.TRIANGLES, 0, (this.lineDataLength / 4) * 6.0);
        shader.a.vertexPosition.dis();
        // gl.drawArrays(gl.TRIANGLES, 0, (this.lineDataLength / 4) * 6.0);
      }
    }
  }

}