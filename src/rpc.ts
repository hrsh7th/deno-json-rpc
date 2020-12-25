/**
 * Callback type.
 */
type Callback<
  Params extends PlainObject,
  Result extends PlainObject,
> = (
  params: Params,
) => ([Result] extends [never] ? void : (Promise<Result> | Result));

/**
 * Protocol type.
 */
type ProtocolDefinition = {
  IncomingRequest: {
    method: string;
    // deno-lint-ignore no-explicit-any
    params: any;
    result: PlainObject;
  };
  OutgoingRequest: {
    method: string;
    params: PlainObject;
    result: PlainObject;
  };
  IncomingNotification: {
    method: string;
    // deno-lint-ignore no-explicit-any
    params: any;
  };
  OutgoingNotification: {
    method: string;
    params: PlainObject;
  };
};

/**
 * PlainObject.
 */
export type PlainObject =
  | number
  | string
  | boolean
  | null
  | undefined
  | PlainObject[]
  | { [k: string]: PlainObject };

/**
 * I/O.
 *
 * # read
 * This method will resolve message one by one.
 *
 * # write
 * This method accept only `one` message.
 * The user must write only one message per each call.
 */
export type IO = {
  read: () => Promise<string | void>;
  write: (message: string) => Promise<void>;
};

/**
 * The RPC class.
 *
 * ```typescript
 * type TextDocumentDefinitionRequest = {
 *   method: "textDocument/definition";
 *   params: {
 *     identifier: string;
 *     position: {
 *       line: number;
 *       character: number;
 *     };
 *   };
 *   result: {
 *     identifier: string;
 *     position: {
 *       line: number;
 *       character: number;
 *     };
 *   }[];
 * };
 *
 * const rpc = new RPC<{
 *   IncomingRequest: TextDocumentDefinitionRequest;
 *   IncomingNotification: never;
 *   OutgoingRequest: never;
 *   OutgoingNotification: never;
 * }>({
 *   io: new VSCodeIO({
 *     reader: Deno.stdin,
 *     writer: Deno.stdout,
 *   })
 * });
 * 
 * rpc.onRequest("textDocument/definition", (_) => {
 *   return [{
 *     identifier: "example",
 *     position: {
 *       line: 0,
 *       character: 0
 *     }
 *   }];
 * });
 *
 * rpc.start();
 * ```
 */
export class RPC<Protocol extends ProtocolDefinition = ProtocolDefinition> {
  /**
   * The requestId.
   */
  private requestId = 0;

  /**
   * Store request's resolve/reject.
   */
  private requests = new Map<
    number,
    {
      resolve: (value: PlainObject) => void;
      reject: (value: PlainObject) => void;
    }
  >();

  /**
   * Input/output.
   */
  private io: IO;

  /**
   * Running status.
   */
  private running = false;

  /**
   * Incoming request handlers.
   */
  private incomingRequestHandlers: {
    [k: string]: Callback<PlainObject, PlainObject>;
  } = {};

  /**
   * Incoming notification handlers.
   */
  private incomingNotificationHandlers: {
    [k: string]: Callback<PlainObject, never>;
  } = {};

  /**
   * constructor
   */
  public constructor(
    args: {
      io: IO;
    },
  ) {
    this.io = args.io;
  }

  /**
   * start.
   */
  public start() {
    this.running = true;
    (async () => {
      while (true) {
        if (!this.running) {
          break;
        }
        const message = await this.io.read();
        if (message) {
          this.onMessage(message);
        }
      }
    })();
  }

  /**
   * stop.
   */
  public stop() {
    this.running = false;
  }

  /**
   * Send request.
   */
  public request<Request extends Protocol["OutgoingRequest"]>(
    method: Request["method"],
    params: Request["params"],
  ): Promise<Request["result"]> {
    const id = this.requestId++;
    return new Promise<Request["result"]>((resolve, reject) => {
      this.requests.set(id, { resolve, reject });
      this.io.write(JSON.stringify({
        id: id,
        method: method,
        params: params,
      }));
    });
  }

  /**
   * Send notification.
   */
  public notify<Notification extends Protocol["OutgoingNotification"]>(
    method: Notification["method"],
    params: Notification["params"],
  ): void {
    this.io.write(JSON.stringify({
      method: method,
      params: params,
    }));
  }

  /**
   * Receive request.
   */
  public onRequest<Request extends Protocol["IncomingRequest"]>(
    method: Request["method"],
    callback: Callback<Request["params"], Request["result"]>,
  ) {
    if (this.incomingRequestHandlers[method]) {
      throw new Error(`'${method}' is already registered.`);
    }
    this.incomingRequestHandlers[method] = callback;
    return this;
  }

  /**
   * Receive notification.
   */
  public onNotification<Notification extends Protocol["IncomingNotification"]>(
    method: Notification["method"],
    callback: Callback<Notification["params"], never>,
  ) {
    if (this.incomingNotificationHandlers[method]) {
      throw new Error(`'${method}' is already registered.`);
    }
    this.incomingNotificationHandlers[method] = callback;
    return this;
  }

  /**
   * Handle message.
   */
  private onMessage = async (message_: string) => {
    const message = JSON.parse(message_);
    if ("id" in message) {
      if ("method" in message) {
        if (!this.incomingRequestHandlers[message.method]) {
          return this.io.write(JSON.stringify({
            id: message.id,
            error: {
              code: -32601,
              message: "Method not found",
            },
          }));
        }
        try {
          const result = await this.incomingRequestHandlers[message.method](
            message.params,
          );
          return this.io.write(JSON.stringify({
            id: message.id,
            result: result,
          }));
        } catch (e) {
          return this.io.write(JSON.stringify({
            id: message.id,
            error: {
              code: -32603,
              message: "Internal error",
              data: e,
            },
          }));
        }
      } else {
        const request = this.requests.get(message.id);
        if (request) {
          if ("error" in message) {
            request.reject(message.error);
          } else {
            request.resolve(message.result);
          }
          this.requests.delete(message.id);
        }
      }
    } else {
      if (this.incomingNotificationHandlers[message.method]) {
        this.incomingNotificationHandlers[message.method](message.params);
      }
    }
  };
}
