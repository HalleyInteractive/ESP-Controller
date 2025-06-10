/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
 * Digest Algorithm, as defined in RFC 1321.
 * Version 2.2 Copyright (C) Paul Johnston 1999 - 2009
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for more info.
 */
export namespace SparkMD5 {
  function r(n: number, t: number) {
    return (n << t) | (n >>> (32 - t));
  }

  function c(n: number, t: number, e: number, o: number, r: number, c: number) {
    return a(r(a(a(t, n), a(o, c)), e), r);
  }

  function f(n: number, t: number, e: number, o: number, r: number, c: number, f: number) {
    return c(t ^ e ^ o, n, t, r, c, f);
  }

  function i(n: number, t: number, e: number, o: number, r: number, c: number, f: number) {
    return c((t & e) | (~t & o), n, t, r, c, f);
  }

  function u(n: number, t: number, e: number, o: number, r: number, c: number, f: number) {
    return c(t ^ e ^ o, n, t, r, c, f);
  }

  function d(n: number, t: number, e: number, o: number, r: number, c: number, f: number) {
    return c(e ^ (t | ~o), n, t, r, c, f);
  }

  function a(n: number, t: number) {
    var e = (n & 65535) + (t & 65535),
      o = (n >> 16) + (t >> 16) + (e >> 16);
    return (o << 16) | (e & 65535);
  }

  export class ArrayBuffer {
    private.state: [number, number, number, number];
    private.buffer: Uint8Array;
    private.length: number;

    constructor() {
      this.reset();
    }

    reset() {
      this.state = [1732584193, -271733879, -1732584194, 271733878];
      this.buffer = new Uint8Array(64);
      this.length = 0;
    }

    append(data: ArrayBuffer) {
      var n = new Uint8Array(data);
      for (var t = 0; t < n.length; t++) {
        this.buffer[this.length % 64] = n[t];
        this.length++;
        if (this.length % 64 === 0) {
          this.process();
        }
      }
    }

    process() {
      for (var n = 0; n < 16; n++) {
        var t = n << 2;
        this.x[n] =
          this.buffer[t] +
          (this.buffer[t + 1] << 8) +
          (this.buffer[t + 2] << 16) +
          (this.buffer[t + 3] << 24);
      }
      var e = a,
        r = i,
        c = f,
        h = d,
        l = u,
        s = this.state[0],
        v = this.state[1],
        p = this.state[2],
        B = this.state[3];
      (s = r(s, v, p, B, this.x[0], 7, -680876936)),
        (B = r(B, s, v, p, this.x[1], 12, -389564586)),
        (p = r(p, B, s, v, this.x[2], 17, 606105819)),
        (v = r(v, p, B, s, this.x[3], 22, -1044525330)),
        (s = r(s, v, p, B, this.x[4], 7, -176418897)),
        (B = r(B, s, v, p, this.x[5], 12, 1200080426)),
        (p = r(p, B, s, v, this.x[6], 17, -1473231341)),
        (v = r(v, p, B, s, this.x[7], 22, -45705983)),
        (s = r(s, v, p, B, this.x[8], 7, 1770035416)),
        (B = r(B, s, v, p, this.x[9], 12, -1958414417)),
        (p = r(p, B, s, v, this.x[10], 17, -42063)),
        (v = r(v, p, B, s, this.x[11], 22, -1990404162)),
        (s = r(s, v, p, B, this.x[12], 7, 1804603682)),
        (B = r(B, s, v, p, this.x[13], 12, -40341101)),
        (p = r(p, B, s, v, this.x[14], 17, -1502002290)),
        (v = r(v, p, B, s, this.x[15], 22, 1236535329)),
        (s = c(s, v, p, B, this.x[1], 5, -165796510)),
        (B = c(B, s, v, p, this.x[6], 9, -1069501632)),
        (p = c(p, B, s, v, this.x[11], 14, 643717713)),
        (v = c(v, p, B, s, this.x[0], 20, -373897302)),
        (s = c(s, v, p, B, this.x[5], 5, -701558691)),
        (B = c(B, s, v, p, this.x[10], 9, 38016083)),
        (p = c(p, B, s, v, this.x[15], 14, -660478335)),
        (v = c(v, p, B, s, this.x[4], 20, -405537848)),
        (s = c(s, v, p, B, this.x[9], 5, 568446438)),
        (B = c(B, s, v, p, this.x[14], 9, -1019803690)),
        (p = c(p, B, s, v, this.x[3], 14, -187363961)),
        (v = c(v, p, B, s, this.x[8], 20, 1163531501)),
        (s = c(s, v, p, B, this.x[13], 5, -1444681467)),
        (B = c(B, s, v, p, this.x[2], 9, -51403784)),
        (p = c(p, B, s, v, this.x[7], 14, 1735328473)),
        (v = c(v, p, B, s, this.x[12], 20, -1926607734)),
        (s = l(s, v, p, B, this.x[5], 4, -378558)),
        (B = l(B, s, v, p, this.x[8], 11, -2022574463)),
        (p = l(p, B, s, v, this.x[11], 16, 1839030562)),
        (v = l(v, p, B, s, this.x[14], 23, -35309556)),
        (s = l(s, v, p, B, this.x[1], 4, -1530992060)),
        (B = l(B, s, v, p, this.x[4], 11, 1272893353)),
        (p = l(p, B, s, v, this.x[7], 16, -155497632)),
        (v = l(v, p, B, s, this.x[10], 23, -1094730640)),
        (s = l(s, v, p, B, this.x[13], 4, 681279174)),
        (B = l(B, s, v, p, this.x[0], 11, -358537222)),
        (p = l(p, B, s, v, this.x[3], 16, -722521979)),
        (v = l(v, p, B, s, this.x[6], 23, 76029189)),
        (s = l(s, v, p, B, this.x[9], 4, -640364487)),
        (B = l(B, s, v, p, this.x[12], 11, -421815835)),
        (p = l(p, B, s, v, this.x[15], 16, 530742520)),
        (v = l(v, p, B, s, this.x[2], 23, -995338651)),
        (s = h(s, v, p, B, this.x[0], 6, -198630844)),
        (B = h(B, s, v, p, this.x[7], 10, 1126891415)),
        (p = h(p, B, s, v, this.x[14], 15, -1416354905)),
        (v = h(v, p, B, s, this.x[5], 21, -57434055)),
        (s = h(s, v, p, B, this.x[12], 6, 1700485571)),
        (B = h(B, s, v, p, this.x[3], 10, -1894986606)),
        (p = h(p, B, s, v, this.x[10], 15, -1051523)),
        (v = h(v, p, B, s, this.x[1], 21, -2054922799)),
        (s = h(s, v, p, B, this.x[8], 6, 1873313359)),
        (B = h(B, s, v, p, this.x[15], 10, -30611744)),
        (p = h(p, B, s, v, this.x[6], 15, -1560198380)),
        (v = h(v, p, B, s, this.x[13], 21, 1309151649)),
        (s = h(s, v, p, B, this.x[4], 6, -145523070)),
        (B = h(B, s, v, p, this.x[11], 10, -1120210379)),
        (p = h(p, B, s, v, this.x[2], 15, 718787259)),
        (v = h(v, p, B, s, this.x[9], 21, -343485551)),
        (this.state[0] = e(s, this.state[0])),
        (this.state[1] = e(v, this.state[1])),
        (this.state[2] = e(p, this.state[2])),
        (this.state[3] = e(B, this.state[3]));
    }

    end(asBytes: boolean): ArrayBuffer | string {
      var n = this.length * 8;
      this.buffer[this.length % 64] = 128;
      for (var t = this.length % 64 + 1; t < 64; t++) {
        this.buffer[t] = 0;
      }
      if (this.length % 64 > 55) {
        this.process();
        for (t = 0; t < 56; t++) {
          this.buffer[t] = 0;
        }
      }
      for (t = 0; t < 8; t++) {
        this.buffer[56 + t] = (n >> (t * 8)) & 255;
      }
      this.process();

      if (asBytes) {
        var e = new ArrayBuffer(16);
        var o = new Uint8Array(e);
        for (var r = 0; r < 4; r++) {
          for (var t = 0; t < 4; t++) {
            o[r * 4 + t] = (this.state[r] >> (t * 8)) & 255;
          }
        }
        return e;
      } else {
        var c = "";
        for (r = 0; r < 4; r++) {
          for (t = 0; t < 4; t++) {
            var f = (this.state[r] >> (t * 8)) & 255;
            c += (f < 16 ? "0" : "") + f.toString(16);
          }
        }
        return c;
      }
    }
  }
}