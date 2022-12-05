import { ControlHandlerBase, PanZoomBase } from "../../KMN-utils-browser/pan-zoom-control.js";
import defer from "../../KMN-utils.js/defer.js";
import { RenderingContextWithUtils } from "../../KMN-utils.js/webglutils.js";
import { RenderControl } from "../../KMN-varstack-browser/components/webgl/render-control.js";
import { ControlLineEditor } from "./control-line-editor.js";

const vertexSize = 4;

/**
 * @typedef {{time:number,value:number}} ControlLinePoint
 */

export class ControlLineData extends ControlHandlerBase {
  /**
   * @param {ControlLineEditor} owner
   * @param {*} gl
   * @param {PanZoomBase} control
   * @param {string} dataName
   * @param {number} colorIx
   */
  constructor(owner, gl, control, dataName, colorIx) {
    super();

    this.owner = owner;
    /** @type {RenderingContextWithUtils} */
    this.gl = gl;
    this.control = control;
    this.mouseDownOnPoint = null;
    this.onUpdatePointData = null;
    this.dataName = dataName;
    this.colorIx = colorIx;
    this.valueSnaps = [];

    /** @type {ControlLinePoint}*/
    this.startPoint = null;
    /** @type {ControlLinePoint}*/
    this.endPoint = null;
    this.vertex1stPointOffset = 0 * vertexSize;
    this.extraVertexPoints = 1;
    this.selectedLineIx = -1;
    this.selectedPointIx = -1;
    this.labelVar = null;

    this.pointsInvalidated = false;
    this.pointDataInvalidated = false;
    this.rc = RenderControl.geInstance();
  }

  dispose() {
    this.owner = null;
    this.mouseDownOnPoint = null;
    this.onUpdatePointData = null;
    this.gl.deleteFloat32TextureBuffer(this.pointInfo);
    this.pointData = null;
  }

  updateStateToOwner(activeSelect) {
    if (this.selectedLineIx >= 0 || this.selectedPointIx > 0) {
      this.owner._selectedControl = this;
      if (activeSelect) {
        this.owner.handleSelect();
      }
    } else {
      if (this.owner._selectedControl === this) {
        this.owner._selectedControl = null;
      }
    }
  }

  /**
   *
   * @param {ControlLinePoint[]} points
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

    this.pointsInvalidated = true;
  }


  /**
   *
   * @param {ControlLinePoint} startPoint
   * @param {ControlLinePoint} endPoint
   */
  setRange(startPoint, endPoint) {
    if (startPoint) {
      this.vertex1stPointOffset = 1 * vertexSize;
      this.extraVertexPoints = 2;
    } else {
      this.vertex1stPointOffset = 0 * vertexSize;
      this.extraVertexPoints = 1;
    }
    this.startPoint = startPoint;
    this.endPoint = endPoint;
    if (this.points?.length > 0) {
      this.startPoint.value = this.points[0].value;
      let endIx = this.points.length - 1;
      this.endPoint.value = this.points[endIx].value;;
    }
    this.pointsInvalidated = true;
  }

  updatePointData() {
    const gl = this.gl;
    let dataChanged = false;
    const requiredLength = Math.ceil((this.points.length + this.extraVertexPoints) * vertexSize / 4096) * 4096;
    if (!this.pointData || this.pointData.length < requiredLength) {
      this.pointData = new Float32Array(requiredLength);
      dataChanged = true;
    }

    const data = this.pointData;
    let ofs = 0;

    const addData = (time, value) => {
      if (data[ofs] !== time) dataChanged = true;
      data[ofs++] = time;
      if (data[ofs] !== value) dataChanged = true;
      data[ofs++] = value;
      ofs += 2;
    }

    if (this.startPoint) {
      let time = this.startPoint.time + this.timeOffset;
      addData(
        (time / this.owner.duration) * 2.0 - 1.0,
        (this.startPoint.value - this.minValue) / this.valueRange * 2.0 - 1.0);
    }

    for (const point of this.points) {
      let time = point.time + this.timeOffset;
      addData(
        (time / this.owner.duration) * 2.0 - 1.0,
        (point.value - this.minValue) / this.valueRange * 2.0 - 1.0);
    }

    let endPoint = this.endPoint;
    if (!endPoint) {
      let pl = this.points.length;
      if (pl > 0) {
        endPoint = this.points[pl - 1];
      } else {
        endPoint = { time: this.owner.duration, value: this.defaultValue }
      }
    }

    let time = endPoint.time + this.timeOffset;
    addData(
      (time / this.owner.duration) * 2.0 - 1.0,
      (endPoint.value - this.minValue) / this.valueRange * 2.0 - 1.0);

    this.pointDataInvalidated = dataChanged;
  }

  checkUpdate() {
    if (this.pointsInvalidated) {
      this.updatePointData();

      this.pointsInvalidated = false;
      if (this.owner.onUpdatePointData) {
        if (!this.owner.updateDefered) {
          this.owner.updateDefered = true;
          defer(this.owner.handlePointDataUpdatedBound);
        }
        this.pointsInvalidated = false;
      }
    }
  }

  updatePointDataTexture() {
    this.checkUpdate();
    if (this.pointDataInvalidated) {
      if (this.pointData) {
        this.pointInfo = this.gl.createOrUpdateFloat32TextureBuffer(this.pointData, this.pointInfo);
      }
      this.pointDataInvalidated = false;
    }
    return this.pointInfo != null;
  }

  createNewPoint(x, y) {
    let pa = this.points[this.selectedLineIx];
    let pb = this.points[this.selectedLineIx + 1];
    const lineX = this.selectedLineOffset;
    let newTime = (pa.time * (1.0 - lineX)) + lineX * pb.time;
    let newValue = (pa.value * (1.0 - lineX)) + lineX * pb.value;
    console.log('createNewPoint', newTime, newValue);
    this.points.splice(this.selectedLineIx + 1, 0, { time: newTime, value: newValue });
    this.pointsInvalidated = true;
    this.selectedPointIx = this.selectedLineIx + 1;
    this.selectedLineIx = -1;
    this.updateStateToOwner(true);
    this.owner.controlDataUpdate(this);
  }

  handleClick(x, y) {
    // if (this.selectedLineIx !== -1) {
    //   // Done in mouse down now
    //   // this.createNewPoint(x,y);
    //   let newClickTime = performance.now();
    //   // if (this.lastClickTime && ((newClickTime - this.lastClickTime) < 400)) {
    //     this.createNewPoint(x, y);
    //     // this.updatePointData();
    //   // }
    //   this.lastClickTime = newClickTime;
    // } else
    if (this.selectedPointIx !== -1) {
      // let newClickTime = performance.now();
      // Don't delete 1st or last point
      if (this.selectedPointIx !== 0 && this.selectedPointIx < this.points.length - 1) {
        // if (this.lastClickTime && ((newClickTime - this.lastClickTime) < 400)) {
          this.points.splice(this.selectedPointIx, 1);
          this.pointsInvalidated = true;
          this.owner.controlDataUpdate(this);
        // }
      }
      // this.lastClickTime = newClickTime;
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
    this.updateStateToOwner(true);
    if (this.selectedLineIx !== -1 && !this.control.event.altKey) {
      this.createNewPoint(x, y);
      this.updateSelect(x, y);
      // return true;
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
        if (this.selectedPointIx < this.points.length - this.extraVertexPoints) {
          this.mouseDownMaxTime = this.points[this.selectedPointIx + 1].time;
          this.valueSnaps.push(this.points[this.selectedPointIx + 1].value)
        }
        console.log(this.defaultValue, this.minValue, this.maxValue, this.valueSnaps);
        this.mouseDownTime = this.points[this.selectedPointIx].time;
        this.mouseDownValue = this.points[this.selectedPointIx].value;

        this.pointData[this.selectedPointIx * vertexSize + this.vertex1stPointOffset + 2] = 1.0;
      } else {
        if (this.control.event.altKey) {
          this.mouseDownValue = this.points[this.selectedLineIx].value;
          this.mouseDownValue2 = this.points[this.selectedLineIx + 1].value;
          const ofs = this.selectedLineIx * vertexSize + this.vertex1stPointOffset;
          this.pointData[ofs + 2] = 1.0;
          this.pointData[ofs + 6] = 1.0;
        }
      }
      this.pointDataInvalidated = true;
      return true;
    }
    return this.selectedPointIx !== -1 || this.selectedLineIx !== -1;
  }

  handleLeave(x, y) {
    this.releaseControl();
    this.blur();
    this.selectedLineIx = -1;
    this.selectedPointIx = -1;
    this.pointDataInvalidated = true;
  }

  updatePointValue(ix, value) {
    // console.log('value:',ix, this.points[ix].value, value);
    if (this.points[ix].value !== value) {
      const vertexValue = (value - this.minValue) / this.valueRange * 2.0 - 1.0;
      if (ix === 0 && this.startPoint) {
        this.startPoint.value = value;
        this.pointData[1] = vertexValue;
      }
      let endIx = this.points.length - 1;
      if (ix === endIx && this.endPoint) {
        this.endPoint.value = value;
        const ofs = (endIx + this.extraVertexPoints-1) * vertexSize + this.vertex1stPointOffset;
        this.pointData[ofs + 1] = vertexValue;
      }
      this.points[ix].value = value;
      this.pointsChanged = true;
      const ofs = ix * vertexSize + this.vertex1stPointOffset;
      this.pointData[ofs + 1] = vertexValue;
      this.pointsInvalidated = true;
    }
  }

  updatePointTime(ix, time) {
    // console.log('time:',ix, this.points[ix].value, time);
    if (this.points[ix].time !== time) {
      this.points[ix].time = time;
      this.pointsChanged = true;
      const ofs = ix * vertexSize + this.vertex1stPointOffset;
      this.pointData[ofs] = ((time + this.timeOffset) / this.owner.duration) * 2.0 - 1.0;
      this.pointsInvalidated = true;
    }
  }

  handleMove(x, y) {
    if (this.mouseDownOnPoint) {
      let dx = this.mouseDownOnPoint.x - x;
      let dy = this.mouseDownOnPoint.y - y;
      if (this.control.event.altKey && this.selectedLineIx !== -1) {

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

        const ofs = this.selectedLineIx * vertexSize + this.vertex1stPointOffset;
        this.pointData[ofs + 2] = 1.0;
        this.pointData[ofs + 3] = 2.0;
        this.pointData[ofs + 6] = 1.0;
        this.pointDataInvalidated = true;
      } else {
        if (this.selectedPointIx === 0 || this.selectedPointIx >= this.points.length) {
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

        this.pointDataInvalidated = true;
        const ofs = this.selectedPointIx * vertexSize + this.vertex1stPointOffset;
        this.pointData[ofs + 2] = 1.0;
      }
    } else {
      this.updateSelect(x, y);
    }
    this.pointDataInvalidated = true;
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
    this.pointDataInvalidated = true;
    return false;
  }
  updateSelect(x, y) {
    this.checkUpdate();
    const pointSize = 10.0;
    if (!this.points) {
      this.selectedLineIx = -1;
      this.selectedPointIx = -1;
      this.updateStateToOwner(false);
      return;
    }

    const cd = {
      xOffset: x * 2.0 - 1.0,
      yOffset: y * 2.0 - 1.0,
      xFactor: this.owner.width * this.control.xScale / 2.0,
      yFactor: this.owner.height * this.control.yScale / 2.0
    }

    let ofs = this.vertex1stPointOffset;
    let minDist = pointSize * 2.0;
    let selectedIx = -1;
    let lineIx = -1;
    let lastSdx = 0.0;
    const maxOfs = this.points.length * vertexSize + this.vertex1stPointOffset;
    while (ofs < maxOfs) {
      const sdx = (this.pointData[ofs] - cd.xOffset) * cd.xFactor;
      const dx = Math.abs(sdx);
      if (dx < pointSize) {
        const dy = Math.abs(this.pointData[ofs + 1] - cd.yOffset) * cd.yFactor;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          minDist = dist;
          selectedIx = (ofs - this.vertex1stPointOffset) / vertexSize;
        }
      }
      if (lastSdx < 0.0 && sdx > 0.0) {
        lineIx = (ofs - this.vertex1stPointOffset) / vertexSize;
      }
      this.pointData[ofs + 2] = 0.0;
      this.pointData[ofs + 3] = 0.0;
      lastSdx = sdx;
      ofs += vertexSize;
    }
    this.selectedLineIx = -1;
    if (selectedIx !== -1) {
      this.pointData[selectedIx * vertexSize + this.vertex1stPointOffset + 2] = 1.0;
      this.setCursor('move');
    } else {
      this.setCursor('');
      if (lineIx >= 1) {
        let lineStartIx = lineIx - 1;
        const ofsa = lineStartIx * vertexSize + this.vertex1stPointOffset;
        let pax = this.pointData[ofsa];
        let pay = this.pointData[ofsa + 1];
        const ofsb = lineIx * vertexSize + this.vertex1stPointOffset;
        let pbx = this.pointData[ofsb];
        let pby = this.pointData[ofsb + 1];
        let lineX = (cd.xOffset - pax) / (pbx - pax);
        let yVal = (pay * (1.0 - lineX)) + lineX * pby;
        if (Math.abs(yVal - cd.yOffset) * cd.yFactor < pointSize) {
          this.selectedLineIx = lineIx - 1;
          this.selectedLineOffset = lineX;
          if (!this.control.event.altKey) {
            this.setCursor('move');
          } else {
            this.setCursor('ns-resize');
            lineX = 2.0;
          }
          this.pointData[this.selectedLineIx * vertexSize + this.vertex1stPointOffset + 3] = lineX;
        }
      }
    }
    this.selectedPointIx = selectedIx;
    this.updateStateToOwner()
  }
}
