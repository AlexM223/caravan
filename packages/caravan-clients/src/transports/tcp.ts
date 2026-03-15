/**
 * TCP JSON-RPC Transport for Electrum Protocol
 *
 * Electrum protocol is JSON-RPC over a stream transport. This module
 * provides a TCP-based JSON-RPC client for communicating with Electrum
 * servers (like Fulcrum) over raw TCP connections.
 *
 * Messages are newline-delimited JSON:
 * {"jsonrpc": "2.0", "id": 1, "method": "server.version", "params": []}
 * \n
 */

import net from "net";
import { EventEmitter } from "events";

export interface JSONRPCRequest {
  jsonrpc: string;
  id?: string | number;
  method: string;
  params?: any[];
}

export interface JSONRPCResponse {
  jsonrpc: string;
  id?: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * ElectrumTransportError - Thrown when transport-level errors occur
 */
export class ElectrumTransportError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "ElectrumTransportError";
  }
}

/**
 * TCPElectrumTransport - JSON-RPC over TCP for Electrum protocol
 *
 * Manages a TCP connection to an Electrum server and handles
 * bidirectional JSON-RPC communication with automatic request/response matching.
 */
export class TCPElectrumTransport extends EventEmitter {
  private socket: net.Socket | null = null;
  private host: string;
  private port: number;
  private connected: boolean = false;
  private messageBuffer: string = "";
  private requestMap: Map<
    string | number,
    {
      resolve: (value: any) => void;
      reject: (error: any) => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();
  private nextId: number = 1;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000; // ms
  private requestTimeout: number = 30000; // ms

  constructor(host: string, port: number) {
    super();
    this.host = host;
    this.port = port;
  }

  /**
   * Connect to the Electrum server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = net.createConnection(this.port, this.host);

        this.socket.on("connect", () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.emit("connected");
          resolve();
        });

        this.socket.on("data", (data: Buffer) => {
          this.handleData(data);
        });

        this.socket.on("error", (error: Error) => {
          this.handleError(error);
          if (!this.connected) {
            reject(error);
          }
        });

        this.socket.on("close", () => {
          this.connected = false;
          this.emit("disconnected");
          this.attemptReconnect();
        });

        this.socket.setTimeout(this.requestTimeout);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the Electrum server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
    }
  }

  /**
   * Send a JSON-RPC request and wait for response
   */
  async request(method: string, params: any[] = []): Promise<any> {
    if (!this.connected) {
      throw new ElectrumTransportError(
        "Not connected to Electrum server",
        "NOT_CONNECTED"
      );
    }

    const id = this.nextId++;
    const jsonRPCRequest: JSONRPCRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.requestMap.delete(id);
        reject(
          new ElectrumTransportError(
            `Request timeout for method: ${method}`,
            "TIMEOUT"
          )
        );
      }, this.requestTimeout);

      this.requestMap.set(id, { resolve, reject, timeout });

      try {
        const message = JSON.stringify(jsonRPCRequest) + "\n";
        this.socket!.write(message);
      } catch (error) {
        this.requestMap.delete(id);
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Handle incoming data from socket
   */
  private handleData(data: Buffer): void {
    this.messageBuffer += data.toString();

    // Process complete messages (newline-delimited)
    let newlineIndex = this.messageBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const messageLine = this.messageBuffer.substring(0, newlineIndex).trim();
      this.messageBuffer = this.messageBuffer.substring(newlineIndex + 1);

      if (messageLine) {
        try {
          const response: JSONRPCResponse = JSON.parse(messageLine);
          this.handleResponse(response);
        } catch (error) {
          console.error("Failed to parse Electrum response:", error);
        }
      }

      newlineIndex = this.messageBuffer.indexOf("\n");
    }
  }

  /**
   * Handle JSON-RPC response
   */
  private handleResponse(response: JSONRPCResponse): void {
    const id = response.id;

    if (id === null || id === undefined) {
      // Server notification (no id) - emit as event
      if (response.result) {
        this.emit("notification", response.result);
      }
      return;
    }

    const pending = this.requestMap.get(id);
    if (!pending) {
      console.warn("Received response for unknown request id:", id);
      return;
    }

    const { resolve, reject, timeout } = pending;
    this.requestMap.delete(id);
    clearTimeout(timeout);

    if (response.error) {
      reject(
        new ElectrumTransportError(
          response.error.message,
          `RPC_ERROR_${response.error.code}`
        )
      );
    } else {
      resolve(response.result);
    }
  }

  /**
   * Handle connection errors
   */
  private handleError(error: Error): void {
    console.error("TCP transport error:", error);
    this.emit("error", error);
  }

  /**
   * Attempt to reconnect on connection loss
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        "Max reconnection attempts reached for Electrum server"
      );
      this.emit("reconnect_failed");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    console.log(
      `Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error("Reconnection failed:", error);
      });
    }, delay);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get connection info
   */
  getConnectionInfo(): { host: string; port: number; connected: boolean } {
    return {
      host: this.host,
      port: this.port,
      connected: this.connected,
    };
  }
}
