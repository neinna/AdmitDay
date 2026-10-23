import { trace } from "@opentelemetry/api";

const mockCtor = jest.fn();
jest.mock("@langfuse/otel", () => ({
  LangfuseSpanProcessor: function (opts: unknown) {
    mockCtor(opts);
    return {
      onStart() {},
      onEnd() {},
      forceFlush: () => Promise.resolve(),
      shutdown: () => Promise.resolve(),
    };
  },
}));

function load() {
  let mod: typeof import("../lib/langfuse-otel");
  let tracing: typeof import("@langfuse/tracing");
  jest.isolateModules(() => {
    tracing = require("@langfuse/tracing");
    mod = require("../lib/langfuse-otel");
  });
  return { ...mod!, getLangfuseTracerProvider: tracing!.getLangfuseTracerProvider };
}

describe("initLangfuseTracing", () => {
  const env = { ...process.env };
  beforeEach(() => {
    mockCtor.mockReset();
    process.env = { ...env };
    delete process.env.LANGFUSE_APP_PUBLIC_KEY;
    delete process.env.LANGFUSE_APP_SECRET_KEY;
  });
  afterAll(() => {
    process.env = env;
  });

  it("returns false and leaves the provider alone when keys are unset", () => {
    const mod = load();
    const before = mod.getLangfuseTracerProvider();
    expect(mod.initLangfuseTracing()).toBe(false);
    expect(mod.getLangfuseTracerProvider()).toBe(before);
    expect(before.constructor.name).not.toBe("BasicTracerProvider");
    expect(mockCtor).not.toHaveBeenCalled();
  });

  it("uses an isolated provider when keys are set, called twice constructs once", () => {
    process.env.LANGFUSE_APP_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_APP_SECRET_KEY = "sk";
    const mod = load();
    expect(mod.initLangfuseTracing()).toBe(true);
    expect(mod.initLangfuseTracing()).toBe(true);
    expect(mockCtor).toHaveBeenCalledTimes(1);
    const provider = mod.getLangfuseTracerProvider();
    expect(provider).not.toBe(trace.getTracerProvider());
    expect(provider.constructor.name).toBe("BasicTracerProvider");
    expect(trace.getTracerProvider()).not.toBe(provider);
  });

  it("returns false with one warning when the processor throws", async () => {
    process.env.LANGFUSE_APP_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_APP_SECRET_KEY = "sk";
    mockCtor.mockImplementation(() => {
      throw new Error("boom");
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const mod = load();
    expect(mod.initLangfuseTracing()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    await expect(mod.forceFlushLangfuse()).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
