import * as http from "node:http";

export type RequestHandler = http.RequestListener<
  typeof http.IncomingMessage,
  typeof http.ServerResponse
>;

export type HttpServer = http.Server<
  typeof http.IncomingMessage,
  typeof http.ServerResponse
>;

export function createHttpServer(handler: RequestHandler): HttpServer {
  return http.createServer(handler);
}

export async function startHttpServer(
  server: HttpServer,
  port: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

export async function stopHttpServer(server: HttpServer): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
