/**
 * Random push-in/pull-out drift for the landing carousel's backdrop portraits, shared by
 * web (CSS custom properties) and mobile (Animated interpolation) so both move alike.
 * Every portrait gets its own zoom direction, zoom range and drift path. Scales stay at
 * or above 1.08 and offsets within 2.5%, so the image edges never show.
 */

/** Start and end of one portrait's motion; x/y are percentages of the image size. */
export interface DriftSpec {
  scaleFrom: number;
  scaleTo: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

/** Returns a fresh random DriftSpec; `rand` (0 to 1) is injectable for tests. */
export function randomDrift(rand: () => number = Math.random): DriftSpec {
  const between = (min: number, max: number) => min + rand() * (max - min);
  const small = between(1.08, 1.14);
  const large = between(1.18, 1.28);
  const zoomIn = rand() < 0.65;
  return {
    scaleFrom: zoomIn ? small : large,
    scaleTo: zoomIn ? large : small,
    fromX: between(-2.5, 2.5),
    fromY: between(-2.5, 2.5),
    toX: between(-2.5, 2.5),
    toY: between(-2.5, 2.5),
  };
}
