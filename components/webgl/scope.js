import { BaseBinding } from "../../../KMN-varstack.js/vars/base.js";
import { FloatVar } from "../../../KMN-varstack.js/vars/float.js";
import { ComponentInfo, getElementHash, RectInfo, RenderControl, baseComponentShaderHeader, baseComponentShaderFooter } from "../../../KMN-varstack-browser/components/webgl/render-control.js";
import { StringVar } from "../../../KMN-varstack.js/vars/string.js";
import { SynthMixer } from "../../../KMN-gl-synth.js/webgl-synth-data.js";
import WebGLSynth from "../../../KMN-gl-synth.js/webgl-synth.js";
import { ComponentShaders } from "../../../KMN-varstack-browser/components/webgl/component-shaders.js";

export const scopeShaderHeader = baseComponentShaderHeader + /*glsl*/`
#define volumeScale 1.0
precision highp sampler2DArray;

uniform sampler2DArray sampleTextures0;
uniform sampler2DArray sampleTextures1;

uniform sampler2D rms_avg_eng_max_left;
uniform sampler2D rms_avg_eng_max_right;

vec4 getSample4Hist(float lineX,int historyCount) {
  int currentBuffer = int(value.y) / bufferHeight; // TODO: Check if bufferHeight is right here?
  int currentLine = (int(value.y) + historyCount + int(value.w) - int(value.z)) % int(value.w);
  currentLine = (currentLine + int(value.z)) % bufferHeight;
  if (int(value.x) == 0) {
    return texelFetch(sampleTextures0,
        ivec3(round(lineX * float(bufferWidth)),
              currentLine,
              currentBuffer), 0);
  } else {
    return texelFetch(sampleTextures1,
        ivec3(round(lineX * float(bufferWidth)),
              currentLine,
              currentBuffer), 0);
  }
}

vec4 getSample4(float lineX) {
  int currentBuffer = int(value.y) / bufferHeight; // TODO: Check if bufferHeight is right here?
  int currentLine = int(value.y) % bufferHeight;
  if (int(value.x) == 0) {
    return texelFetch(sampleTextures0,
        ivec3(round(lineX * float(bufferWidth)),
              currentLine,
              currentBuffer), 0);
  } else {
    return texelFetch(sampleTextures1,
        ivec3(round(lineX * float(bufferWidth)),
              currentLine,
              currentBuffer), 0);
  }
}
vec2 getSample(float lineX) {
  return getSample4(lineX).rg;
}

float getMax() {
  int bufferIx = int(value.y);
  if (int(value.x) != 0) {
    bufferIx += bufferHeight * bufferCount;
  }

  return
    max(  texelFetch(rms_avg_eng_max_left,
                     ivec2(bufferIx % bufferWidth,
                           bufferIx / bufferHeight), 0).w, // TODO: Check if bufferHeight is right here?
          texelFetch(rms_avg_eng_max_right,
                     ivec2(bufferIx % bufferWidth,
                           bufferIx / bufferHeight), 0).w);
}
mat2x4 getEnergy() {
  int bufferIx = int(value.y);
  if (int(value.x) != 0) {
    bufferIx += bufferHeight * bufferCount;
  }

  vec4 raemL = texelFetch(rms_avg_eng_max_left,
                          ivec2(bufferIx % bufferWidth,
                          bufferIx / bufferHeight), 0);
  vec4 raemR = texelFetch(rms_avg_eng_max_right,
                          ivec2(bufferIx % bufferWidth,
                          bufferIx / bufferHeight), 0);
  raemL.x = sqrt(raemL.x);
  raemR.x = sqrt(raemR.x);
  return mat2x4(raemL,raemR);
}
`;

const scopeShaderHeaderOutput = baseComponentShaderHeader + /*glsl*/`
#define volumeScale 1.0

precision highp sampler2DArray;

uniform sampler2DArray outputTexture;

vec2 getSample(float lineX) {
  return texelFetch(outputTexture,
      ivec3(round(lineX * float(bufferWidth)),
            0,
            0), 0).rg * 0.5;
}

float getMax() {
  return value.z;
}
mat2x4 getEnergy() {
  vec4 raem = vec4(value.z * 0.03, 0.0, value.z*0.01, value.z);
  return mat2x4(raem,raem);
}
`;
export class MixerScope {
  _controller = RenderControl.geInstance();

  /**
   * @param {HTMLElement} element
   */
  constructor(element) {
    this._element = element;
    this._clipElement = element.$getClippingParent();
  }

  /**
   *
   * @param {WebGLSynth} synth
   * @param {SynthMixer} mixer
   */
  setSynthMixer(synth, mixer, scopeShader = 'scope') {
    this.synth = synth;
    this.mixer = mixer;
    this.isOutput = mixer == null;
    this.scopeShader = scopeShader;

    const clipHash = getElementHash(this._clipElement) + ~~mixer?.mixerHash * 65535;
    this._componentInfo = this._controller.getComponentInfo(clipHash, scopeShader, this.updateComponentInfo.bind(this));
    this._componentInfo.getShader = this.handleGetShader.bind(this);
    this._scopeInfo = this._componentInfo.getFreeIndex(this.updateScopeInfo.bind(this))
  }

  handleGetShader() {
    return this.synth.getDefaultDefines() +
      (this.isOutput
        ? scopeShaderHeaderOutput
        : scopeShaderHeader) + ComponentShaders[this.scopeShader] + baseComponentShaderFooter;
  }

  /** @param {ComponentInfo} info */
  updateComponentInfo(info) {
    const webGLSynth = this.synth;
    if (webGLSynth) {
      let box = this._clipElement.getBoundingClientRect();
      info.clipRect.x      = box.x;
      info.clipRect.y      = box.y;
      info.clipRect.width  = this._clipElement.clientWidth;
      info.clipRect.height = this._clipElement.clientHeight;
    }
    info.onShaderInit = this.handleShaderInit;
  }

  /**
   * @param {import("../../../KMN-utils.js/webglutils.js").RenderingContextWithUtils} gl
   * @param {import("../../../KMN-utils.js/webglutils.js").WebGLProgramExt} shader
   */
  handleShaderInit = (gl,shader) => {
    const webGLSynth = this.synth;
    if (webGLSynth) {
      // TODO Use the same texture units for the same stuff, could be better and saves calls
      if (shader.u.sampleTextures0) {
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, webGLSynth.sampleTextures[0].texture);
        gl.uniform1i( shader.u.sampleTextures0, 4);
      }
      if (shader.u.sampleTextures0) {
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, webGLSynth.sampleTextures[1].texture);
        gl.uniform1i( shader.u.sampleTextures1, 5);
      }
      if (shader.u.outputTexture) {
        gl.activeTexture(gl.TEXTURE6);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, webGLSynth.outputTexture.texture);
        gl.uniform1i( shader.u.outputTexture, 6);
      }
      if (shader.u.rms_avg_eng_max_left) {
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, webGLSynth.rmsAvgBuffer.leftTex);
        gl.uniform1i( shader.u.rms_avg_eng_max_left, 7);
      }
      if (shader.u.rms_avg_eng_max_right) {
        gl.activeTexture(gl.TEXTURE8);
        gl.bindTexture(gl.TEXTURE_2D, webGLSynth.rmsAvgBuffer.rightTex);
        gl.uniform1i( shader.u.rms_avg_eng_max_right, 8);
      }
    }
  }

  /**@param {RectInfo} info */
  updateScopeInfo(info) {
    let box = this._element.getBoundingClientRect();

    const instrumentMixer = this.mixer;
    const webGLSynth = this.synth;
    if (this.isOutput || (instrumentMixer && instrumentMixer.buffers.length)) {
      info.rect.width  = box.width;
      info.rect.height = box.height;
      info.rect.x      = box.x;
      info.rect.y      = box.y;

      info.size.centerX = box.width / 2;
      info.size.centerY = box.height / 2;
      info.size.width   = box.width;
      info.size.height  = box.height

      if (this.isOutput){
        info.value[2] = webGLSynth.maxLevel;
      } else {
        const tli = instrumentMixer.buffers[instrumentMixer.buffers.length-1]
        // if (this._controller.drawCount% 16 == 0) {
        //   console.log('scope:',tli.passNr, tli.current)
        // }
        info.value[0] = tli.passNr % 2;
        info.value[1] = tli.current;
        info.value[2] = 1.0;
      }
    } else {
      info.rect.width  = 0;
      info.rect.height = 0;
    }
  }

  remove() {
    if (this._scopeInfo) {
      this._componentInfo.freeRectInfo(this._scopeInfo);
      this._scopeInfo = undefined;
    }
  }
}

// TODO: Change to make use of MixerScope
export class Scope extends BaseBinding {
  _controller = RenderControl.geInstance();

  /**
   * @param {StringVar} instrumentName
   * @param {HTMLElement} element
   * @param {string} [type]
   */
  constructor(instrumentName, element, type) {
    super(instrumentName)
    this._element = element;
    // this._scopeID = instrumentName.value
    // this._tli = trackLineInfo;
    this._clipElement = element.$getClippingParent();
    // TODO Remove this terrible construction, it does not work and depends on assumptions of synthcontroller in datamodel
    this.mainDataModel = instrumentName.$getMain();

    this.isOutput = this.baseVar.$v === '#output'
    const clipHash = getElementHash(this._clipElement);
    this._componentInfo = this._controller.getComponentInfo(clipHash, 'scope', this.updateComponentInfo.bind(this));
    this._componentInfo.getShader = this.handleGetShader.bind(this);
    this._sliderInfo = this._componentInfo.getFreeIndex(this.updateScopeInfo.bind(this))
  }

  handleGetShader() {
    return this.synthController.webGLSynth.getDefaultDefines() +
         (this.isOutput
         ? scopeShaderHeaderOutput
         : scopeShaderHeader) + ComponentShaders['scope'] + baseComponentShaderFooter;
  }

  /** @param {ComponentInfo} info */
  updateComponentInfo(info) {
    this.synthController = this.mainDataModel.synthController;
    const webGLSynth = this.synthController?.webGLSynth;
    if (webGLSynth) {
      let box = this._clipElement.getBoundingClientRect();
      info.clipRect.x      = box.x;
      info.clipRect.y      = box.y;
      info.clipRect.width  = this._clipElement.clientWidth;
      info.clipRect.height = this._clipElement.clientHeight;
    }
    info.onShaderInit = this.handleShaderInit;
  }

  /**
   * @param {import("../../../KMN-utils.js/webglutils.js").RenderingContextWithUtils} gl
   * @param {import("../../../KMN-utils.js/webglutils.js").WebGLProgramExt} shader
   */
  handleShaderInit = (gl,shader) => {
    const webGLSynth = this.synthController?.webGLSynth
    if (webGLSynth) {
      // TODO Use the same texture units for the same stuff, could be better and saves calls
      if (shader.u.sampleTextures0) {
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, webGLSynth.sampleTextures[0].texture);
        gl.uniform1i( shader.u.sampleTextures0, 4);
      }
      if (shader.u.sampleTextures0) {
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, webGLSynth.sampleTextures[1].texture);
        gl.uniform1i( shader.u.sampleTextures1, 5);
      }
      if (shader.u.outputTexture) {
        gl.activeTexture(gl.TEXTURE6);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, webGLSynth.outputTexture.texture);
        gl.uniform1i( shader.u.outputTexture, 6);
      }
      if (shader.u.rms_avg_eng_max_left) {
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, webGLSynth.rmsAvgBuffer.leftTex);
        gl.uniform1i( shader.u.rms_avg_eng_max_left, 7);
      }
      if (shader.u.rms_avg_eng_max_right) {
        gl.activeTexture(gl.TEXTURE8);
        gl.bindTexture(gl.TEXTURE_2D, webGLSynth.rmsAvgBuffer.rightTex);
        gl.uniform1i( shader.u.rms_avg_eng_max_right, 8);
      }
    }
  }

  /**@param {RectInfo} info */
  updateScopeInfo(info) {
    let box = this._element.getBoundingClientRect();
    this.synthController = this.mainDataModel.synthController;

    const instrumentController = this.synthController?.synthDataController.lastNamesForScope[this.baseVar.$v];
    const instrumentMixer = instrumentController?.postMixer || instrumentController?.preMixer;
    const webGLSynth = this.synthController?.webGLSynth
    if (this.isOutput || (instrumentMixer && instrumentMixer.buffers.length)) {
      info.rect.width  = box.width;
      info.rect.height = box.height;
      info.rect.x      = box.x;
      info.rect.y      = box.y;

      info.size.centerX = box.width / 2;
      info.size.centerY = box.height / 2;
      info.size.width   = box.width;
      info.size.height  = box.height

      if (this.isOutput){
        info.value[2] = webGLSynth.maxLevel;
      } else {
        const tli = instrumentMixer.buffers[instrumentMixer.buffers.length-1]
        // if (this._controller.drawCount% 16 == 0) {
        //   console.log('scope:',tli.passNr, tli.current)
        // }
        info.value[0] = tli.passNr % 2;
        info.value[1] = tli.current;
        info.value[2] = 1.0;
      }
    } else {
      info.rect.width  = 0;
      info.rect.height = 0;
    }
  }

  dispose() {
    if (this._sliderInfo) {
      this._componentInfo.freeRectInfo(this._sliderInfo);
      this._sliderInfo = undefined;
    }
  }
}

