class TimeMap {
  constructor(resolution = 44100 / 2048) {
    this.map = [];
    this.points = [];
    this.resolution = resolution;
  }

  setDuration(trackDuration) {
    this.trackDuration = trackDuration;
  }

  addTimePoint(sourceTime, trackTime) {
    this.points.push({ sourceTime, trackTime });
  }

  update() {
    if (this.points.length < 2) {
      return;
    }
    let tpIx = 1;
    let pt = this.points[0];
    let sourceTime = pt.sourceTime;
    let trackTime = pt.trackTime;

    while (tpIx < this.points.length) {
      let nextPt = this.points[0];
      while (sourceTime < nextPt.sourceTime) {
        sourceTime += this.resolution;
        this.map.push(trackTime);
      }

    }
  }
}