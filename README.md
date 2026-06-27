# Python processor

Write, bundle, and run Cloudflare Worker code at runtime using [`@cloudflare/worker-bundler`](https://www.npmjs.com/package/@cloudflare/worker-bundler) and [Dynamic Worker Loaders](https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/).

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/agents/tree/main/examples/dynamic-workers-playground)

## Get started

```sh
npm install   # from the repo root
npm start     # from this directory
```

## What it demonstrates

- Python runtime bundling with `@cloudflare/worker-bundler` — run python code inside a Worker
- Dynamic execution via a `worker_loaders` binding, with automatic caching when source hasn't changed
- Log capture pipeline — a Tail Worker (`DynamicWorkerTail`) forwards `console.*` output from dynamically loaded workers to a Durable Object (`LogSession`), streamed back to the caller in real time
- Execution timing — granular build/load/run breakdown with cold vs. warm start detection

## How it works

When you call the endpoint `api/run_python`, the host Worker receives your code and calls `createWorker()` from `@cloudflare/worker-bundler` to bundle them at runtime.

## API

### 🚀 Python runtime (POST /api/run_python)

Run python code inside dynamic worker


### 🔐 Autenticação

Tipo: Bearer Token (JWT)

### 📥 Parâmetros da Requisição

**Headers**

| Chave  | Tipo | Obrigatório  | Descrição  |
|---|---|---|---|
| Content-Type | string | Sim | application/json |
| Authorization | string | Sim | Bearer <seu_token> |


**Body**

| Chave  | Tipo | Obrigatório  | Descrição  |
|---|---|---|---|
| code | string | Sim | Código python |

### 📤 Respostas

**Sucesso `200 OK`**

```json
{
    "bundleInfo": {
        "mainModule": "(cached)",
        "modules": [],
        "warnings": []
    },
    "response": {
        "status": 200,
        "headers": {
            "content-type": "text/plain;charset=UTF-8"
        },
        "body": "result"
    },
    "workerError": null,
    "logs": [],
    "timing": {
        "buildTime": 0,
        "loadTime": 1892,
        "runTime": 0,
        "totalTime": 1892
    }
}
```


## Learn more

- [Dynamic Worker Loaders docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/)
- [`@cloudflare/worker-bundler` on npm](https://www.npmjs.com/package/@cloudflare/worker-bundler)
- [Cloudflare Workers docs](https://developers.cloudflare.com/workers/)
