export class SandboxUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxUnavailableError";
  }
}

export class RuntimeSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeSessionError";
  }
}

export class RuntimeProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeProtocolError";
  }
}
