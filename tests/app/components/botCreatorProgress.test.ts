import {
  buildProgressStages,
  progressSteps,
} from "../../../src/app/components/character/botCreatorProgress";

describe("buildProgressStages", () => {
  it("marks earlier steps done and the current one active", () => {
    const stages = buildProgressStages("avatar", null);
    expect(stages.map((s) => [s.done, s.active])).toEqual([
      [true, false],
      [false, true],
      [false, false],
    ]);
  });

  it("uses the step's own label with an ellipsis by default", () => {
    const stages = buildProgressStages("personality", null);
    expect(stages[0].label).toBe(`${progressSteps[0].label}…`);
  });

  it("lets a mid-step message replace only the active row's label", () => {
    const stages = buildProgressStages("avatar", "Using default image");
    expect(stages[1].label).toBe("Using default image");
    expect(stages[0].label).toBe(`${progressSteps[0].label}…`);
    expect(stages[2].label).toBe(`${progressSteps[2].label}…`);
  });

  it("has nothing done or active when there is no current step", () => {
    const stages = buildProgressStages(null, "ignored");
    expect(stages.every((s) => !s.done && !s.active)).toBe(true);
    expect(stages.map((s) => s.label)).not.toContain("ignored");
  });
});
