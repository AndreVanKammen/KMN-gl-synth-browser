import { SynthMixer } from "../../../KMN-gl-synth.js/webgl-synth-data.js";
import WebGLSynth from "../../../KMN-gl-synth.js/webgl-synth.js";
import { ComponentInfo, getElementHash, RectController, RectInfo } from "../../../KMN-varstack-browser/components/webgl/rect-controller.js";
import { getFrequencyForNote, getVolumeForFrequency } from "../../urils/frequency-utils.js";
import { scopeShaderHeader } from "./scope.js";

// TODO: Change to make use of MixerScope(Base)
export class MixerFrequencyAnalyzer {
  _controller = RectController.geInstance();
  
  /** 
   * @param {HTMLElement} element
   */
  constructor(element) {
    this._element = element;
    this._clipElement = element.$getClippingParent();

    this.bufferNr = 0;
  }

  /**
   * 
   * @param {WebGLSynth} synth
   * @param {SynthMixer} mixer 
   */
  setSynthMixer(synth, mixer, bufferNr) {
    this.synth = synth;
    this.mixer = mixer;
    this.isOutput = mixer == null;

    const clipHash = getElementHash(this._clipElement) + ~~mixer?.mixerHash * 65535;
    this._componentInfo = this._controller.getComponentInfo(clipHash, 'frequencyAnalyzer', this.updateComponentInfo.bind(this));
    this._scopeInfo = this._componentInfo.getFreeIndex(this.updateScopeInfo.bind(this))

    this.bufferNr = bufferNr;

    this.loudnessMap = new Float32Array(synth.bufferWidth * 8);
    const noteDivider = synth.bufferWidth / 128;
    for (let ix = 0; ix < synth.bufferWidth; ix++) {
      const frequency = getFrequencyForNote(ix / noteDivider);
      const volume = getVolumeForFrequency(frequency);
      this.loudnessMap[ix * 4] = volume;
    }
    this.loudnessInfo = synth.gl.createOrUpdateFloat32TextureBuffer(this.loudnessMap, this.loudnessInfo);
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
      info.shaderHeader =
        webGLSynth.getDefaultDefines()  + scopeShaderHeader + `
uniform sampler2D loudnessTexture;\n
vec4 getLoudnesDataData(int pos) {
  return texelFetch(loudnessTexture, ivec2(pos % 1024, pos / 1024), 0);
}
`;
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
      if (shader.u.loudnessTexture) {
        gl.activeTexture(gl.TEXTURE9);
        gl.bindTexture(gl.TEXTURE_2D, this.loudnessInfo.texture);
        gl.uniform1i( shader.u.loudnessTexture, 9);
      }
    }
  }

  /**@param {RectInfo} info */
  updateScopeInfo(info) {
    let box = this._element.getBoundingClientRect();

    const instrumentMixer = this.mixer;
    const webGLSynth = this.synth;
    if (this.isOutput || (instrumentMixer && this.bufferNr < instrumentMixer.buffers.length)) {
      info.rect.width  = box.width;
      info.rect.height = box.height;
      info.rect.x      = box.x;
      info.rect.y      = box.y;
  
      info.size.centerX = box.width / 2;
      info.size.centerY = box.height / 2;
      info.size.width   = box.width;
      info.size.height  = box.height
  
      const tli = instrumentMixer.buffers[this.bufferNr];
      info.value[0] = tli.passNr % 2;
      info.value[1] = tli.current;
      info.value[2] = 1.0;
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

