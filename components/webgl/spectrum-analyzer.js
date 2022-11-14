import { SynthMixer } from "../../../KMN-gl-synth.js/webgl-synth-data.js";
import WebGLSynth from "../../../KMN-gl-synth.js/webgl-synth.js";
import { baseComponentShaderFooter, ComponentInfo, getElementHash, RenderControl, RectInfo } from "../../../KMN-varstack-browser/components/webgl/render-control.js";
import { getLogFloatLoudnessMap, getFrequencyForNote, getVolumeForFrequency, getLinearFloatLoudnessMap } from "../../../KMN-gl-synth.js/frequency-utils.js";
import { getScopeShaderHeader } from "./scope.js";

// "spectrumAnalyzer_analyzer":/*glsl*/`
// const float log10 = 1.0 / log(10.0);

// vec4 renderComponent(vec2 center, vec2 size) {
//   vec2 lineClr = vec2(0.0);
//   for (int ix = -133; ix <= 0; ix++) {
//     float lineX = (localCoord.x / size.x);
//     float n = fract(lineX * 128.0);
//     // if (mod(value.y+ float(ix),2.0) >0.99) {
//     //   n = 1.0-n;
//     // }
//     float scale1 = (float(136+ix) - n)/136.0;
//     float scale = pow(scale1,2.0);

//     // float lineX = (localCoord.x / size.x) / 2.0 + 0.25;// zoom
//     lineX = lineX / scale - 0.5 * (1.0-scale);// * scale + 0.5 * (1.0-scale);
//     //float lineX = (localCoord.x / size.x);
//     vec4 fftValue = getSample4Hist(lineX, ix);
//     vec2 sampleValue = vec2(length(fftValue.rg), length(fftValue.ba));
//     if (ix == 0) {
//       vec4 fftValue1 = getSample4Hist(lineX, ix - 1);
//       vec2 sampleValue1 = vec2(length(fftValue1.rg), length(fftValue1.ba));
//       sampleValue = mix(sampleValue1, sampleValue, n);
//       scale1 = (float(136+ix))/136.0;
//       scale = pow(scale1,2.0);
//     }

//     // sampleValue.xy = vec2(sampleValue.x + sampleValue.y) * 0.5; // Mono
//     float dBRange = 115.0 - getLoudnesDataData(int(floor(lineX * float(bufferWidth)))).x;
//     // dBRange *= 0.8;
//     // sampleValue = (dBRange + (20.0 * log10 * log(0.000001 + sampleValue) )) / dBRange * 0.3;
//     sampleValue *= pow(10.0,dBRange / 30.0) * 0.07;
//     sampleValue = clamp(sampleValue, 0.0, 1.0) * scale1;
//     vec2 dist = vec2(size.y * scale - localCoord.y) - sampleValue * size.y;// + sign(sampleValue));
//     vec2 lineThickness = pow(sampleValue.xy,vec2(0.3))*size.y * 0.02;
//     if (ix!=0) {
//       dist = abs(dist);
//     } else {
//       lineThickness = vec2(1.0);
//     }
//     lineClr += (1.0-smoothstep(0.7*lineThickness,lineThickness,dist)) * vec2(1.75 / float(-ix + 1)) * (0.2+7.0*sampleValue);
//   }
//   vec3 returnClr = clamp(vec3(lineClr, lineClr.x), 0.0, 1.0);
//   float alpha = smoothstep(0.01, 0.03, max(returnClr.r,max(returnClr.g,returnClr.b))) * opacity;
//   return vec4(pow(returnClr,vec3(1.0/2.1)), alpha);
// }`,
// "spectrumAnalyzer_3D":/*glsl*/`
// const float log10 = 1.0 / log(10.0);

// vec4 renderComponent(vec2 center, vec2 size) {
//   vec3 lineClr = vec3(0.0);
//   for (int ix = -53; ix <= 0; ix++) {
//     float lineX = (localCoord.x / size.x);
//     float scale1 = float(56+ix)/56.2;
//     float scale = pow(scale1,2.0);
//     float scaleLine = pow(scale1,0.5);

//     lineX = lineX * scaleLine + 0.5 * (1.0 - scaleLine);// * scale + 0.5 * (1.0-scale);
//     vec4 fftValue = getSample4Hist(lineX, ix);
//     vec2 sampleValue = vec2(length(fftValue.rg), length(fftValue.ba));

//     float dBRange = 115.0 - getLoudnesDataData(int(floor(lineX * float(bufferWidth)))).x;
//     float multiplier = pow(10.0,dBRange / 30.0) * 0.04;
//     sampleValue *= multiplier;
//     sampleValue = clamp(sampleValue, 0.0, 1.0) * scale1;
//     vec2 dist = vec2(size.y * scale - localCoord.y) - sampleValue * size.y;// + sign(sampleValue));
//     vec2 lineThickness = pow(sampleValue.xy,vec2(0.3))*size.y * 0.02 - float(ix)*0.4;
//     if (ix!=0) {
//       dist = abs(dist);
//     } else {
//       lineThickness = vec2(1.0);
//     }
//     vec2 line = (1.0-smoothstep(0.7*lineThickness,lineThickness,dist)) * vec2(1.75 / float(-ix + 1)) * (0.2+7.0*sampleValue);
//     lineClr.xy += line;
//     lineClr.z += (fftValue.x + fftValue.z) * multiplier * max(line.x,line.y) * 18.0;
//   }
//   vec3 returnClr = clamp(lineClr, 0.0, 1.0);
//   float alpha = smoothstep(0.01, 0.03, max(returnClr.r,max(returnClr.g,returnClr.b))) * opacity;
//   return vec4(pow(returnClr,vec3(1.0/2.1)), alpha);
// }`,
// "spectrumAnalyzer2Danalyze":/*glsl*/`
// const float log10 = 1.0 / log(10.0);

// vec4 renderComponent(vec2 center, vec2 size) {
//   float lineX = (localCoord.x / size.x);
//   float lineY = localCoord.y / 8.0;
//   float historyY = fract(lineY);
//   float historyX = fract(lineX * 256.0+0.5);
//   lineX = lineX - historyX/256.0 + (historyY/256.0);

//   vec4 fftValue1 = getSample4Hist(lineX, int(-floor(lineY)));
//   vec4 fftValue2 = getSample4Hist(lineX+ 1.0/256.0, int(-floor(lineY)));
//   vec2 sampleValue1 = vec2(length(fftValue1.rg), length(fftValue1.ba));
//   vec2 sampleValue2 = vec2(length(fftValue2.rg), length(fftValue2.ba));

//   vec2 sampleValue = mix(sampleValue1,sampleValue2,historyX);
//   sampleValue.xy = vec2(sampleValue.x + sampleValue.y) * 0.5; // Mono
//   float dBRange = 115.0 - getLoudnesDataData(int(floor(lineX * float(bufferWidth)))).x;
//   float multiplier = pow(10.0,dBRange / 30.0) * 0.1;
//   sampleValue *= multiplier;
//   vec3 lineClr = vec3(sampleValue.xy, max(sampleValue.x,sampleValue.y));
//   vec3 returnClr = clamp(lineClr, 0.0, 1.0);
//   float alpha = smoothstep(0.01, 0.03, max(returnClr.r,max(returnClr.g,returnClr.b))) * opacity;
//   return vec4(pow(returnClr,vec3(1.0/2.1)), alpha);
// }`,
// "spectrumAnalyzer":/*glsl*/`
const spectrumAnalyzerShader = /*glsl*/`

uniform sampler2D loudnessTexture;\n
uniform float opacity;\n
vec4 getLoudnesDataData(int pos) {
  return texelFetch(loudnessTexture, ivec2(pos % 1024, pos / 1024), 0);
}

const float log10 = 1.0 / log(10.0);

vec4 renderComponent(vec2 center, vec2 size) {
  float lineX = (localCoord.x / size.x);
  float lineY = (localCoord.y / size.y) * value.w;
  vec4 fftValue = getSample4Hist(lineX, int(-floor(lineY)));
  vec2 sampleValue = vec2(length(fftValue.rg), length(fftValue.ba));
  // sampleValue.xy = vec2(sampleValue.x + sampleValue.y) * 0.5; // Mono
  float dBRange = 115.0 - getLoudnesDataData(int(floor(lineX * float(bufferWidth)))).x;
  float multiplier = pow(10.0,dBRange / 30.0) * 0.1;
  sampleValue *= multiplier;
  vec3 lineClr = vec3(sampleValue.xy, 0.5*(min(sampleValue.x,sampleValue.y)+max(sampleValue.x,sampleValue.y)));
  vec3 returnClr = clamp(lineClr, 0.0, 1.0);
  float alpha = smoothstep(0.01, 0.03, max(returnClr.r,max(returnClr.g,returnClr.b))) * opacity;
  return vec4(pow(returnClr,vec3(1.0/2.1)), alpha);
}` + baseComponentShaderFooter;

// TODO: Change to make use of MixerScope(Base)
export class SpectrumAnalyzer {
  _controller = RenderControl.geInstance();

  /**
   * @param {HTMLElement} element
   */
  constructor(element) {
    this._element = element;
    this._clipElement = element.$getClippingParent();

    this.bufferNr = 0;
    this.opacity = 1.0;
    //this.opacity = 0.7;
  }

  /**
   * @param {WebGLSynth} synth
   * @param {SynthMixer} mixer
   * @param {number} bufferNr
   * @param {boolean} isLog
   */
  setSynthMixer(synth, mixer, bufferNr, isLog) {
    this.synth = synth;
    this.mixer = mixer;
    this.isOutput = mixer == null;

    if (!this._componentInfo) {
      const clipHash = getElementHash(this._clipElement) + ~~mixer?.mixerHash * 65535;
      this._componentInfo = this._controller.getComponentInfo(clipHash, 'spectrumAnalyzer', this.updateComponentInfo.bind(this));
      this._componentInfo.getShader = this.handleGetShader.bind(this);
      this._componentInfo.onShaderInit = this.handleShaderInit;
      this._scopeInfo = this._componentInfo.getFreeIndex(this.updateScopeInfo.bind(this))
    }

    this.bufferNr = bufferNr;

    if (isLog) {
      this.loudnessMap = getLogFloatLoudnessMap(synth.bufferWidth);
    } else {
      this.loudnessMap = getLinearFloatLoudnessMap(synth.bufferWidth);
    }
    this.loudnessInfo = synth.gl.createOrUpdateFloat32TextureBuffer(this.loudnessMap, this.loudnessInfo);
  }

  handleGetShader() {
    return this.synth.getDefaultDefines() + getScopeShaderHeader(this._controller.shaderOptions) + spectrumAnalyzerShader;
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
      if (shader.u.opacity) {
        shader.u.opacity.set(this.opacity);
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
      info.value[2] = tli.start;
      info.value[3] = tli.count;
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

