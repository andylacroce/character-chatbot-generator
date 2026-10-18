import { randomDrift } from "./carouselDrift";

describe("randomDrift", () => {
  it("keeps scales and offsets inside the range that hides the image edges", () => {
    for (let i = 0; i < 200; i++) {
      const d = randomDrift();
      for (const s of [d.scaleFrom, d.scaleTo]) {
        expect(s).toBeGreaterThanOrEqual(1.08);
        expect(s).toBeLessThanOrEqual(1.28);
      }
      for (const o of [d.fromX, d.fromY, d.toX, d.toY])
        expect(Math.abs(o)).toBeLessThanOrEqual(2.5);
    }
  });

  it("zooms in or out depending on the random draw", () => {
    const zoomIn = randomDrift(() => 0.1);
    const zoomOut = randomDrift(() => 0.9);
    expect(zoomIn.scaleTo).toBeGreaterThan(zoomIn.scaleFrom);
    expect(zoomOut.scaleTo).toBeLessThan(zoomOut.scaleFrom);
  });
});
