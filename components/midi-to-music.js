import { otherControls } from "../../KMN-gl-synth.js/otherControls.js";
import { MusicInterface, NoteInterface } from "../interfaces/music-interface.js";

export class MidiToMusic {
  constructor() {
    this.messageCount = 0;
    /** @type {Array<NoteInterface>} */
    this.notes = [];
    /** @type {MusicInterface} */
    this.music = null;
  }

  handleMessage(controlName, channel, cmd, note, time, value) {

    const NOTE_ON = 9;
    const NOTE_OFF = 8; // my keyboard sends NOTE_ON with velocity 0
    const timeZone = 'midi-kbd-' + controlName;

    const synthTime = this.music.getTime(timeZone);
    if (synthTime > 0 && Math.abs(synthTime-time) > 0.100) {
      console.log('Time sync: ',synthTime, time);
      this.music.syncTime(timeZone, time, true);
    }
    if (this.messageCount === 0) {
      this.music.controller(time, timeZone, channel, otherControls.pitchRange, 6);
    }
    this.messageCount++;
    const noteKey = channel * 127 + note;

    if (cmd === 11) {
      let val = value / 127;
      this.music.controller(time, timeZone, channel, note, val);
      return;
    }
    //https://ccrma.stanford.edu/~craig/articles/linuxmidi/misc/essenmidi.html
    //0x80	Note-off	            2	key	velocity
    //0x90	Note-on	              2	key	veolcity
    //0xA0	Aftertouch  	        2	key	touch
    //0xB0	Continuous controller	2	controller #	controller value
    //0xC0	Patch change	        2	instrument #	
    //0xD0	Channel Pressure	    1	pressure
    //0xF0	(non-musical commands)
    //0xE0	Pitch bend	          2	lsb (7 bits)	msb (7 bits)
    if (cmd === 10) {
      let val = value / 127;
      if (this.notes[noteKey]) {
        this.notes[noteKey].changeControl(time, otherControls.aftertouch, val);
      }
    }

    if (cmd === 12) {
      // Program change
      // this.onProgramChange(time, channel, event.data[1]);
      this.music.controller(time, timeZone, channel, otherControls.program, note);
    }
    if (cmd === 13) {
      this.music.controller(time, timeZone, channel, otherControls.pressure, note / 127);
    }
    if (cmd === 14) {
      // So here is a strange decision, pitch goes from 0 - 127
      // That would make 63.5 the center value but according to
      // specs it is 64. That would make for a strange balance
      // because there are 63 values for up but 64 (0..63) for
      // down i tried to fix it like this, but don't know if it is correct
      // Read somwhere else that up is almost so that misses the last value
      // if no lsb i guess which my latest kbd tries to 
      // lsb is in note 
      value += note / 128;
      // let val =  (value + Math.max(0.0,(value - 64) * (1/63))) / 64 - 1.0
      let val = value / 64 - 1.0;
      // console.log(value,note,val);

      // TODO implement LSB for pitchwheel (my keyboard doesn't have it but 
      // some might) It also could solve the inaacuracy problem above because 
      // the difference between being 1/64 of key or 1/16384 which is 256 times 
      // more precise, My new Roland kbd also does not support LSB just increases 
      // it on the up pitch witch basicly does the same as my correction formula above

      // New Roland A-300 keyboard only set lsb for up bends, last 2 data values
      // 118,123
      // 120 124
      // 122 125
      // 124 126
      // 127,127
     
      this.music.controller(time, timeZone, channel, otherControls.pitch, val);
      return;
    }

    if (cmd === NOTE_ON && value > 0) {
      if (this.notes[noteKey]) {
        console.log('velocity update: ', value / 127);
      }
      this.notes[noteKey] = this.music.note(time, timeZone, channel, note, value / 127);
    }
    if (cmd === NOTE_OFF || (cmd === NOTE_ON && value === 0)) {
      if (this.notes[noteKey]) {
        this.notes[noteKey].release(time, 
          (cmd === NOTE_ON) ? -1.0 :
          value / 127); // Also send release velocity, my new kbd supports this
      } else {
        console.log('note not found!');
      }
      this.notes[noteKey] = undefined;
    }
  }
}
