/** A polyline for lifts and movers: positions along it by distance travelled. */
export class Path {
  readonly pts: [number, number][];
  readonly lens: number[] = [];
  readonly total: number;
  constructor(pts: [number, number][], closed: boolean) {
    this.pts = closed && (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1]) ? [...pts, pts[0]] : pts.slice();
    let t = 0;
    for (let i = 0; i + 1 < this.pts.length; i++) {
      const l = Math.hypot(this.pts[i + 1][0] - this.pts[i][0], this.pts[i + 1][1] - this.pts[i][1]);
      this.lens.push(l);
      t += l;
    }
    this.total = t;
  }
  at(s: number): [number, number] {
    let rest = Math.max(0, Math.min(this.total, s));
    for (let i = 0; i < this.lens.length; i++) {
      const l = this.lens[i];
      if (rest <= l || i === this.lens.length - 1) {
        const k = l > 0 ? Math.min(1, rest / l) : 0;
        const [x0, y0] = this.pts[i];
        const [x1, y1] = this.pts[i + 1];
        return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
      }
      rest -= l;
    }
    return this.pts[this.pts.length - 1];
  }
}
