import { AudioTrack } from "../../mixer-main/audio-analysis/audio-track.js";
import { otherControls } from "../../KMN-gl-synth.js/otherControls.js";
import SynthController from "../../KMN-gl-synth.js/synth-controller.js";
import { SynthMixer } from "../../KMN-gl-synth.js/webgl-synth-data.js";
import WebGLSynth from "../../KMN-gl-synth.js/webgl-synth.js";
import PanZoomControl from "../../KMN-utils-browser/pan-zoom-control.js";
import { AudioView } from "./audio-view.js";
import { ControlLineEditor } from "./control-line-editor.js";

export class AudioEditor {
  constructor (options) {
    this.options = options;
    this.updateCanvasBound = this.updateCanvas.bind(this);
    this.onClick = (x,y) => true;
  }

  /**
   * @param {HTMLElement} parentElement
   */
  initializeDOM(parentElement) {
    this.control = new PanZoomControl(parentElement, {
      minYScale: 1.0,
      maxYScale: 1.0,
      minXScale: 1.0,
      maxXScale: 1000.0
    });

    this.audioView = new AudioView({ 
      canvas: this.options.canvas, 
      control: this.control, 
      noRequestAnimationFrame: true });

    this.audioView.initializeDOM(parentElement);
    this.audioView.onClick = (x,y) => {
      if (this.onClick(x,y)) {
       this.handleViewClick(x,y);
      }
    }
    this.audioView.onGetPlayPos = this.handleGetPlayPos.bind(this);
    
    // this.lineEdit = new ControlLineEditor({ canvas: synth.canvas});
    this.lineEdit = new ControlLineEditor({ 
      canvas: this.options.canvas, 
      control: this.control, 
      noRequestAnimationFrame: true });
    this.lineEdit.initializeDOM(parentElement);

    if (!this.options.noRequestAnimationFrame) {
      window.requestAnimationFrame(this.updateCanvasBound);
    }
  }

  cancelPlaying() {
    if (this.note || this.audioTrigger) {
      if (this.note) this.note.isFinished = true;
      this.note = null;
      if (this.audioTrigger) {
        this.synth.playData.deleteTrigger(this.audioTrigger);
        this.audioTrigger = null;
      }
      return true;
    }
    return false;
  }

  handleViewClick(x,y) {
    this.synth.playData.syncTime('analyze-view',performance.now()/1000.0);
    this.noteStartTime = performance.now() / 1000.0;
    if (this.cancelPlaying()) {
      return;
    }

    this.audioOffset = x * this.audioTrack.duration;
    
    // Just play until end
    if (this.options.playOptions.playMode.$v) {
      this.note = this.synth.playData.addNote(
        this.noteStartTime,
        'analyze-view',
        0,
        this.playInput,
        {
          audioOffset: this.audioOffset,
          channel: 0,
          note: this.audioTrack.trackIndex,
          velocity: 1.0
        });
      this.note.release(this.noteStartTime + this.audioTrack.duration - this.audioOffset, 1.0, 8.0);
      this.lastNote = undefined;
      return;
    }

    // track.foundStartOffset = foundStartOffset;
    // track.modulusAvg = modulusAvg;
    console.log('Start: ',this.audioTrack.modulusAvg,
                      x * this.audioTrack.duration,x,this.audioTrack.duration);
    // this.repeatTime = this.synth.bufferTime * 12.0;
    const playNote = () => {
      this.repeatBeats =  Math.round((this.options.playOptions.playLength.$v+(1/6)) * 6.0);
      this.repeatBeats = Math.pow(2,this.repeatBeats);
      this.repeatTime = this.repeatBeats* 
                        (this.audioTrack.modulusAvg * this.audioTrack.duration / this.audioTrack.analyzeLength);
      console.log('repeat beats ',this.repeatBeats);

      this.lastNote = this.note;
      this.note = this.synth.playData.addNote(
        this.noteStartTime,
        'analyze-view',
        0,
        this.playInput,
        {
          audioOffset: this.audioOffset,
          channel: 0,
          note: this.audioTrack.trackIndex,
          velocity: 1.0
        });
      this.note.release(this.noteStartTime + this.repeatTime, 1.0, 8.0);
      this.note.controlData.addControl(
        this.noteStartTime,
        otherControls.aftertouch, 1.0, true);

      for (let point of this.lineEdit.points) {
        // if (point.time >= this.audioOffset) {
          this.note.controlData.addControl(
            this.noteStartTime +  point.time - this.audioOffset,
            otherControls.aftertouch, point.value, true);
            // console.log(this.audioOffset, point);
        // }
        // if (point.time > this.audioOffset + this.repeatTime) {
        // }
      }

      // console.log('notes: ', this.note, this.lastNote);
      this.noteStartTime += this.repeatTime;
      this.audioTrigger = this.synth.playData.triggerOnTime('analyze-view',this.noteStartTime-0.2,() => {
        playNote();
      });
    }
    playNote();
  }

  handleGetPlayPos() {
    if (this.note) {
      let offset = -1;
      let realSynthTime = this.synth.synthTime - this.synthController.latencyTimeAvg / 1000.0;
      if (this.lastNote && (realSynthTime < this.lastNote.synthEnd) && 
         ( (realSynthTime < this.note.synthStart) || (realSynthTime > this.note.synthEnd)) &&
         (realSynthTime >= this.lastNote.synthStart)) {
        offset = this.lastNote.audioOffset + realSynthTime - this.lastNote.synthStart
      } else if (realSynthTime < this.note.synthEnd) {
        let notePos = realSynthTime - this.note.synthStart
        if (notePos> 0) {
          offset = this.note.audioOffset + notePos;
        }
      }
      if (offset>0) {
        const scale = this.control.xScale;
        // offset = this.newOffset * 0.75 + 0.25 * (offset+0.1);// 0.2 sligth forward lag correction
        let xPos = offset / this.audioTrack.duration
        let xOffset = xPos - ( 0.5 / scale);
        // this.analyzeView.control.xOffset = this.analyzeView.control.xOffset * 0.8 + .2 * xOffset;
        // this.analyzeView.control.restrictPos();
        this.newOffset = offset;
        return (this.newOffset / this.audioTrack.duration) * this.audioTrack.analyzeLength;
      }
    }
    return -100;
  }

  updateCanvas() {
    this.audioView.updateCanvas();
    this.lineEdit.updateCanvas();
    if (!this.options.noRequestAnimationFrame) {
      window.requestAnimationFrame(this.updateCanvasBound);
    }
  }

  /**
   * @param {SynthController} synthController
   */
  setSynth(synthController) {
    this.synthController = synthController;
    this.synth = synthController.webGLSynth;
    this.audioView.setSynth(this.synth);
    this.playInput = new SynthMixer(this.synth.playData.output, 'playInput');
  }

  /**
   * 
   * @param {AudioTrack} audioTrack 
   * @param {Object} recordAnalyzeBuffer
   * @param {Object} recordAnalyzeBuffer
   */
  setAudioTrack(audioTrack, recordAnalyzeBuffer, beatBuffer) {
    this.audioTrack = audioTrack;
    this.audioView?.setOffsetAndLength(recordAnalyzeBuffer,
      this.audioTrack.analyzeOffset, this.audioTrack.analyzeLength);
    this.audioView?.setBeatData(beatBuffer);
    this.lineEdit.udatePoints(
      [
        {
          time: 0.0,
          value: 0.7
        },
        {
          time: this.audioTrack.duration,
          value: 0.7
        }
      ],
      this.audioTrack.duration)
    this.cancelPlaying();
  }
}