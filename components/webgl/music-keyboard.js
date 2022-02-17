import { ComponentInfo, getElementHash, RectInfo, RectController, baseComponentShaderHeader } from "../../../KMN-varstack-browser/components/webgl/rect-controller.js";
import { PointerTracker } from "../../../KMN-utils-browser/pointer-tracker.js";
import { getKeyNr } from "./music-keyboard-sdr.js";
import { MusicInterface, NoteInterface } from "../../interfaces/music-interface.js";

const musicKeyboardShaderHeader = baseComponentShaderHeader + /*glsl*/`

uniform sampler2D pointDataTexture;

vec4 getNoteData(int noteNr) {
  return texelFetch(pointDataTexture, ivec2(noteNr, 0), 0);
}

`;

export class MusicKeyboard {
  _controller = RectController.geInstance();
  
  /**
   * @param {HTMLElement} element
   */
  constructor(element) {
    this._element = element;
    this._clipElement = element.$getClippingParent();

    const clipHash = getElementHash(this._clipElement);
    this._componentInfo = this._controller.getComponentInfo(clipHash, 'music-keyboard', this.updateComponentInfo.bind(this));
    this._keyboardInfo = this._componentInfo.getFreeIndex(this.updateKeyboardInfo.bind(this))

    this._pointerTracker = new PointerTracker(this._element);
    
    /** @type {MusicInterface} */
    this.music = null;
    this.lastNoteNr = -1;

    /** @type {Array<NoteInterface>} */
    this.notes = [];

    this.noteData = new Float32Array(4096);    
    this.noteTexture = null;
  }

  /** @param {ComponentInfo} info */
  updateComponentInfo(info) {
    let box = this._clipElement.getBoundingClientRect();
    info.clipRect.x = box.x;
    info.clipRect.y = box.y;
    info.clipRect.width = this._clipElement.clientWidth;
    info.clipRect.height = this._clipElement.clientHeight;
    info.shaderHeader = musicKeyboardShaderHeader;
    info.onShaderInit = this.handleShaderInit;
  }

  /**
   * @param {import("../../../KMN-utils.js/webglutils.js").RenderingContextWithUtils} gl 
   * @param {import("../../../KMN-utils.js/webglutils.js").WebGLProgramExt} shader 
   */
  handleShaderInit = (gl, shader) => {
    gl.activeTexture(gl.TEXTURE9);
    this.noteInfo = gl.createOrUpdateFloat32TextureBuffer(this.noteData, this.noteInfo);
    gl.bindTexture(gl.TEXTURE_2D, this.noteInfo.texture);
    gl.uniform1i(shader.u.pointDataTexture, 9);
  }

  /**@param {RectInfo} info */
  updateKeyboardInfo(info) {
    let box = this._element.getBoundingClientRect();

    info.rect.width = box.width;
    info.rect.height = box.height;
    info.rect.x = box.x;
    info.rect.y = box.y;

    info.size.centerX = box.width / 2;
    info.size.centerY = box.height / 2;
    info.size.width = box.width;
    info.size.height = box.height

    let pt = this._pointerTracker.getLastPrimary();
    info.mouse.x = ~~pt.currentX;
    info.mouse.y = ~~pt.currentY;
    info.mouse.state =
      (pt.isInside > 0 ? 1 : 0)
      + (pt.isDown > 0 ? 2 : 0);
    if (pt.isDown) {
      let noteNr = getKeyNr([
        pt.currentX / box.height * 3 / 5,
        pt.currentY / box.height]);
      if (noteNr >= 0) {
        if (noteNr !== this.lastNoteNr) {
          const time = this.music.getTime('none');//Date.now() / 1000.0;
          // if (this.notes[noteNr]) {
          //   this.notes[noteNr].release(time, 1.0);
          //   this.notes[noteNr] = null;
          // } else {
          //   this.notes[noteNr] = this.music.note(time, 'soft-kbd', 1, noteNr, 1);
          // }
          this.music.note(time, 'none', 1, noteNr, 1).release(time + 1.0,0);
          this.lastNoteNr = noteNr;
        }
      }
    } else {
      this.lastNoteNr = -1;
    }

    // info.value[2] = webGLSynth.maxLevel;
  }

  remove() {
    if (this._keyboardInfo) {
      this._componentInfo.freeRectInfo(this._keyboardInfo);
      this._keyboardInfo = undefined;
    }
  }
}

// What to show, only 1st mixdown of instrument? etc.
