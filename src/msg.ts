import { IO } from "./rpc.ts";

const CRLF = new TextEncoder().encode("\r\n\r\n");

/**
 * VSCode style JSON-RPC io.
 */
export class VSCodeIO implements IO {
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();
  private reading = new Deno.Buffer();
  private writing = Promise.resolve();

  public constructor(private args: {
    reader: Deno.Reader;
    writer: Deno.Writer;
  }) {}

  /**
   * Write one message.
   */
  public async write(message: string): Promise<void> {
    const bytes = this.encoder.encode(message);
    await this.writing;
    this.writing = Deno.writeAll(this.args.writer, this.encoder.encode(
      `Content-Length: ${bytes.byteLength}\r\n\r\n${message}`,
    ));
    return this.writing;
  }

  /**
   * Read one message.
   */
  public async read(): Promise<string | void> {
    let headerLength = -1;
    let messageLength = -1;

    while (true) {
      const read = new Uint8Array(1024);
      const total = await this.args.reader.read(read);
      if (typeof total !== 'number' || total === 0) {
        return;
      }
      await Deno.writeAll(this.reading, read);

      const bytes = this.reading.bytes({ copy: false });
      if (headerLength === -1) {
        const index = bytes.indexOf(CRLF[0]);
        if (
          index === -1 || bytes[index + 1] !== CRLF[1] ||
          bytes[index + 2] !== CRLF[2] || bytes[index + 3] !== CRLF[3]
        ) {
          continue;
        }
        headerLength = index + 4;
        const match = this.decoder.decode(bytes.slice(0, headerLength)).match(
          /content-length:\s*(\d+)/i,
        );
        if (match) {
          messageLength = parseInt(match[1], 10);
        }
      }

      if (bytes.byteLength >= headerLength + messageLength) {
        const message = bytes.slice(headerLength, headerLength + messageLength);
        this.reading = new Deno.Buffer();
        await Deno.writeAll(this.reading, bytes.slice(headerLength + messageLength));
        return this.decoder.decode(message);
      }
    }
  }
}

