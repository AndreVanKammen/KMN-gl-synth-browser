// This is an attempt to convert shadercode to javascript
// -Types should be removed and replaced by function or let
// -Expressions on vector types should be changed to sub/add/div calls with appropriate element count
// -indexers .x .y should be replaced by array selectors/constructors
// -All possible functions should be in a library, function calls should add vector element counts to do correct overload
function mod21(v2,x) {
  return [
    v2[0] % x,
    v2[1] % x];
}

function sign(x) {
  return Math.sign(x);
}

function abs(x) {
  return Math.abs(x);
}

function floor(x) {
  return Math.floor(x);
}
function abs2(x2) {
  return [
    Math.abs(x2[0]),
    Math.abs(x2[1])]
}
function sub21(x2,y) {
  return [
    x2[0]-y,
    x2[1]-y];
}

function vec2(x,y) {
  return [x,y];
}

function vec21(x) {
  return [x,x];
}

function vec31(x) {
  return [x,x,x];
}

function vec3(x,y,z) {
  return [x,y,z];
}

function vec42(x,y) {
  return [x[0],x[1],y[0],y[1]];
}

function vec4(x,y,z,w) {
  return [x,y,z,w];
}

function mul21(v2,x) {
  return [
    v2[0] * x,
    v2[1] * x];
}

function sub12(x,v2) {
  return [x-v2[0],x-v2[1]];
}

function sub33(x3,y3) {
  return [
    x3[0] - y3[0],
    x3[1] - y3[1],
    x3[2] - y3[2]];
}

function sub13(x,y3) {
  return [
    x - y3[0],
    x - y3[1],
    x - y3[2]];
}

// https://en.wikipedia.org/wiki/Smoothstep
function smoothstep (edge0, edge1, x) {
  x = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return x * x * (3 - 2 * x);
};

function smoothstep4(f4,t4,x4) {
  return [
    smoothstep (f4[0], t4[0], x4[0]),
    smoothstep (f4[1], t4[1], x4[1]),
    smoothstep (f4[2], t4[2], x4[2]),
    smoothstep (f4[3], t4[3], x4[3])];
}

function min(x,y) {
  return Math.min(x,y);
}
 
function min2(x2,y2) {
  return [
    Math.min(x2[0],y2[0]),
    Math.min(x2[1],y2[1])];
}

function float(x) {
  return x * 1.0;
}

function int(x) {
  return ~~x;
}

function all3(b3) {
  return b3[0] && b3[1] && b3[2];
}

function greaterThan3(x3,y3) {
  return [
    x3[0] > y3[0],
    x3[1] > y3[1],
    x3[2] > y3[2]];
}

function abs3(x3) {
  return [
    Math.abs(x3[0]),
    Math.abs(x3[1]),
    Math.abs(x3[2])];
}

export function /*vec2*/ getKeyNr(/*vec2*/ uv) {
  let /*vec2*/ loc = mod21(uv,1.0); // Coordinate for one octave

  // slightly scale black up and shift left and right half
  let /*float*/ blackScaledX = loc[0] * 0.89 + 0.123 + sign(loc[0]-3./7.) * 0.025;

  // calculate key coordinates
  let keyX = mul21(mod21(vec2(loc[0],blackScaledX),1.0/7.0),7.0);
  let /*vec4*/ keyCoord = vec42( abs2(sub21(keyX,0.5)),
                                vec21(1.0-loc[1]));

  // calculate distance field  x-white x-black y-white y-black
  let /*vec4*/ keysHV = smoothstep4( vec4( 0.45,   0.2,    0.02,   0.36),
                                     vec4( 0.47,   0.3,    0.03,   0.42), keyCoord);

  // Combine the distance fields
  let /* vec2 */ keyDist = min2(sub12(1.0, [keysHV[0],keysHV[1]]), [keysHV[2],keysHV[3]]);

  // leave out black keys nr 0, 3 and 7
  let /* float */ blackKeyNr = blackScaledX * 7.0 - keyX[1];
  keyDist[1] *= float(all3(greaterThan3(abs3(sub13(blackKeyNr, vec3(0.0, 3.0, 7.0))), vec31(.01))));

  // Substract black key from white key /
  keyDist[0] = min(keyDist[0], 1.0 - smoothstep(0.0, 0.05, keyDist[1]));

  let keyNr = int(uv[0]) * 12;
  if (keyDist[1] > 0.5) {
    if (blackKeyNr <3.0) {
      keyNr += 1 + int(floor(blackKeyNr-1.0)) * 2;
    } else {
      keyNr += int(floor(blackKeyNr)) * 2 - 2;
    }
  } else {
    if (keyDist[0] > 0.5) {
      let /*int*/ whiteKeyNr = int(loc[0] * 7.0);
      if (whiteKeyNr < 3) {
        keyNr += whiteKeyNr * 2;
      } else {
        keyNr += whiteKeyNr * 2 - 1;
      }
    } else {
      keyNr = -1;
    }
  }

  return keyNr;
}
