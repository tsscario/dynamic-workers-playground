import { exports } from "cloudflare:workers";
export { DynamicWorkerTail, LogSession } from "./logging";

type LoaderExports = {
  LogSession: {
    getByName(name: string): {
      waitForLogs(): Promise<{
        getLogs(timeoutMs: number): Promise<unknown[]>;
      }>;
    };
  };
  DynamicWorkerTail(options: { props: { workerId: string } }): Fetcher;
};

const runtimeExports = exports as LoaderExports;

const PYTHON_WORKER_TEMPLATE = `from workers import Response, WorkerEntrypoint
class Default(WorkerEntrypoint):
    async def fetch(self, request):
`;

interface BundleInfo {
  mainModule: string;
  modules: string[];
  warnings: string[];
}

interface WorkerState {
  bundleInfo: BundleInfo | null;
  buildTime: number;
}

interface RunPythonRequestBody {
  code: string;
}


async function executeWorker(
  worker: WorkerStub,
  state: WorkerState,
  workerId: string,
  pathname = "/"
): Promise<Response> {
  const entrypoint = worker.getEntrypoint() as Fetcher & {
    __warmup__?: () => Promise<void>;
  };

  const loadStart = Date.now();
  try {
    await entrypoint.__warmup__?.();
  } catch {
    // Warmup intentionally calls a method that does not exist so the worker cold-starts.
  }
  const loadTime = Date.now() - loadStart;

  const { buildTime, bundleInfo } = state;
  const logSessionStub = runtimeExports.LogSession.getByName(workerId);
  const logWaiter = await logSessionStub.waitForLogs();

  const runStart = Date.now();
  const request = new Request(
    `https://example.com${pathname.startsWith("/") ? pathname : `/${pathname}`}`
  );

  let workerResponse: Response;
  let responseBody = "";
  let workerError: { message: string; stack?: string } | null = null;

  try {
    workerResponse = await entrypoint.fetch(request);
    responseBody = await workerResponse.text();

    if (workerResponse.status >= 500) {
      workerError = {
        message: responseBody || "Worker returned an internal error."
      };
    }
  } catch (error) {
    workerError = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    };
    workerResponse = new Response("Worker execution failed", { status: 500 });
  }

  const runTime = Date.now() - runStart;
  const logs = await logWaiter.getLogs(1000);

  const headers: Record<string, string> = {};
  workerResponse.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return Response.json({
    bundleInfo: bundleInfo ?? {
      mainModule: "(cached)",
      modules: [],
      warnings: []
    },
    response: {
      status: workerResponse.status,
      headers,
      body: responseBody
    },
    workerError,
    logs,
    timing: {
      buildTime,
      loadTime,
      runTime,
      totalTime: buildTime + loadTime + runTime
    }
  });
}

function buildErrorResponse(error: unknown): Response {
  console.error("Error in dynamic-workers-playground:", error);
  return Response.json(
    {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined
    },
    { status: 500 }
  );
}


function stripCommonIndent(code: string): string {
  const lines = code.split("\n");
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  if (nonEmpty.length === 0) return "";
  const minIndent = Math.min(
    ...nonEmpty.map((line) => line.match(/^(\s*)/)?.[1].length ?? 0)
  );
  return lines
    .map((line) => (line.trim().length === 0 ? "" : line.slice(minIndent)))
    .join("\n");
}

function indentCode(code: string, spaces: number): string {
  const indent = " ".repeat(spaces);
  return code
    .split("\n")
    .map((line) => (line.trim().length === 0 ? "" : indent + line))
    .join("\n");
}

function normalizeCode(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) {
    throw new Error("Python code is required");
  }
  // Já é um worker completo — não reempacota
  if (trimmed.includes("WorkerEntrypoint") || trimmed.includes("class Default")) {
    return trimmed;
  }
  const body = indentCode(stripCommonIndent(trimmed), 8);
  return `${PYTHON_WORKER_TEMPLATE}${body}\n`;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/run_python" && request.method === "POST") {
      try {

        const authHeader = request.headers.get("Authorization");
        if (!authHeader || authHeader !== `Bearer ${env.API_KEY}`) return new Response("Não autorizado", { status: 401 });


        const { code } = (await request.json()) as RunPythonRequestBody;

        const workerCode = normalizeCode(code);


        const state: WorkerState = {
          bundleInfo: null,
          buildTime: 0
        };
        const contextExports = (ctx as unknown as { exports: LoaderExports })
          .exports;

        const worker = env.LOADER.load({
          compatibilityDate: "2026-06-25",
          compatibilityFlags: ["python_workers"],
          mainModule: "worker.py",
          modules: { "worker.py": workerCode }
        });

        return executeWorker(worker, state, "hello-v1", "/");
      } catch (error) {
        return buildErrorResponse(error);
      }
    }

    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
