export class NoteInterface {
  /**
   * Release a note
   * @param {number} time Time it was relased
   * @param {number} releaseVelocity The velocity it was released at
   */
  release = (time, releaseVelocity) => {}
  /**
   * Change the value of a note control
   * @param {number} time Change time in milliseconds, is synced on the 1st noet
   * @param {number} controlType The midi control number or otherControls number 
   * @param {number} controlData Normalized to 0..1 exceptions are pitch -1..1 and programNr 0..127
   */
  changeControl = (time, controlType, controlData) => {}
  /** helpfull for implementation of sustain pedal */
  readyForRelease = false
}
export class MusicInterface {
  /**
   * Clears all data in the synth
   */
  clear = () => {
    console.error('Music clear not implemented!')
  };
  /**
   * Preloads the given programs for faster start
   * @param {number[]} usedInstruments List of instrument numbers
   */
  preLoadPrograms = (usedInstruments) => {
    console.error('Music preLoadPrograms not implemented!')
  };
  /**
   * Plays a note
   * @param {number} time Startime in seconds, is synced on the 1st noet
   * @param {string} timeZone Identifier for the time of this device also used as device id
   * @param {number} channel The mnidi channel for this note
   * @param {number} note The note to play
   * @param {number} velocity The velocity of the note normalized from 0..1
   * @returns {NoteInterface}
   */
  note = (time, timeZone, channel, note, velocity) => {
    console.error('Music note not implemented!')
    return null;
  };
  /**
   * Change the value of a control
   * @param {number} time Change time in seconds, is synced on the 1st noet
   * @param {string} timeZone Identifier for the time of this device also used as device id
   * @param {number} channel The midi channel for this note
   * @param {number} controlType The midi control number or otherControls number 
   * @param {number} controlData Normalized to 0..1 exceptions are pitch -1..1 and programNr 0..127
   */
  controller = (time, timeZone, channel, controlType, controlData) => {
    console.error('Music controller not implemented!')
  }
  /**
   * Synchronize the time with the synth
   * @param {string} timeZone Identifier for the time of this device also used as device id
   * @param {number} time Time in seconds
   */
  syncTime = (timeZone, time) => {
    console.error('Music syncTime not implemented!')
  }
  /**
   * Get the time with the synth
   * @param {string} timeZone Identifier for the time of this device also used as device id
   * @returns {number} Time in seconds for the current timezone
   */
   getTime = (timeZone) => {
     console.error('Music getTime not implemented!')
     return 0;
  }
  /**
   * Register callback to be called befire the given time
   * @param {string} timeZone Identifier for the time of this device also used as device id
   * @param {number} time Time in seconds
   * @param {()=>void} callback
   */
   triggerOnTime = (timeZone, time, callback) => {
    console.error('Music triggerOnTime not implemented!')
    return 0;
  }
  deleteTrigger = (instance) => {
    console.error('Music deleteTrigger not implemented!')
  }
}
