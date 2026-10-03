import { describe, expect, it } from "vitest";
import { exerciseKeyFromFilename } from "./exercise-video-filename";

const keys = new Set(["barbell_squat", "cat_cow", "plank"]);

describe("exerciseKeyFromFilename", () => {
  it("matches a plain exercise-key filename", () => {
    expect(exerciseKeyFromFilename("barbell_squat.mp4", keys)).toBe("barbell_squat");
  });

  it("matches the bucket's key-timestamp form", () => {
    expect(exerciseKeyFromFilename("cat_cow-1788697816838.mp4", keys)).toBe("cat_cow");
  });

  it("is case-insensitive and ignores the extension type", () => {
    expect(exerciseKeyFromFilename("Plank.MOV", keys)).toBe("plank");
  });

  it("returns null for an unknown exercise", () => {
    expect(exerciseKeyFromFilename("IMG_4021.mp4", keys)).toBeNull();
    expect(exerciseKeyFromFilename("barbell_squat_v2.mp4", keys)).toBeNull();
  });
});
