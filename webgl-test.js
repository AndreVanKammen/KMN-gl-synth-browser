import SynthController from "../KMN-gl-synth.js/synth-controller.js";
import { SynthMixer } from "../KMN-gl-synth.js/webgl-synth-data.js";
import defer from "../KMN-utils.js/defer.js";
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
          bufferHeight: 1024,
          bufferCount: 2,
          // TODO: #MaxChannelCount + 2 only increase if needed, now synth runs slower!
          outputBufferCount: 1
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

  _testEmptySynth()    {
    let start = performance.now();
    let processBufferNr = this.synthController.webGLSynth.calculateSamples();
    let buffer = this.synthController.webGLSynth.getCalculatedSamples(processBufferNr);
    for (let ix = 1; ix < 200; ix++) {
      let processBufferNr = this.synthController.webGLSynth.calculateSamples();
      this.synthController.webGLSynth.getCalculatedSamples(processBufferNr);
    }
    let stop = performance.now();
    let duration = buffer.length / 2 * 200 / this.synthController.webGLSynth.sampleRate;
    let perf = stop - start;
    this.logToOutput(`_testEmptySynth ${duration.toFixed(2)} seconds: ${perf.toFixed(2)}ms speed ${(duration/perf*1000).toFixed(2)}*`);
    this.logBuffer(buffer)
  }

  _testSingleNote() {
    let testMixer = new SynthMixer(this.synthController.playData.output);
    let noteMixer = new SynthMixer(testMixer, 'sine');

    const noteData = { note: 84, velocity: 1.0, channel: 1 }
    const noteEntry = this.synthController.playData.addNote(this.synthController.webGLSynth.synthTime, 'none', 1, noteMixer, noteData);
    let start = performance.now();
    let processBufferNr = this.synthController.webGLSynth.calculateSamples();
    let buffer = this.synthController.webGLSynth.getCalculatedSamples(processBufferNr);
    let bufNr1 = this.synthController.webGLSynth.calculateSamples();
    for (let ix = 2; ix < 200; ix++) {
      let bufNr2 = this.synthController.webGLSynth.calculateSamples();
      // this.synthController.webGLSynth.getCalculatedSamples(bufNr1);
      bufNr1 = bufNr2;
    }
    this.synthController.webGLSynth.getCalculatedSamples(bufNr1);
    let stop = performance.now();
    noteEntry.release();
    let duration = buffer.length / 2 * 200 / this.synthController.webGLSynth.sampleRate;
    let perf = stop - start;
    this.logToOutput(`_testSingleNote ${duration.toFixed(2)} seconds: ${perf.toFixed(2)}ms speed ${(duration/perf*1000).toFixed(2)}*`);
    this.logBuffer(buffer)

    this.synthController.playData.clear();
    testMixer.dispose();
    noteMixer.dispose();
  }

  _test100Note() {
    let testMixer = new SynthMixer(this.synthController.playData.output);
    let noteMixer = new SynthMixer(testMixer, 'sine');

    let noteEntries = [];
    for (let ix = 0; ix < 100; ix++) {
      const noteData = { note: 16 + ix, velocity: 1.0, channel: 1 };
      noteEntries.push(this.synthController.playData.addNote(this.synthController.webGLSynth.synthTime, 'none', 1, noteMixer, noteData));
    }
    let start = performance.now();
    let processBufferNr = this.synthController.webGLSynth.calculateSamples();
    let buffer = this.synthController.webGLSynth.getCalculatedSamples(processBufferNr);
    let bufNr1 = this.synthController.webGLSynth.calculateSamples();
    for (let ix = 2; ix < 200; ix++) {
      let bufNr2 = this.synthController.webGLSynth.calculateSamples();
      this.synthController.webGLSynth.getCalculatedSamples(bufNr1);
      bufNr1 = bufNr2;
    }
    this.synthController.webGLSynth.getCalculatedSamples(bufNr1);
    let stop = performance.now();
    for (let ix = 0; ix < 100; ix++) {
      noteEntries[ix].release();
    }
    let duration = buffer.length / 2 * 200 / this.synthController.webGLSynth.sampleRate;
    let perf = stop - start;
    this.logToOutput(`_test100Note ${duration.toFixed(2)} seconds: ${perf.toFixed(2)}ms speed ${(duration/perf*1000).toFixed(2)}*`);
    this.logBuffer(buffer)

    this.synthController.playData.clear();
    testMixer.dispose();
    noteMixer.dispose();
  }

  _test100NoteDFT() {
    let testMixer = new SynthMixer(this.synthController.playData.output);
    testMixer.addEffect('DFT');
    testMixer.addEffect('iDFT');
    let noteMixer = new SynthMixer(testMixer, 'sine');

    let noteEntries = [];
    for (let ix = 0; ix < 100; ix++) {
      const noteData = { note: 16 + ix, velocity: 1.0, channel: 1 };
      noteEntries.push(this.synthController.playData.addNote(this.synthController.webGLSynth.synthTime, 'none', 1, noteMixer, noteData));
    }
    let start = performance.now();
    let processBufferNr = this.synthController.webGLSynth.calculateSamples();
    let buffer = this.synthController.webGLSynth.getCalculatedSamples(processBufferNr);
    let bufNr1 = this.synthController.webGLSynth.calculateSamples();
    for (let ix = 2; ix < 200; ix++) {
      let bufNr2 = this.synthController.webGLSynth.calculateSamples();
      // this.synthController.webGLSynth.getCalculatedSamples(bufNr1);
      bufNr1 = bufNr2;
    }
    this.synthController.webGLSynth.getCalculatedSamples(bufNr1);
    let stop = performance.now();
    for (let ix = 0; ix < 100; ix++) {
      noteEntries[ix].release();
    }
    let duration = buffer.length / 2 * 200 / this.synthController.webGLSynth.sampleRate;
    let perf = stop - start;
    this.logToOutput(`_test100NoteDFT ${duration.toFixed(2)} seconds: ${perf.toFixed(2)}ms speed ${(duration/perf*1000).toFixed(2)}*`);
    this.logBuffer(buffer)

    this.synthController.playData.clear();
    testMixer.dispose();
    noteMixer.dispose();
  }

  logBuffer(buffer) {
    return;
    let resultStr = '';
    for (let ix = 0; ix < 256; ix++) {
      if (ix % 16 === 0) {
        resultStr += '\n';
      }
      resultStr += (buffer[ix * 2] + 1).toFixed(2) + ' ';
    }
    this.logToOutput(resultStr);
  }

  testSynth() {
    this.logToOutput('Test synth')
    this.synthController.ensureStarted();
    const tests = [this._testEmptySynth, this._testSingleNote, this._test100Note, this._test100NoteDFT];
    let currentTestIx = 0;
    const doTest = () => {
      let test = tests[currentTestIx++];
      test.apply(this);
      if (currentTestIx < tests.length) {
        defer(doTest);
      }
    }
    defer(doTest);
  }

}