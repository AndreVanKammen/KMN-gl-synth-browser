import WebGLSynth from "../../KMN-gl-synth.js/webgl-synth.js";
import { animationFrame } from "../../KMN-utils-browser/animation-frame.js";
import PanZoomControl from "../../KMN-utils-browser/pan-zoom-control.js";

const levelsOfDetail = 32;

function getVertexShader() {
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
      vec2 pos = vertexPosition.xy;
      textureCoord = (0.5 + 0.5 * pos) / scale + position;
      fragmentsPerPixel = durationInFragments / (scale.x * windowSize.x);
      // pos.y *= scale.y;
      gl_Position = vec4(pos, 0.0, 1.0);
    }`
}

  // The shader that calculates the pixel values for the filled triangles
function getFragmentShader() {
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
  uniform float playPos;

  uniform vec2 windowSize;

  uniform int[${levelsOfDetail}] LODOffsets;
  uniform float LODLevel;

  uniform bool rekordBoxColors;
  uniform bool removeAvgFromRMS;
  uniform bool showBeats;

  uniform vec3 preScale;
  uniform vec3 quadraticCurve;
  uniform vec3 linearDbMix;
  uniform vec3 dBRange;

  uniform sampler2D analyzeTexturesLeft;
  uniform sampler2D analyzeTexturesRight;
  uniform sampler2D beatTexture;

  const float log10 = 1.0 / log(10.0);

  vec3 getDataIX0(int ix, int LODLevel) {
    ivec2 point = ivec2(ix % bufferWidth, ix / bufferWidth);
    vec4 result = (textureCoord.y < 0.5) && (fragmentsPerPixel>0.03)
                ? texelFetch(analyzeTexturesLeft,  point, 0)
                : texelFetch(analyzeTexturesRight,  point, 0);
    return result.wxz;
  }

  vec3 getDataIX1(float ix_in, int LODLevel) {
    if (fragmentsPerPixel<=0.03) {
      ix_in += .5;
    }
    // int len = int(ceil(pow(0.5,float(LODLevel)) * durationInFragments));
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
     
    return mix(low,high,fract(ix * float(fragmentsPerPixel>0.03)));
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
    // result.yz = sqrt(result.yz);
    result.z *= 4.0;
    if (fragmentsPerPixel>0.03) {
      result = result / preScale;
      vec3 resultDB = clamp(
        (dBRange + (20.0 * log10 * log(0.000001 + result) )) / dBRange,
         0.0, 1.0);
      result = mix(result, resultDB, linearDbMix);
      result = pow(result,quadraticCurve);
    }
    return result;
  }

  vec4 getBeatData(int ix) {
    ivec2 point = ivec2(ix % bufferWidth, ix / bufferWidth);
    return texelFetch(beatTexture, point, 0);
  }

  void main(void) {
    float delta = (textureCoord.x * durationInFragments);

    float readOffset = float(offset) + delta;
    float playDistance = (delta - playPos) / 5000.0 * pow(scale.x, 1.2);
    
    float fragmentsPerPixel = durationInFragments / (scale.x * float(windowSize.x));
    vec3 data1 = mixDataIX(readOffset);
    vec4 beatData = getBeatData(int(round(readOffset)));
    float pxy = textureCoord.y / float(windowSize.y);

    vec3 dist = clamp(data1,0.0,1.0);
    dist = smoothstep(
      dist - vec3(pxy),
      dist + vec3(pxy), 
      abs(vec3(1.0 - 2.0 * textureCoord.y)));
    vec3 clr = 1.0 - dist;
    clr.r = max(clr.r - clr.b * clr.b * 0.2, 0.0);
    clr.g = max(clr.g - clr.b * clr.b * 0.15, 0.0) * 0.8;

    if (!showBeats || textureCoord.y>0.1) {
      beatData.rgb *= 0.0;
    } else {
      beatData.rgba *= vec4(bvec4(
        textureCoord.y < 0.025,
        textureCoord.y > 0.025 && textureCoord.y<0.050,
        textureCoord.y > 0.050 && textureCoord.y<0.075,
        textureCoord.y > 0.075
        ));
      if (beatData.a>100.0) {
        beatData.rgb = vec3(beatData.a / 1000.0);
      }
    }
    beatData.rgb *= pow(clamp(beatData.rgb,0.0,1.0),vec3(0.7))*0.7;
    if (playPos > 0.0) {
      beatData.rgb *= 0.8;
      beatData.rgb += (1.0-pow(smoothstep(-0.0,2.0,abs(playDistance)),0.15) + clr.b*0.1) * 14.0;
    }
    beatData.rgb *= 1.0-0.8 * smoothstep(0.0,0.2,clr);
    
    if (rekordBoxColors) {
      vec3 d = clr;
      clr = d.r * vec3(0            ,  83.0 / 255.0, 225.0 / 255.0);
      clr *= (1.0 - d.g);
      clr += d.g * vec3(179.0 / 255.0, 102.0 / 255.0,   7.0 / 255.0);
      clr *= (1.0 - d.b);
      clr += d.b * vec3(245.0 / 255.0, 235.0 / 255.0, 215.0 / 255.0);
    } else {
      clr.r = max(0.0,clr.r-(clr.g+clr.b) * 0.2);
      clr.g = max(0.0,clr.g-clr.b * 0.4);
    }
    if (fragmentsPerPixel<=0.03) {
      clr.rgb *= 0.75;
    }
    float a = max(max(clr.r,clr.g),clr.b);

    if (textureCoord.y>0.0) {
      fragColor = vec4(clamp(pow(beatData.rgb / 12.0,vec3(2.0)) + clr.rgb, 0.0,1.0) ,a * 0.5);
    }
  }
  `
}

export class AudioView {
  constructor (options) {
    this.options = options;

    this.updateCanvasBound = this.updateCanvas.bind(this);
    this.dataOffset = 0;
    this.durationInFragments = 1000;
    this.onGetPlayPos = () => -1;

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
    this.rekordBoxColors = false;

    this.showBeats = false;
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
  }

  /**
   * @param {WebGLSynth} webglSynth 
   */
  setSynth(webglSynth) {
    this.webglSynth = webglSynth;
    const gl = this.gl = webglSynth.gl;

    // Create two triangles to form a square that covers the whole canvas
    const basic2triangles = [
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
      1, -1];
    this.vertexBuffer = gl.updateOrCreateFloatArray(0, basic2triangles);
    gl.checkUpdateShader(this, getVertexShader(), this.webglSynth.getDefaultDefines() + getFragmentShader());

    if (!this.options.noRequestAnimationFrame) {
      animationFrame(this.updateCanvasBound);
    }

    this.viewTexture0 = { bufferWidth: this.webglSynth.bufferWidth };
    this.viewTexture1 = { bufferWidth: this.webglSynth.bufferWidth };
    this.beatBuffer = { bufferWidth: this.webglSynth.bufferWidth };
  }

  updateCanvas(
    xScaleSmooth = this.control.xScaleSmooth, yScaleSmooth = this.control.yScaleSmooth,
    xOffsetSmooth = this.control.xOffsetSmooth, yOffsetSmooth = this.control.yOffsetSmooth) {
    
    let gl = this.gl;
    let shader = gl.checkUpdateShader(this, getVertexShader(), this.webglSynth.getDefaultDefines() + getFragmentShader());

    if (gl && shader && this.parentElement && this.viewTexture0.texture) {
      
      let {w, h, dpr} = gl.updateCanvasSize(this.canvas);

      let rect = this.parentElement.getBoundingClientRect();
      if (this.recordAnalyzeBuffer && rect.width && rect.height) {
        gl.viewport(rect.x * dpr, h - (rect.y + rect.height) * dpr, rect.width * dpr, rect.height * dpr);
        w = rect.width * dpr;
        h = rect.height * dpr;

        // Tell WebGL how to convert from clip space to pixels
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(shader);

        shader.u.playPos?.set(this.onGetPlayPos() * this.durationInFragments);

        shader.u.offset?.set(this.dataOffset); // this.webglSynth.processCount);s
        shader.u.durationInFragments?.set(this.durationInFragments);
        shader.u.windowSize?.set(w, h);
        shader.u.dpr?.set(dpr);
        shader.u.scale?.set(xScaleSmooth, yScaleSmooth);
        shader.u.position?.set(xOffsetSmooth, yOffsetSmooth);

        // shader.u.removeAvgFromRMS.set(false);
        shader.u.preScale?.set(      this.preScaleMax,       this.preScaleRMS ,       this.preScaleEng);
        shader.u.quadraticCurve?.set(this.quadraticCurveMax, this.quadraticCurveRMS , this.quadraticCurveEng);
        shader.u.linearDbMix?.set(   this.linearDbMixMax,    this.linearDbMixRMS ,    this.linearDbMixEng);
        shader.u.dBRange?.set(       this.dBRangeMax,        this.dBRangeRMS,         this.dBRangeEng);
        shader.u.showBeats?.set(this.showBeats);

        if (shader.u["LODOffsets[0]"]) {
          gl.uniform1iv(shader.u["LODOffsets[0]"], this.LODOffsets);
        }
        shader.u.LODLevel?.set((this.levelOfDetail));
        shader.u.rekordBoxColors?.set((this.rekordBoxColors));
      
        shader.a.vertexPosition.en();
        shader.a.vertexPosition.set(this.vertexBuffer, 2 /* elements per vertex */);

        gl.activeTexture(gl.TEXTURE10);
        gl.bindTexture(gl.TEXTURE_2D, this.recordAnalyzeBuffer.leftTex);
        gl.uniform1i(shader.u.analyzeTexturesLeft, 10);

        gl.activeTexture(gl.TEXTURE11);
        gl.bindTexture(gl.TEXTURE_2D, this.recordAnalyzeBuffer.rightTex);
        gl.uniform1i(shader.u.analyzeTexturesRight, 11);
        gl.activeTexture(gl.TEXTURE0);

        if (this.beatBuffer.texture) {
          gl.activeTexture(gl.TEXTURE12);
          gl.bindTexture(gl.TEXTURE_2D, this.beatBuffer.texture);
          gl.uniform1i(shader.u.beatTexture, 12);
        }

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        shader.a.vertexPosition.dis();
      }
    }
    if (!this.options.noRequestAnimationFrame) {
      animationFrame(this.updateCanvasBound);
    }
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
    let modulus = this.webglSynth.bufferWidth * 4;
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

  setBeatData(beatBufferData) {
    let sourceLen = beatBufferData.length;
    let modulus = this.webglSynth.bufferWidth * 4;
    let viewBuf0 = new Float32Array(Math.ceil(sourceLen/modulus) * modulus);
    viewBuf0.set(beatBufferData);
    this.beatBuffer = this.gl.createOrUpdateFloat32TextureBuffer(viewBuf0, this.beatBuffer);
  }

  setOffsetAndLength(recordAnalyzeBuffer, offset, length) {
    this.recordAnalyzeBuffer = recordAnalyzeBuffer;
    this.dataOffset = offset;
    this.durationInFragments = length;
  }
}