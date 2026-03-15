/**
 * Electrum Protocol Consensus Client for Caravan
 *
 * Implements the Caravan BlockchainClient interface using Electrum protocol
 * (via Fulcrum or other Electrum servers) instead of Bitcoin Core RPC.
 *
 * Key differences from Bitcoin Core:
 * - Uses scriptHash (SHA256 of scriptPubKey, byte-reversed) instead of addresses
 * - Provides balance/history/UTXO queries directly
 * - No watch-only wallet needed (stateless queries by scriptHash)
 */

import { Network } from "@caravan/bitcoin";
import * as bitcoin from "bitcoinjs-lib";
import { createHash } from "crypto";
import { BigNumber } from "bignumber.js";

import { TCPElectrumTransport, ElectrumTransportError } from "./transports/tcp";
import {
  Transaction,
  UTXO,
  TransactionDetails,
  RawTransactionData,
} from "./types";
import { normalizeTransactionData, ClientType } from "./client";

export class ElectrumClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ElectrumClientError";
  }
}

export interface ElectrumClientConfig {
  host: string;
  port: number;
  network: Network;
}

/**
 * ElectrumClient - Electrum protocol adapter for Caravan
 *
 * Connects to Electrum servers (like Fulcrum) and provides scriptHash-based
 * queries for balance, history, UTXOs, and transaction details.
 */
export class ElectrumClient {
  private transport: TCPElectrumTransport;
  private network: Network;
  private connected: boolean = false;
  private serverVersion: string | null = null;

  constructor(config: ElectrumClientConfig) {
    this.transport = new TCPElectrumTransport(config.host, config.port);
    this.network = config.network;
  }

  /**
   * Connect to Electrum server and verify handshake
   */
  async connect(): Promise<void> {
    try {
      await this.transport.connect();

      // Perform handshake
      const version = await this.transport.request("server.version", [
        "Caravan",
        "1.4",
      ]);

      // Handle both string and array responses (Fulcrum returns array)
      if (Array.isArray(version)) {
        this.serverVersion = version[0]; // e.g., "Fulcrum 2.1.0"
      } else if (typeof version === "string") {
        this.serverVersion = version;
      } else {
        throw new ElectrumClientError("Invalid server version response");
      }

      this.connected = true;
    } catch (error) {
      throw new ElectrumClientError(
        `Failed to connect to Electrum server: ${error}`
      );
    }
  }

  /**
   * Disconnect from Electrum server
   */
  disconnect(): void {
    this.transport.disconnect();
    this.connected = false;
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.connected && this.transport.isConnected();
  }

  /**
   * Convert a scriptPubKey to Electrum scripthash
   *
   * Electrum scripthash is defined as:
   * 1. SHA256 of the scriptPubKey bytes
   * 2. Byte-reversed for hex encoding
   *
   * This is the critical piece that connects Caravan's scriptPubKey queries
   * to Electrum's scripthash-based API.
   *
   * @param scriptPubKeyHex - Hex-encoded scriptPubKey
   * @returns Hex-encoded, byte-reversed SHA256 hash
   */
  private scripthashFromScriptPubKey(scriptPubKeyHex: string): string {
    // Convert hex string to Buffer
    const scriptPubKeyBuffer = Buffer.from(scriptPubKeyHex, "hex");

    // SHA256 of the scriptPubKey
    const hash = createHash("sha256").update(scriptPubKeyBuffer).digest();

    // Byte-reverse the hash for RPC calls (little-endian format)
    const reversedHash = Buffer.alloc(hash.length);
    for (let i = 0; i < hash.length; i++) {
      reversedHash[hash.length - 1 - i] = hash[i];
    }

    return reversedHash.toString("hex");
  }

  /**
   * Get balance for a scriptHash
   *
   * Returns both confirmed and unconfirmed balance in satoshis.
   */
  async getBalance(scriptPubKey: string): Promise<{
    confirmed: number;
    unconfirmed: number;
  }> {
    if (!this.isConnected()) {
      throw new ElectrumClientError("Not connected to Electrum server");
    }

    try {
      const scripthash = this.scripthashFromScriptPubKey(scriptPubKey);
      const result = await this.transport.request("blockchain.scripthash.get_balance", [
        scripthash,
      ]);

      return {
        confirmed: result.confirmed || 0,
        unconfirmed: result.unconfirmed || 0,
      };
    } catch (error) {
      throw new ElectrumClientError(
        `Failed to get balance: ${error}`
      );
    }
  }

  /**
   * Get transaction history for a scriptHash
   *
   * Returns array of {txid, height} objects. Height is:
   * - Positive: block height where tx was confirmed
   * - 0: in mempool (unconfirmed)
   * - Negative: pending/orphaned
   */
  async getHistory(scriptPubKey: string): Promise<
    Array<{
      txid: string;
      height: number;
    }>
  > {
    if (!this.isConnected()) {
      throw new ElectrumClientError("Not connected to Electrum server");
    }

    try {
      const scripthash = this.scripthashFromScriptPubKey(scriptPubKey);
      const result = await this.transport.request(
        "blockchain.scripthash.get_history",
        [scripthash]
      );

      return result || [];
    } catch (error) {
      throw new ElectrumClientError(
        `Failed to get history: ${error}`
      );
    }
  }

  /**
   * Get unspent outputs (UTXOs) for a scriptHash
   *
   * Returns array of {tx_hash, tx_pos, value, height} objects.
   */
  async getUnspent(scriptPubKey: string): Promise<
    Array<{
      tx_hash: string;
      tx_pos: number;
      value: number;
      height: number;
    }>
  > {
    if (!this.isConnected()) {
      throw new ElectrumClientError("Not connected to Electrum server");
    }

    try {
      const scripthash = this.scripthashFromScriptPubKey(scriptPubKey);
      const result = await this.transport.request(
        "blockchain.scripthash.listunspent",
        [scripthash]
      );

      return result || [];
    } catch (error) {
      throw new ElectrumClientError(
        `Failed to get unspent outputs: ${error}`
      );
    }
  }

  /**
   * Get raw transaction by txid
   *
   * Returns the raw transaction hex.
   */
  async getTransaction(txid: string): Promise<string> {
    if (!this.isConnected()) {
      throw new ElectrumClientError("Not connected to Electrum server");
    }

    try {
      const result = await this.transport.request("blockchain.transaction.get", [
        txid,
      ]);
      return result;
    } catch (error) {
      throw new ElectrumClientError(
        `Failed to get transaction: ${error}`
      );
    }
  }

  /**
   * Get transaction details (parsed) by txid
   *
   * Returns decoded transaction information including inputs, outputs, and metadata.
   */
  async getTransactionDetails(txid: string): Promise<RawTransactionData> {
    if (!this.isConnected()) {
      throw new ElectrumClientError("Not connected to Electrum server");
    }

    try {
      // Electrum doesn't provide a decoded transaction method directly
      // We need to get the raw hex and decode it ourselves
      const rawHex = await this.getTransaction(txid);
      const tx = bitcoin.Transaction.fromHex(rawHex);

      // Fetch the transaction in the mempool/history to get confirmation status
      const historyEntries = await this.transport.request(
        "blockchain.transaction.get",
        [txid, true] // true = verbose/verbose_format (some servers support this)
      );

      const vin = tx.ins.map((input) => ({
        txid: input.hash.reverse().toString("hex"),
        vout: input.index,
        sequence: input.sequence,
      }));

      const vout = tx.outs.map((output) => ({
        value: output.value,
        scriptpubkey: output.script.toString("hex"),
        scriptpubkey_address: undefined, // Would need to decode script, fallback to undefined
      }));

      // Calculate fee - note: this is an approximation since we don't have input values
      // In a full implementation, we'd fetch previous outputs to calculate actual fee
      const totalOutput = vout.reduce((sum, output) => sum + output.value, 0);
      const fee = 0; // Can't calculate without input values; set to 0 as placeholder

      return {
        txid,
        version: tx.version,
        locktime: tx.locktime,
        size: rawHex.length / 2,
        vsize: rawHex.length / 2, // Approximation for non-segwit; would need proper calculation
        weight: (rawHex.length / 2) * 4, // Approximation
        vin,
        vout,
        fee,
        hex: rawHex,
        status: {
          confirmed: false, // Would need to check mempool status
          block_height: undefined,
        },
      };
    } catch (error) {
      throw new ElectrumClientError(
        `Failed to get transaction details: ${error}`
      );
    }
  }

  /**
   * Broadcast a raw transaction to the network
   *
   * @param rawTxHex - Raw transaction in hex format
   * @returns TXID of the broadcast transaction
   */
  async broadcastTransaction(rawTxHex: string): Promise<string> {
    if (!this.isConnected()) {
      throw new ElectrumClientError("Not connected to Electrum server");
    }

    try {
      const result = await this.transport.request(
        "blockchain.transaction.broadcast",
        [rawTxHex]
      );

      if (typeof result !== "string") {
        throw new ElectrumClientError("Invalid broadcast response");
      }

      return result;
    } catch (error) {
      throw new ElectrumClientError(
        `Failed to broadcast transaction: ${error}`
      );
    }
  }

  /**
   * Estimate fee rate for a target confirmation time
   *
   * @param blocks - Number of blocks for confirmation target (e.g., 1-25)
   * @returns Fee rate in sats/byte
   */
  async estimateFee(blocks: number = 1): Promise<number> {
    if (!this.isConnected()) {
      throw new ElectrumClientError("Not connected to Electrum server");
    }

    try {
      // Electrum returns fee rate in BTC/kilobyte
      const result = await this.transport.request("blockchain.estimatefee", [
        blocks,
      ]);

      if (result <= 0) {
        // Fallback fee if estimation fails
        return 1;
      }

      // Convert BTC/kb to sats/byte
      // 1 BTC = 100,000,000 sats
      // 1 kb = 1000 bytes
      // fee_rate (sats/byte) = result * 100,000,000 / 1000 = result * 100,000
      const satsByte = result * 100000;

      // Ensure at least 1 sat/byte
      return Math.max(1, Math.round(satsByte));
    } catch (error) {
      console.warn(`Fee estimation failed, using default: ${error}`);
      return 1; // Fallback to 1 sat/byte
    }
  }

  /**
   * Get connection info for debugging
   */
  getConnectionInfo() {
    return this.transport.getConnectionInfo();
  }

  /**
   * Get server version info
   */
  getServerVersion(): string | null {
    return this.serverVersion;
  }
}
