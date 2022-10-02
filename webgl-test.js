import SynthController from "../KMN-gl-synth.js/synth-controller.js";
import { SynthMixer } from "../KMN-gl-synth.js/webgl-synth-data.js";
import { addCSS, kmnClassName } from "../KMN-varstack-browser/utils/html-utils.js";

const cssStr = /*css*/`
.${kmnClassName}.test-menu-button {
  float: right;
  width: 120px;
  height: 20px;
  margin: 8px;
}
.${kmnClassName}.output-pre {
  top: 36px;
  background: black;
  font-family: sans-serif;
  font-size: 15px;
  height: calc(100% - 52px);
  width: calc(100% - 16px);
  padding: 8px;
  word-wrap: break-word;
  white-space: pre-wrap;
  overflow: auto;
}
`;

export class WebGLTest {
  constructor() {
  }

  initializeDOM(parentElement, canvas) {
    addCSS('webgl-test', cssStr);
    this.parentElement = parentElement;
    this.canvas = canvas;

    this.synthController = new SynthController({
      ...{
        skipAudio: true,
        keepInBuffer: 3 * 1024,
        webgl: {
          bufferWidth: 2048,
          bufferHeight: 2048,
          bufferCount: 2,
          // TODO: #MaxChannelCount + 2 only increase if needed, now synth runs slower!
          outputBufferCount: 1 + (8 * 8)
        },
        audioOutput: {
          sampleRate: 44100
        }
      }
    });

    this.output = this.parentElement.$el({ tag: 'pre', cls: 'output-pre' });
    this.testButton = this.parentElement.$button('SYNTH', () => {
      this.testSynth();
    }, 'test-menu-button');
    this.testButton2 = this.parentElement.$button('TEST2', () => {
      this.output.innerHTML += 'Nog een test\n';
    }, 'test-menu-button');
  }

  logToOutput(s) {
    this.output.innerHTML += s + '\n';
  }

  testSynth() {
    this.logToOutput('Test synth')
    this.synthController.ensureStarted();
    let start = performance.now();
    this.synthController.webGLSynth.calculateSamples();
    let buffer = this.synthController.webGLSynth.getCalculatedSamples();
    for (let ix = 1; ix < 100; ix++) {
      this.synthController.webGLSynth.calculateSamples();
      this.synthController.webGLSynth.getCalculatedSamples();
    }
    let stop = performance.now();
    this.logToOutput('\nEmpty test 100 loops: ' + (stop - start).toFixed(2) + 'ms');
    this.logBuffer(buffer)

    this.testMixer = new SynthMixer(this.synthController.playData.output);
    this.noteMixer = new SynthMixer(this.testMixer, 'sine');

    const noteData = { note: 84, velocity: 1.0, channel: 1 }
    const noteEntry = this.synthController.playData.addNote(this.synthController.webGLSynth.synthTime, 'none', 1, this.noteMixer, noteData);
    const noteData2 = { note: 64, velocity: 1.0, channel: 1 }
    const noteEntry2 = this.synthController.playData.addNote(this.synthController.webGLSynth.synthTime, 'none', 1, this.noteMixer, noteData2);
    start = performance.now();
    this.synthController.webGLSynth.calculateSamples();
    buffer = this.synthController.webGLSynth.getCalculatedSamples();
    for (let ix = 1; ix < 100; ix++) {
      this.synthController.webGLSynth.calculateSamples();
      this.synthController.webGLSynth.getCalculatedSamples();
    }
    stop = performance.now();
    noteEntry.release();
    noteEntry2.release();
    this.logToOutput('\nNote test 100 loops: ' + (stop - start).toFixed(2) + 'ms '+this.synthController.webGLSynth.outputTexture.buffers[0]);
    this.logBuffer(buffer)
  }

  logBuffer(buffer) {
    let resultStr = '';
    for (let ix = 0; ix < 256; ix++) {
      if (ix % 16 === 0) {
        resultStr += '\n';
      }
      resultStr += (buffer[ix * 2] + 1).toFixed(2) + ' ';
    }
    this.logToOutput(resultStr);
  }




}