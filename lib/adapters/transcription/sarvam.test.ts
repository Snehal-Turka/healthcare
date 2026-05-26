import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SarvamTranscriptionProvider } from "@/lib/adapters/transcription/sarvam";

/** Stub the real-time speechToText client used by transcribeChunk. */
function chunkClient(
  res: { transcript: string; language_code?: string },
  transcribe = vi.fn().mockResolvedValue(res),
) {
  return {
    client: { speechToText: { transcribe } } as never,
    transcribe,
  };
}

/** A completed batch job whose single file transcribed successfully. */
function completedJobsStub(overrides: Record<string, unknown> = {}) {
  return {
    initialise: vi.fn(async () => ({
      job_id: "job-1",
      storage_container_type: "Azure",
      job_parameters: {},
      job_state: "Accepted",
    })),
    getUploadLinks: vi.fn(async () => ({
      job_id: "job-1",
      job_state: "Accepted",
      storage_container_type: "Azure",
      upload_urls: { "audio.webm": { file_url: "https://up.example/put" } },
    })),
    start: vi.fn(async () => ({})),
    getStatus: vi.fn(async () => ({
      job_state: "Completed",
      created_at: "",
      updated_at: "",
      job_id: "job-1",
      storage_container_type: "Azure",
      job_details: [
        {
          state: "Success",
          inputs: [{ file_name: "audio.webm", file_id: "i" }],
          outputs: [{ file_name: "audio.webm.json", file_id: "o" }],
        },
      ],
    })),
    getDownloadLinks: vi.fn(async () => ({
      job_id: "job-1",
      job_state: "Completed",
      storage_container_type: "Azure",
      download_urls: {
        "audio.webm.json": { file_url: "https://down.example/get" },
      },
    })),
    ...overrides,
  };
}

function stubFetch() {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") return { status: 200 } as Response;
    return {
      ok: true,
      status: 200,
      json: async () => ({ transcript: "hello world", language_code: "en-IN" }),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("SarvamTranscriptionProvider", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  describe("transcribeChunk (real-time, <=30s segments)", () => {
    it("calls saaras:v3 in transcribe mode and maps the response", async () => {
      const { client, transcribe } = chunkClient({
        transcript: "Patient reports low mood.",
        language_code: "hi-IN",
      });
      const provider = new SarvamTranscriptionProvider(client);

      const result = await provider.transcribeChunk(
        new Uint8Array([1, 2, 3]),
        "audio/webm",
      );

      expect(transcribe).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "saaras:v3",
          mode: "transcribe",
          language_code: "unknown",
        }),
      );
      const arg = transcribe.mock.calls[0][0];
      expect(arg.file.filename).toBe("audio.webm");
      expect(arg.file.contentType).toBe("audio/webm");
      expect(result).toEqual({
        text: "Patient reports low mood.",
        detectedLanguage: "hi-IN",
      });
    });

    it("derives the filename extension from the mime type", async () => {
      const { client, transcribe } = chunkClient({ transcript: "ok" });
      const provider = new SarvamTranscriptionProvider(client);

      await provider.transcribeChunk(new Uint8Array([0]), "audio/mp4");

      expect(transcribe.mock.calls[0][0].file.filename).toBe("audio.m4a");
    });
  });

  describe("transcribeBatch (Batch API, long audio)", () => {
    it("runs the full job flow and returns the downloaded transcript", async () => {
      const jobs = completedJobsStub();
      const fetchMock = stubFetch();
      const provider = new SarvamTranscriptionProvider({
        speechToText: { transcribe: vi.fn() },
        speechToTextJob: jobs,
      } as never);

      const result = await provider.transcribeBatch(
        new Uint8Array([1, 2, 3]),
        "audio/webm",
      );

      expect(result).toEqual({ text: "hello world", detectedLanguage: "en-IN" });

      expect(jobs.initialise).toHaveBeenCalledWith(
        expect.objectContaining({
          job_parameters: expect.objectContaining({ model: "saaras:v3" }),
        }),
      );
      expect(jobs.start).toHaveBeenCalledWith("job-1");
      expect(jobs.getDownloadLinks).toHaveBeenCalledWith({
        job_id: "job-1",
        files: ["audio.webm.json"],
      });

      // upload is a PUT to the presigned URL carrying the Azure blob header
      const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
      expect(put?.[0]).toBe("https://up.example/put");
      expect(
        (put?.[1]?.headers as Record<string, string>)["x-ms-blob-type"],
      ).toBe("BlockBlob");
    });

    it("throws when the job fails", async () => {
      const jobs = completedJobsStub({
        getStatus: vi.fn(async () => ({
          job_state: "Failed",
          created_at: "",
          updated_at: "",
          job_id: "job-1",
          storage_container_type: "Azure",
          error_message: "bad audio",
        })),
      });
      stubFetch();
      const provider = new SarvamTranscriptionProvider({
        speechToText: { transcribe: vi.fn() },
        speechToTextJob: jobs,
      } as never);

      await expect(
        provider.transcribeBatch(new Uint8Array([1]), "audio/webm"),
      ).rejects.toThrow(/bad audio/);
    });
  });

  it("throws when no api key is configured", () => {
    expect(() => new SarvamTranscriptionProvider(undefined, "")).toThrow(
      /SARVAM_API_KEY/,
    );
  });
});
