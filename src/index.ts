import { createAppHandler } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createHttpServer, startHttpServer } from "./server.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const server = createHttpServer(createAppHandler(env));
  const port = env.PORT ?? 3000;

  await startHttpServer(server, port);
}

void main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);

    if (error.stack !== undefined) {
      console.error(error.stack);
    }
  } else {
    console.error("Startup failed.");
    console.error(String(error));
  }

  process.exitCode = 1;
});
