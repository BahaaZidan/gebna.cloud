import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SendRequestBody } from "../src/http/send-schema.js";
import { MxLookupError } from "../src/services/mx.js";
import { sendMessage, SmtpTemporaryError } from "../src/services/send.js";
import type { OutboundTransportConfig } from "../src/services/transport-config.js";

const {
  applyDkimSignatureMock,
  resolveMxTargetsMock,
  sendDirectSmtpMessageMock,
} = vi.hoisted(() => ({
  applyDkimSignatureMock: vi.fn(),
  resolveMxTargetsMock: vi.fn(),
  sendDirectSmtpMessageMock: vi.fn(),
}));

vi.mock("../src/services/dkim.js", async () => {
  const actual = await vi.importActual<typeof import("../src/services/dkim.js")>(
    "../src/services/dkim.js",
  );

  return {
    ...actual,
    applyDkimSignature: applyDkimSignatureMock,
  };
});

vi.mock("../src/services/mx.js", async () => {
  const actual = await vi.importActual<typeof import("../src/services/mx.js")>(
    "../src/services/mx.js",
  );

  return {
    ...actual,
    resolveMxTargets: resolveMxTargetsMock,
  };
});

vi.mock("../src/services/smtp.js", async () => {
  const actual = await vi.importActual<typeof import("../src/services/smtp.js")>(
    "../src/services/smtp.js",
  );

  return {
    ...actual,
    sendDirectSmtpMessage: sendDirectSmtpMessageMock,
  };
});

const transportConfig: OutboundTransportConfig = {
  dkim: {
    privateKey: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDthLQ+vHI6i4Ff
pmvU5P5l5yTtov1fi8dfgR2VQbNQz4pj+4XK2UPX6rF00KZXj7uBPF8quRAjE6zG
N2QXIg8JH5tY1Pycv7Mt3SJP2A1R6boXxv7Xnq+P1zZ2Q1pI6D0W+J2m2D+5a+9M
j4vYlLR6AgjP2H91T1+wD0MCjA0b0xQn6QFLCz0a2FC6Z+6FQmR3bE1V8Wl0+u0n
9Yf0XBi7s5uhwW3s3LGk8sAAgB1lVx7kR1u3e0xVZ2qVYkF1v2m8F4wM6ff9GmVj
8C4K4oN9k8e2s0Z9XQnQn7oW2SYAfqP8vmbmM6Z7z8BvLqN4xFXiFLQ4sQW3xAnJ
79/9c0G5AgMBAAECggEAAg7X6Vq9g8T7Vd9ZQ5zBy9l6p0f1xj0Yf6u0mLqgTqfH
Kj8O2cVQ0z7k9VY2Qe+0gJXwM7YgO7eM0X1W6O9uW4q4DgD3L9jQY7v6jvH8r6Kj
5sYQ+zGd2y3U8B0kF4nQ8M2uY8aC4XWnQ7K5bQ2P4L6h2V5eM2Qz4lX9oG4fP1aQ
4p9wB8wJ6uQ8gZL3v4nS2uN7oY6rP3uC5kQ9tN7jF2oQ4rV8mM0uP7oV4nQ2dK8x
K4nS5mQ7rP1cV8tY3oL4jQ5nP7uW2mQ4sV9kQ8rJ2mP7wV5oN3kR8uX4mQ2pV6sC
4mQ7tP1kV8oN3wR5uX2mQ4nV7sC6pQ9wR3kX5mQKBgQD9K8F6qM3dV4nS2uQ8rP1
vW5mQ4nS7uP2kV8oN3wR5uX2mQ4nV7sC6pQ9wR3kX5mQ1vW6nS3uQ8rP2kV9oN4wR
5uX3mQ5nV8sC7pQ1wR4kX6mQ2vW7nS4uQ9rP3kV1oN5wR6uX4mQ6nV9sC8pQ2wR5
kX7mQKBgQDx8V4nS2uQ8rP1kV5oN3wR5uX2mQ4nV7sC6pQ9wR3kX5mQ1vW6nS3uQ8
rP2kV9oN4wR5uX3mQ5nV8sC7pQ1wR4kX6mQ2vW7nS4uQ9rP3kV1oN5wR6uX4mQ6nV
9sC8pQ2wR5kX7mQKBgF0eY7nQ4pV8sC6mQ1wR3kX5uN2vQ9rP4kV1oN6wR7uX5mQ7
nV2sC9pQ3wR6kX8uN4vQ1rP5kV2oN7wR8uX6mQ8nV3sC1pQ4wR7kX9uN5vQ2rP6kV
3oN8wR9uX7mQ9nV4sC2pQ5wR8kX1uN6vQ3rP7kV4oN9wR0uX8mQKBgQCN5qP8rV2
kX6mQ1uW4nS7pQ9rP3kV5oN1wR4uX7mQ2nV5sC8pQ1wR5kX8uN3vQ6rP9kV4oN2wR
5uX8mQ3nV6sC9pQ2wR6kX9uN4vQ7rP1kV5oN3wR6uX9mQ4nV7sC1pQ3wR7kX1uN5v
Q8rP2kV6oN4wR7uX1mQKBgQCJ4mQ7nV1sC5pQ8wR2kX6uN9vQ3rP7kV1oN5wR8uX2
mQ5nV8sC2pQ9wR3kX7uN1vQ4rP8kV2oN6wR9uX3mQ6nV9sC3pQ1wR4kX8uN2vQ5rP
9kV3oN7wR0uX4mQ7nV1sC4pQ2wR5kX9uN3vQ6rP1kV4oN8wR1uX5mQ==
-----END PRIVATE KEY-----`,
    selector: "mail",
  },
  ehloHostname: "mail.gebna.net",
  fromDomain: "gebna.net",
  replyTo: "reply@gebna.net",
  returnPath: "bounce@gebna.net",
  sendTimeoutMs: 30_000,
};

const request: SendRequestBody = {
  from: "sender@gebna.net",
  subject: "Hello",
  text: "Body",
  to: ["user@example.com"],
};

describe("sendMessage", () => {
  beforeEach(() => {
    applyDkimSignatureMock.mockReset();
    resolveMxTargetsMock.mockReset();
    sendDirectSmtpMessageMock.mockReset();
    applyDkimSignatureMock.mockImplementation((builtMessage) => ({
      ...builtMessage,
      message: `DKIM-Signature: test-signature\r\n${builtMessage.message}`,
    }));
  });

  it("sends successfully and passes a DKIM-signed message to SMTP", async () => {
    resolveMxTargetsMock.mockResolvedValue([
      { exchange: "mx.example.com", priority: 10 },
    ]);
    sendDirectSmtpMessageMock.mockResolvedValue(undefined);

    const result = await sendMessage(request, transportConfig);

    expect(result.success).toBe(true);
    expect(result.deliveries).toEqual([
      {
        attempts: [
          {
            exchange: "mx.example.com",
            priority: 10,
            success: true,
          },
        ],
        recipientDomain: "example.com",
        success: true,
      },
    ]);

    expect(resolveMxTargetsMock).toHaveBeenCalledWith("example.com");
    expect(sendDirectSmtpMessageMock).toHaveBeenCalledTimes(1);

    const sentMessage = sendDirectSmtpMessageMock.mock.calls[0]?.[1];
    expect(sentMessage).toBeDefined();
    expect(sentMessage.message.startsWith("DKIM-Signature:")).toBe(true);
    expect(sentMessage.envelope.from).toBe("bounce@gebna.net");
    expect(sentMessage.envelope.to).toEqual(["user@example.com"]);
  });

  it("surfaces MX lookup failures", async () => {
    resolveMxTargetsMock.mockRejectedValue(new MxLookupError("lookup failed"));

    await expect(sendMessage(request, transportConfig)).rejects.toBeInstanceOf(
      MxLookupError,
    );
    expect(sendDirectSmtpMessageMock).not.toHaveBeenCalled();
  });

  it("surfaces temporary SMTP failures after exhausting MX targets", async () => {
    resolveMxTargetsMock.mockResolvedValue([
      { exchange: "mx1.example.com", priority: 10 },
      { exchange: "mx2.example.com", priority: 20 },
    ]);
    sendDirectSmtpMessageMock
      .mockRejectedValueOnce(new SmtpTemporaryError("450 mailbox busy"))
      .mockRejectedValueOnce(new SmtpTemporaryError("421 temporary failure"));

    await expect(sendMessage(request, transportConfig)).rejects.toBeInstanceOf(
      SmtpTemporaryError,
    );

    expect(sendDirectSmtpMessageMock).toHaveBeenCalledTimes(2);
  });
});
