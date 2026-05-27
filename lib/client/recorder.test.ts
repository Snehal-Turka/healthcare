import { describe, expect, it } from "vitest";
import {
  describeRecordingError,
  selectRecorderMimeType,
} from "@/lib/client/recorder";

describe("selectRecorderMimeType", () => {
  it("uses opus webm when supported", () => {
    const type = selectRecorderMimeType((candidate) =>
      candidate === "audio/webm;codecs=opus",
    );

    expect(type).toBe("audio/webm;codecs=opus");
  });

  it("falls back to an mp4 type when webm is unsupported", () => {
    const type = selectRecorderMimeType((candidate) =>
      candidate === "audio/mp4",
    );

    expect(type).toBe("audio/mp4");
  });

  it("returns an empty type when no preferred mime type is supported", () => {
    const type = selectRecorderMimeType(() => false);

    expect(type).toBe("");
  });
});

describe("describeRecordingError", () => {
  it("asks users to manually allow access when microphone permission is denied", () => {
    const result = describeRecordingError({
      name: "NotAllowedError",
      message: "Permission denied",
    });

    expect(result.kind).toBe("permission-denied");
    expect(result.message).toContain("Allow microphone permission");
  });

  it("explains when no microphone device is available", () => {
    const result = describeRecordingError({
      name: "NotFoundError",
      message: "Requested device not found",
    });

    expect(result.kind).toBe("device-not-found");
    expect(result.message).toContain("No microphone was found");
  });

  it("explains when the browser cannot use recording APIs", () => {
    const result = describeRecordingError({
      name: "TypeError",
      message: "Cannot read properties of undefined",
    });

    expect(result.kind).toBe("unsupported");
    expect(result.message).toContain("Recording is not available");
  });
});
