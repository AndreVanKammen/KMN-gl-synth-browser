import { ComponentInfo, getElementHash, RectInfo, RectController, baseComponentShaderHeader, baseComponentShaderFooter } from "../../../KMN-varstack-browser/components/webgl/rect-controller.js";
import { PointerTracker } from "../../../KMN-utils-browser/pointer-tracker.js";
import { getKeyNr } from "./music-keyboard-sdr.js";
import { MusicInterface, NoteInterface } from "../../interfaces/music-interface.js";
import { ComponentShaders } from "../../../KMN-varstack-browser/components/webgl/component-shaders.js";

const musicKeyboardShader = baseComponentShaderHeader + /*glsl*/`

uniform sampler2D pointDataTexture;

vec4 getNoteData(int noteNr) {
  return texelFetch(pointDataTexture, ivec2(noteNr, 0), 0);
}

vec2 getKeyDist(vec2 uv, out vec2 keyX, out int keyNr) {
  vec2 loc = mod(uv,1.0); // Coordinate for one octave

  // slightly scale black up and shift left and right half
  float blackScaledX = loc.x * 0.89 + 0.123 + sign(loc.x-3./7.) * 0.025;

  // calculate key coordinates
  keyX = mod(vec2(loc.x,blackScaledX),1.0/7.0)*7.0;
  vec4 keyCoord = vec4( vec2(abs(keyX-0.5)),
                        vec2(1.0-loc.y));

  // calculate distance field  x-white x-black y-white y-black
  vec4 keysHV = smoothstep( vec4( 0.45,   0.2,    0.02,   0.36),
                            vec4( 0.47,   0.3,    0.03,   0.42), keyCoord);

  // Combine the distance fields
  vec2 keyDist = min(1.0 - keysHV.xy, keysHV.zw);

  // leave out black keys nr 0, 3 and 7
  float blackKeyNr = blackScaledX * 7.0 - keyX.y;
  keyDist.y *= float(all(greaterThan(abs(vec3(blackKeyNr) - vec3(0.0, 3.0, 7.0)), vec3(.01))));

  // Substract black key from white key /
  keyDist.x = min(keyDist.x, 1.0-smoothstep(0.0,0.05,keyDist.y));

  keyNr = int(uv.x) * 12;
  if (keyDist.y > 0.5) {
    if (blackKeyNr <3.0) {
      keyNr += 1 + int(floor(blackKeyNr-1.0)) * 2;
    } else {
      keyNr += int(floor(blackKeyNr)) * 2 - 2;
    }
  } else {
    if (keyDist.x > 0.5) {
      int whiteKeyNr = int(loc.x * 7.0);
      if (whiteKeyNr < 3) {
        keyNr += whiteKeyNr * 2;
      } else {
        keyNr += whiteKeyNr * 2 - 1;
      }
    } else {
      keyNr = -1;
    }
  }

  return keyDist;
}

const vec2 aspect = vec2(3.0/5.0,1.0);

vec4 renderComponent(vec2 center, vec2 size) {
  // Normalized pixel coordinates (Y from 0 to 1, X to aspect ratio)
  vec2 uv = localCoord / size.y * aspect;
  vec2 loc = mod(uv,1.0); // Coordinate for one octave

  int keyNr;
  int mouseKeyNr;
  vec2 keyX;

  getKeyDist(mouse.xy / size.y * aspect, keyX, mouseKeyNr);

  // calculate key coordinates
  vec2 keyDist = getKeyDist(uv, keyX, keyNr);
  // calculate grayscale
  vec3 col = vec3( keyDist.x * 0.95 + // white key
                   0.5 * keyDist.y * smoothstep(0.5,1.0,loc.y+keyX.y)); // black key,
  if (keyNr!=-1) {
    if ((keyNr==mouseKeyNr) && (mouse.x>0.0) && (mouse.z>0.0)) {
      col += vec3(0.0,0.0,0.6);
      col *= 0.8+sin(float(drawCount)*0.1)*0.1;
      // keyDist *= 0.8;
    }
    vec4 noteData = getNoteData(keyNr);
    if (noteData.w > 0.0 && noteData.w * size.y > localCoord.y) {
      col = noteData.rgb;
    }
  }

  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
` + baseComponentShaderFooter;


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
    this._componentInfo.getShader = this.handleGetShader.bind(this);
    this._componentInfo.onShaderInit = this.handleShaderInit;
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
  }

  handleGetShader() {
    return musicKeyboardShader;
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
          this.music.note(time, 'none', 1, noteNr, 1)?.release(time + 1.0,0);
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
