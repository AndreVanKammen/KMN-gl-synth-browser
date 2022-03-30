import WebGLSynth from "../../KMN-gl-synth.js/webgl-synth.js";
import PanZoomControl, { ControlHandlerBase } from "../../KMN-utils-browser/pan-zoom-control.js";
import { RectController } from "../../KMN-varstack-browser/components/webgl/rect-controller.js";

const levelsOfDetail = 32;

function getVertexShader(options) {
  return /*glsl*/`
    in vec2 vertexPosition;
    out vec2 textureCoord;
    flat out float fragmentsPerPixel;
    
    uniform float durationInFragments;
    uniform vec2 scale;
    uniform vec2 position;
    uniform vec2 windowSize;
    uniform float dpr;

    void main(void) {
      vec2 pos = vertexPosition.xy * (1. + 8.0 / windowSize / scale);
      textureCoord = (pos + 1.0) * 0.5;
      // Never draw outside the pan zoom area, viewport will handle textureCoord outside
      pos = (pos - position * 2.0 + 1.0) * scale - 1.0;
      fragmentsPerPixel = durationInFragments / (scale.x * windowSize.x);
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

  in vec2 textureCoord;
  flat in float fragmentsPerPixel;
  out vec4 fragColor;

  uniform vec2 scale;
  uniform int offset;

  uniform float durationInFragments;
  uniform bool showMaxOnly;

  uniform vec2 windowSize;

  uniform int[${levelsOfDetail}] LODOffsets;
  uniform float LODLevel;

  uniform vec4 maxColor;
  uniform vec4 rmsColor;
  uniform vec4 engColor;
  
  uniform vec3 preScale;
  uniform vec3 quadraticCurve;
  uniform vec3 linearDbMix;
  uniform vec3 dBRange;

  uniform float opacity;

  uniform sampler2D analyzeTexturesLeft;
  uniform sampler2D analyzeTexturesRight;
  
  const float log10 = 1.0 / log(10.0);

  vec3 getDataIX0(int ix, int LODLevel) {
    ivec2 point = ivec2(ix % bufferWidth, ix / bufferWidth);
    vec4 result = (textureCoord.y < 0.5) && !showMaxOnly //(fragmentsPerPixel>0.03)
                ? texelFetch(analyzeTexturesLeft,  point, 0)
                : texelFetch(analyzeTexturesRight,  point, 0);
    return result.wxz;
  }

  vec3 getDataIX1(float ix_in, int LODLevel) {
    int divider = int(pow(2.0, float(LODLevel)));
    int LODOffset = LODOffsets[LODLevel];
    int maxLODOffset = LODOffsets[LODLevel+1];
    int len = maxLODOffset - LODOffset - 2;
    int ofs = LODOffset + offset / divider;
    float ix = float(LODOffset) + ix_in / float(divider);

    if (ix < float(ofs) || ix>= float(ofs + len)) {
      return vec3(0.0);
    }

    vec3 low = getDataIX0(int(floor(ix)), LODLevel);
    vec3 high = getDataIX0(int(ceil(ix)), LODLevel);
     
    return mix(low,high,fract(ix * float(!showMaxOnly)));
  }

  vec3 getDataIX(float ix_in, float LODLevel) {
    // LODLevel = 0.0;
    vec3 low = getDataIX1(ix_in, int(floor(LODLevel)));
    vec3 high = getDataIX1(ix_in, int(ceil(LODLevel)));
    return mix(low,high,fract(LODLevel));
  }

  vec3 mixDataIX(float ix) {
    int startIx = int(floor(ix));
    int stopIx = int(ceil(ix));
    
    vec3 result = getDataIX(ix, clamp(log2(0.5+fragmentsPerPixel*(1.0+LODLevel)),0.01,float(${levelsOfDetail})));
    result.z *= 4.0;
    if (!showMaxOnly) {
      result = result / preScale;
      vec3 resultDB = clamp(
        (dBRange + (20.0 * log10 * log(0.000001 + result)   )) / dBRange,
         0.0, 1.0);
      result = mix(result, resultDB, linearDbMix);
      result = pow(result,quadraticCurve);
    } else {
      result.yz *= 0.0;
    }
    return result;
  }

  void main(void) {
    float delta = (textureCoord.x * durationInFragments);

    float readOffset = float(offset) + delta;
    
    float fragmentsPerPixel = durationInFragments / (scale.x * float(windowSize.x));
    vec3 data1 = mixDataIX(readOffset);
    vec2 px = vec2(1.0) / vec2(windowSize) / scale;

    vec3 dist = clamp(data1,0.0,1.0);
    dist = smoothstep(
      dist - vec3(px.y),
      dist + vec3(px.y), 
      abs(vec3(1.0 - 2.0 * textureCoord.y)));
    vec3 d = 1.0 - dist;

    vec4 clr = d.r * maxColor;
    clr = mix(clr, rmsColor, rmsColor.a * d.g);
    clr = mix(clr, engColor, engColor.a * d.b);
    // float a = max(max(clr.r,clr.g),clr.b) * opacity;
    fragColor = vec4(clamp(clr.rgb, 0.0,1.0) ,clr.a * opacity);
    if (textureCoord.y<0.0) {
      fragColor *= 0.0;
    }
  }
  `
}

export class AudioView extends ControlHandlerBase {
  constructor(options) {
    super();
    this.options = options;

    this.updateCanvasBound = this.updateCanvas.bind(this);
    this.dataOffset = 0;
    this.durationInFragments = 1000;
    this.onGetPlayPos = (sender) => -1;

    this.preScaleMax = 1.0;
    this.preScaleRMS = 1.0;
    this.preScaleEng = 1.0;
    this.quadraticCurveMax = 1.0;
    this.quadraticCurveRMS = 1.0;
    this.quadraticCurveEng = 1.0;
    this.linearDbMixMax = 0.0;
    this.linearDbMixRMS = 0.0;
    this.linearDbMixEng = 0.0;
    this.dBRangeMax = 90.0;
    this.dBRangeRMS = 90.0;
    this.dBRangeEng = 90.0;
    this.levelOfDetail = 2.7;
    this.opacity = 1.0
    this.showBeats = false;
    this.showMaxOnly = false;
    this.getFragmentShaderBound = this.getFragmentShader.bind(this);
    this.getVertexShaderBound = this.getVertexShader.bind(this);

    this.rekordBoxColors = false;
  }

  get rekordBoxColors() {
    return this._rekordBoxColors;
  }

  set rekordBoxColors(x) {
    this._rekordBoxColors = x;
    if (this._rekordBoxColors) {
      this.maxColor = [0, 83.0 / 255.0, 225.0 / 255.0, 1.0];
      this.rmsColor = [179.0 / 255.0, 102.0 / 255.0, 7.0 / 255.0, 1.0];
      this.engColor = [245.0 / 255.0, 235.0 / 255.0, 215.0 / 255.0, 1.0];
    } else {
      this.maxColor = [1, 0, 0, 0.8];
      this.rmsColor = [0, 1, 0, 0.8];
      this.engColor = [0, 0, 1, 0.8];
    }
  }

  /**
   * @param {HTMLElement} parentElement
   */
  initializeDOM(parentElement) {
    this.parentElement = parentElement;

    this.canvas = this.options.canvas || this.parentElement.$el({tag:'canvas', cls:'analyzerCanvas'});
    
    /** @type {PanZoomControl} */
    this.control = this.options.control || new PanZoomControl(this.parentElement, {
      minYScale: 1.0,
      maxYScale: 1.0,
      minXScale: 1.0,
      maxXScale: 1000.0
    });

    this.control.addHandler(this);
  }

  /**
   * @param {WebGLSynth} synth 
   */
  setSynth(synth) {
    this.synth = synth;
    const gl = this.gl = synth.gl;

    // Create two triangles to form a square that covers the whole canvas
    const basic2triangles = [
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
      1, -1];
    this.vertexBuffer = gl.updateOrCreateFloatArray(0, basic2triangles);
    // gl.checkUpdateShader('audio-view', getVertexShader(), this.webglSynth.getDefaultDefines() + getFragmentShader());

    if (this.options.canvasRoutine) {
      this.canvasRoutine = this.options.canvasRoutine;
    } else {
      this.canvasRoutine = RectController.geInstance().registerCanvasUpdate('audio-view', this.updateCanvasBound, this.parentElement);
    }

    this.viewTexture0 = { bufferWidth: this.synth.bufferWidth };
    this.viewTexture1 = { bufferWidth: this.synth.bufferWidth };
  }

  getVertexShader(options) {
    return getVertexShader(options);
  }

  getFragmentShader(options) {
    return this.synth.getDefaultDefines() + getFragmentShader(options);
  }

  _addLODData(target, len) {
    this.LODOffsets = [0];
    len /= 4;
    for (let lod = 0; lod < levelsOfDetail-1; lod++) {
      let ofs_in = ~~(this.LODOffsets[lod] * 4);
      let ofs_out = ofs_in + len * 4;
      this.LODOffsets.push(ofs_out / 4);
      // count to len div2 rounded up
      for (let ix = 0; ix < len + 1; ix += 2) {
        for (let jx = 0; jx < 4; jx++) {
          // TODO: This wraps arround to the 1st value of the average buf but to minor to see
          //       and i don't want to break the loop here maybe fix afterwards
          target[ofs_out++] = (target[ofs_in] + target[ofs_in + 4]) * 0.5;
          if (target[ofs_out - 1] < 0.0) {
            if (jx !== 1) {
              // debugger;
            }
          }
          ofs_in += 1;
        }
        ofs_in += 4;
      }
      len = ~~Math.ceil(len / 2);
    }
  }

  /**
   * 
   * @param {Float32Array} viewData 
   * @param {number} durationInFragments
   */
  setViewData(viewData, durationInFragments) {
    // throw new Error("Method not implemented.");
    const gl = this.gl;
    let sourceLen = ~~(viewData.length/2);
    let modulus = this.synth.bufferWidth * 4;
    // let enlargedViewData = new Float32Array(Math.ceil(viewData.length/modulus) * modulus);

    // Make buffers twice as big for levelsOfDetail and add levelsof detail as extra because we round up
    let viewBuf0 = new Float32Array(Math.ceil(sourceLen/modulus+ levelsOfDetail) * modulus * 2 );
    let viewBuf1 = new Float32Array(Math.ceil(sourceLen/modulus+ levelsOfDetail) * modulus * 2 );

    viewBuf0.set(viewData.subarray(0,sourceLen));
    viewBuf1.set(viewData.subarray(sourceLen, sourceLen * 2));

    this._addLODData(viewBuf0, ~~sourceLen)
    this._addLODData(viewBuf1, ~~sourceLen)
/*
  We should pass the offsets as they are hard to calculate
  len = 13 Math.ceil(Math.pow(0.5,LOD) * 13)
     0..12 // 1 2 3 4 5 6 7 8 9 10 11 12 13
  len = 7
    13..19 // 1.5 3.5 5.5 7.5 9.5  11.5  13
  len = 4
    20..23 //   2.5     6.5     10.5     13
  len = 2
    24..25 //       4.5              13

*/
    this.viewTexture0 = gl.createOrUpdateFloat32TextureBuffer(viewBuf0, 
                             // { bufferWidth:this.webglSynth.bufferWidth });
                             this.viewTexture0);
    this.viewTexture1 = gl.createOrUpdateFloat32TextureBuffer(viewBuf1, 
                             // { bufferWidth:this.webglSynth.bufferWidth });
                             this.viewTexture1);
    this.recordAnalyzeBuffer = {
      leftTex: this.viewTexture0.texture,
      rightTex: this.viewTexture1.texture
    }
    this.dataOffset = 0;
    this.durationInFragments = durationInFragments;
  }

  updateCanvas(
    xScaleSmooth = this.control.xScaleSmooth,
    yScaleSmooth = this.control.yScaleSmooth,
    xOffsetSmooth = this.control.xOffsetSmooth,
    yOffsetSmooth = this.control.yOffsetSmooth) {
    
    const gl = this.gl;
    const shader = this.shader = gl.checkUpdateShader2('audio-view', this.getVertexShaderBound, this.getFragmentShaderBound);

    if (gl && this.parentElement && this.viewTexture0.texture && this.recordAnalyzeBuffer) {
      if (gl.updateShaderAndSize(this, shader, this.parentElement)) {

        shader.u.offset?.set(this.dataOffset); // this.webglSynth.processCount);s
        shader.u.durationInFragments?.set(this.durationInFragments);
        shader.u.scale?.set(xScaleSmooth, yScaleSmooth);
        shader.u.position?.set(xOffsetSmooth, yOffsetSmooth);

        shader.u.preScale?.set(      this.preScaleMax,       this.preScaleRMS,       this.preScaleEng);
        shader.u.quadraticCurve?.set(this.quadraticCurveMax, this.quadraticCurveRMS, this.quadraticCurveEng);
        shader.u.linearDbMix?.set(   this.linearDbMixMax,    this.linearDbMixRMS,    this.linearDbMixEng);
        shader.u.dBRange?.set(this.dBRangeMax, this.dBRangeRMS, this.dBRangeEng);

        // @ts-ignore
        shader.u.opacity?.set(this.opacity);
        shader.u.showMaxOnly?.set(~~this.showMaxOnly);

        if (shader.u["LODOffsets[0]"]) {
          gl.uniform1iv(shader.u["LODOffsets[0]"], this.LODOffsets);
        }
        shader.u.LODLevel?.set((this.levelOfDetail));
        // shader.u.rekordBoxColors?.set((this.rekordBoxColors?1:0));
        shader.u.maxColor.set.apply(null, this.maxColor);
        shader.u.rmsColor.set.apply(null, this.rmsColor);
        shader.u.engColor.set.apply(null, this.engColor);
      
        gl.activeTexture(gl.TEXTURE10);
        gl.bindTexture(gl.TEXTURE_2D, this.recordAnalyzeBuffer.leftTex);
        gl.uniform1i(shader.u.analyzeTexturesLeft, 10);

        gl.activeTexture(gl.TEXTURE11);
        gl.bindTexture(gl.TEXTURE_2D, this.recordAnalyzeBuffer.rightTex);
        gl.uniform1i(shader.u.analyzeTexturesRight, 11);
        gl.activeTexture(gl.TEXTURE0);

        this.drawFunction(shader, xScaleSmooth, yScaleSmooth, xOffsetSmooth, yOffsetSmooth);
      }
    }
  }

  drawFunction(shader, xScaleSmooth, yScaleSmooth, xOffsetSmooth, yOffsetSmooth) {
    const gl = this.gl;
    shader.a.vertexPosition.en();
    shader.a.vertexPosition.set(this.vertexBuffer, 2 /* elements per vertex */);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    shader.a.vertexPosition.dis();
  }
}