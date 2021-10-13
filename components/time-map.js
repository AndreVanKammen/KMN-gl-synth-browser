class TimeMap {
  constructor(resolution = 512 / 44100) {
    this.map = []; // map from sourcetime to tracktime
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

    let sourceTime = pt.sourceTime; // Should be 0
    let trackTime = pt.trackTime;
    while (tpIx < this.points.length) {
      let nextPt = this.points[tpIx++];
      let trackDelta = nextPt.trackTime - pt.trackTime;
      let sourceEndTime = pt.sourceTime
      sourceEndTime -= sourceEndTime % this.resolution;
      let sourceDelta = nextPt.sourceTime - sourceEndTime ;
      let trackStep = (trackDelta / sourceDelta) 
      while (sourceTime < nextPt.sourceTime) {
        sourceTime += this.resolution;
        this.map.push(trackTime);
      }

    }
  }
}