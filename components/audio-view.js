import WebGLSynth from "../../KMN-gl-synth.js/webgl-synth.js";
import PanZoomControl from "../../KMN-utils-browser/pan-zoom-control.js";

const levelsOfDetail = 32;

function getVertexShader() {
  return /*glsl*/`
    in vec2 vertexPosition;
    out vec2 textureCoord;
    uniform vec2 scale;
    uniform vec2 position;
    void main(void) {
      vec2 pos = vertexPosition.xy;
      textureCoord = (0.5 + 0.5 * pos) / scale + position;
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
  out vec4 fragColor;

  uniform vec2 scale;
  uniform int offset;

  uniform int duration;
  uniform float playPos;

  uniform ivec2 windowSize;

  uniform int[${levelsOfDetail}] LODOffsets;
  uniform float LODLevel;

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

  vec3 getDataIX0(int ix, float y, int LODLevel) {
    ivec2 point = ivec2(ix % bufferWidth, ix / bufferWidth);

    vec4 left = texelFetch(analyzeTexturesLeft,  point, 0);
    vec4 right = texelFetch(analyzeTexturesRight,  point, 0);
    vec4 result = mix(left, right, smoothstep(0.49,0.51,y));

    // Substract average from RMS? No to unpredictable, gives new errors!
    // if (removeAvgFromRMS) {
    //   result.x -= result.y * result.y;
    // }
    result.xz = sqrt(result.xz);
    
    return clamp(result.wxz,0.0,100.0);
  }

  vec3 getDataIX1(float ix_in, float y, int LODLevel) {

    int len = int(ceil(pow(0.5,float(LODLevel)) * float(duration)));
    int divider = int(pow(2.0, float(LODLevel)));
    int LODOffset = LODOffsets[LODLevel];
    int ofs = LODOffset + offset / divider;
    float ix = float(LODOffset) + ix_in / float(divider);

    if (ix < float(ofs) || ix>= float(ofs + len)) {
      return vec3(0.0);
    }

    vec3 low = getDataIX0(int(floor(ix)),y,LODLevel);
    vec3 high = getDataIX0(int(ceil(ix)),y,LODLevel);

    return mix(low,high,(1.0+sin((fract(ix) * 2.0 - 1.0) * pi * 0.5))*0.5);//fract(ix));
  }

  vec3 getDataIX(float ix_in, float y,float LODLevel) {
    // vec3 result = vec3(0.0);
    // float weight = 0.0;
    // for (int ix = 0; ix <= ceil(LODLevel); ix++) {
    //   // float w = 1.0 / pow(2.0,float(ix));
    //   float w = pow(1.5,float(ix));
    //   weight += w;
    //   result += getDataIX1(ix_in, y, ix) * w;
    // }
    // return result / weight;
    vec3 low = getDataIX1(ix_in, y, int(floor(LODLevel)));
    vec3 high = getDataIX1(ix_in, y, int(ceil(LODLevel)));
    return mix(low,high,fract(LODLevel)); // (1.0+sin((fract(LODLevel) * 2.0 - 1.0) * pi * 0.5))*0.5);
  }
/*
  vec3 getDataIX2(int ix, float y) {
    vec3 a = getDataIX1(ix - 1, y);
    vec3 b = getDataIX1(ix, y);
    vec3 c = getDataIX1(ix + 1, y);

    return vec3(((a.x > b.x) == (c.x > b.x)) ? (a.x + c.x) * 0.5 : (a.x + b.x + c.x ) / 3.0,
                ((a.y > b.y) == (c.y > b.y)) ? (a.y + c.y) * 0.5 : (a.y + b.y + c.y ) / 3.0,
                ((a.z > b.z) == (c.z > b.z)) ? (a.z + c.z) * 0.5 : (a.z + b.z + c.z ) / 3.0);
  }

  vec3 getDataIX(int ix, float y) {
    vec3 a = getDataIX2(ix - 1, y);
    vec3 b = getDataIX2(ix, y);
    vec3 c = getDataIX2(ix + 1, y);

    return vec3(((a.x > b.x) == (c.x > b.x)) ? (a.x + c.x) * 0.5 : b.x,
                ((a.y > b.y) == (c.y > b.y)) ? (a.y + c.y) * 0.5 : b.y,
                ((a.z > b.z) == (c.z > b.z)) ? (a.z + c.z) * 0.5 : b.z);
  }
*/
  vec3 mixDataIX(float ix, float y) {
    int startIx = int(floor(ix));
    int stopIx = int(ceil(ix));
    
    float fragmentsPerPixel = float(duration) / (scale.x * float(windowSize.x));
    vec3 result = getDataIX(ix,y, clamp(log2(0.5+fragmentsPerPixel*(1.0+LODLevel)),0.01,float(${levelsOfDetail})));
    // if (fragmentsPerPixel < 1.0)  {
      // vec3 data1 = getDataIX(startIx,y);
      // vec3 data2 = getDataIX(stopIx,y);
    // result = mix(data1,data2,(1.0+sin((fract(ix) * 2.0 - 1.0) * pi * 0.5))*0.5);
    // } else {
    //   startIx -= int(fragmentsPerPixel * 0.55);
    //   stopIx += int(fragmentsPerPixel * 0.55);
    //   // Sum all values for the whole period
    //   float weight = 0.0;
    //   float length = float(stopIx - startIx + 1);
    //   for (int ix2 = startIx; ix2 <= stopIx; ix2++) {
    //     // result = max(result,getDataIX(ix2,y));
    //     float w = 1.0;// - cos((float(ix2) + fract(ix)) / length * pi * 2.0);
    //     weight += w;
    //     result += getDataIX(ix2,y) * w;
    //   }
    //   result = result / weight; // float(stopIx - startIx + 1);
    // }
    result = result / preScale;
    vec3 resultDB = clamp(
      (dBRange + (20.0 * log10 * log(0.000001 + result) )) / dBRange,
       0.0, 1.0);
    result = mix(result, resultDB, linearDbMix);
    result = pow(result,quadraticCurve);
    return result;
  }

  vec4 getBeatData(int ix) {
    ivec2 point = ivec2(ix % bufferWidth, ix / bufferWidth);
    return texelFetch(beatTexture, point, 0);
  }

  void main(void) {
    float delta = (textureCoord.x * float(duration));

    float readOffset = float(offset) + delta;
    float playDistance = (delta - playPos) / 5000.0 * pow(scale.x, 1.2);
    // if (abs(playDistance) <= pi * 0.5) {
    //   readOffset += -sin(playDistance*0.25) * 14.0;
    // }
    
    vec3 data1 = mixDataIX(readOffset,textureCoord.y);
    vec4 beatData = getBeatData(int(round(readOffset)));
    float pxy = textureCoord.y / float(windowSize.y);

    // if (abs(playDistance) <= pi * 0.5) {
    //   data1 *= 1.0 + 0.5 * cos(playDistance);
    // }

    vec3 dist = clamp(data1,0.0,1.0);
    dist = smoothstep(
      dist - vec3(pxy),
      dist + vec3(pxy), 
      abs(vec3(1.0 - 2.0 * textureCoord.y)));
    vec3 clr = 1.0 - dist;
    clr.r = max(clr.r - clr.b * clr.b * 0.2, 0.0);
    clr.g = max(clr.g - clr.b * clr.b * 0.15, 0.0) * 0.8;
    // beatData.rgb *= 0.0;
    if (!showBeats || textureCoord.y>0.1) {
      beatData.rgb *= 0.0;
    }
    if (showBeats && beatData.a>100.0) {
      if (textureCoord.y>0.9) {
        beatData.rgb = vec3(beatData.a / 1000.0);
      }
    }
    beatData.rgb *= pow(clamp(beatData.rgb,0.0,1.0),vec3(0.7))*0.7;
    if (playPos > 0.0) {
      beatData.rgb *= 0.8;
      beatData.rgb += (1.0-pow(smoothstep(-0.0,2.0,abs(playDistance)),0.15)) * 14.0;
    }
    beatData.rgb *= 1.0-0.8 * smoothstep(0.0,0.2,clr);

    fragColor = vec4(clamp(pow(beatData.rgb / 12.0,vec3(2.0)) + clr.rgb * 0.9, 0.0,1.0) ,1.0);
  }
  `
}

export class AudioView {
  constructor (options) {
    this.options = options;

    this.updateCanvasBound = this.updateCanvas.bind(this);
    this.dataOffset = 0;
    this.dataLength = 1000;
    this.onClick = (x, y) => {};
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
    this.levelOfDetail = 0;

    this.showBeats = true;
  }

  /**
   * @param {HTMLElement} parentElement
   */
  initializeDOM(parentElement) {
    this.parentElement = parentElement;

    this.canvas = this.options.canvas || this.parentElement.$el({tag:'canvas', cls:'analyzerCanvas'});
    
    this.control = this.options.control || new PanZoomControl(this.parentElement, {
      minYScale: 1.0,
      maxYScale: 1.0,
      minXScale: 1.0,
      maxXScale: 1000.0
    });
    this.control.onClick = (x,y) => this.onClick(x,y);
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
      -1,  1,
       1,  1,
       1, -1 ];
    this.vertexBuffer = gl.updateOrCreateFloatArray(0, basic2triangles);
    this.shader = gl.getShaderProgram(
      getVertexShader(), 
      this.webglSynth.getDefaultDefines()+
      getFragmentShader(),
      2);

    if (!this.options.noRequestAnimationFrame) {
      window.requestAnimationFrame(this.updateCanvasBound);
    }

    this.viewTexture0 = { bufferWidth:this.webglSynth.bufferWidth };
    this.viewTexture1 = { bufferWidth: this.webglSynth.bufferWidth };
    this.beatBuffer = { bufferWidth: this.webglSynth.bufferWidth };
  }

  updateCanvas() {
    let gl = this.gl;
    let shader = this.shader;

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
        this.currentScaleX = (this.currentScaleX || 0.0) * 0.9 + 0.1 * this.control.xScale;
        this.currentScaleY = (this.currentScaleY || 0.0) * 0.9 + 0.1 * this.control.yScale;

        this.currentOffsetX = (this.currentOffsetX || 0.0) * 0.9 + 0.1 * this.control.xOffset;
        this.currentOffsetY = (this.currentOffsetY || 0.0) * 0.9 + 0.1 * this.control.yOffset;

        shader.u.offset?.set(this.dataOffset); // this.webglSynth.processCount);s
        shader.u.duration?.set(this.dataLength);
        shader.u.scale?.set(this.currentScaleX, this.currentScaleY);
        shader.u.position?.set(this.currentOffsetX, this.currentOffsetY);
        shader.u.windowSize?.set(w, h);

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
      
        shader.a.vertexPosition.en();
        shader.a.vertexPosition.set(this.vertexBuffer, 2 /* elements per vertex */);

        shader.u.playPos?.set(this.onGetPlayPos() * this.dataLength);

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
      window.requestAnimationFrame(this.updateCanvasBound);
    }
  }

  _addLODData(target, len) {
    this.LODOffsets = [0];
    len /= 4;
    for (let lod = 0; lod < levelsOfDetail; lod++) {
      let ofs_in = ~~(this.LODOffsets[lod] * 4);
      let ofs_out = ofs_in + len * 4;
      console.log(ofs_in, len);
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
   */
  setViewData(viewData) {
    // throw new Error("Method not implemented.");
    const gl = this.gl;
    let sourceLen = ~~(viewData.length/2);
    let modulus = this.webglSynth.bufferWidth * 4;
    // let enlargedViewData = new Float32Array(Math.ceil(viewData.length/modulus) * modulus);
    let viewBuf0 = new Float32Array(Math.ceil(sourceLen/modulus) * modulus * 4);
    let viewBuf1 = new Float32Array(Math.ceil(sourceLen/modulus) * modulus * 4);

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
    this.dataOffset = 16; // TODO: analyze starts 16 to early see analyze-loader 2 buffers extra problem
    this.dataLength = ~~(sourceLen/4);
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
    this.dataLength = length;
  }
}