// 40 phons is a reasonable level to take
export const loudness40Phons = {
  frequencies: [
    20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000,
    1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000
  ],
  volumes: [
    99.85, 93.94, 88.17, 82.63, 77.78, 73.08, 68.48, 64.37, 60.59, 56.70,
    53.41, 50.40, 47.58, 44.98, 43.05, 41.34, 40.06, 40.01, 41.82, 42.51,
    39.23, 36.51, 35.61, 36.65, 40.01, 45.83, 51.80, 54.28, 51.49, 51.96, 92.77
  ]
}

export function getVolumeForFrequency(f) {
  for (let ix = 1; ix < loudness40Phons.frequencies.length; ix++) {
    let frequency = loudness40Phons.frequencies[ix];
    if (frequency > f) {
      let lastFrequency = loudness40Phons.frequencies[ix - 1];
      let n = (f - lastFrequency) / (frequency - lastFrequency);
      return n * loudness40Phons.volumes[ix] +
        (1 - n) * loudness40Phons.volumes[ix - 1];
    }
  }
  return 100.0; // Inaudable
}

export function getFrequencyForNote(note) {
  return 8.175798915643707 * Math.pow(2.0, note / 12.0);
}

