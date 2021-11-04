import { animationFrame } from "../../KMN-utils-browser/animation-frame.js";
import PanZoomControl, { ControlHandlerBase } from "../../KMN-utils-browser/pan-zoom-control.js";
import getWebGLContext from "../../KMN-utils.js/webglutils.js";
// 0 1
// 2
// 2 1 3 4 
//   3   5

export class TimeLineBase extends ControlHandlerBase {
  constructor(options) {
    super();

    this.options = options;
    this.updateCanvasBound = this.updateCanvas.bind(this);
    this.width  = 10;
    this.height = 10;
    this.mouseDownOnPoint = null;
    this.beatsPerBar = 4;
    this.timePerBeat = 1.0;
    this.duration = 10.0;
    this.lineDataLength = 0;
    this.lineData = undefined;
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

    if (this.options.editable) {
      this.control.addHandler(this);
    }

    // this.shader = gl.checkUpdateShader(this, getVertexShader(), getFragmentShader());

    if (!this.options.noRequestAnimationFrame) {
      animationFrame(this.updateCanvasBound);
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
  
  handleDown(x,y) {
    this.updateSelect(x,y);
    if (this.selectedPointIx >= 0) {
      this.captureControl();
      this.mouseDownOnPoint = {x,y};
      this.mouseDownLineTime = this.lineData[this.selectedPointIx * 4];
      this.mouseDownOnLine(this.selectedPointIx);
      this.lineInfo = this.gl.createOrUpdateFloat32TextureBuffer(this.lineData, this.lineInfo);
      return true;
    }
    return this.selectedPointIx !== -1;
  }

  handleLeave(x, y) {
    this.releaseControl();
    this.updateSelect(-1,-1);
    this.lineInfo = this.gl.createOrUpdateFloat32TextureBuffer(this.lineData, this.lineInfo);
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
      this.updateSelect(x,y);
    }
    this.lineInfo = this.gl.createOrUpdateFloat32TextureBuffer(this.lineData, this.lineInfo);
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

  handleKey(x,y, up) {
    console.log('key', this.control.event);
    this.updateSelect(x,y);
    this.lineInfo = this.gl.createOrUpdateFloat32TextureBuffer(this.lineData, this.lineInfo);
    return false;
  }

  updateSelect(x,y) {
    const pointSize = 10.0;
    const cd = {
      xOffset: x,
      xFactor: this.width * this.control.xScale
    }

    let ofs = 0;
    let minDist = pointSize;
    let selectedIx = -1;
    while (ofs < this.lineDataLength) {
      const sdx = (this.lineData[ofs] / this.duration - cd.xOffset) * cd.xFactor;
      let dist = Math.abs(sdx);
      if (dist < minDist) {
        minDist = dist;
        selectedIx = ofs / 4;
      }
      ofs += 4;
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

        gl.drawArrays(gl.TRIANGLES, 0, (this.lineDataLength / 4) * 6.0);
      }
    }
    if (!this.options.noRequestAnimationFrame) {
      animationFrame(this.updateCanvasBound);
    }
  }

}