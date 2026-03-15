import { ElectrumClient, Network } from "@caravan/caravan-clients";

export interface BalanceInfo {
  confirmed: number;
  unconfirmed: number;
}

export interface TransactionHistory {
  txid: string;
  height: number;
}

export interface UnspentOutput {
  tx_hash: string;
  tx_pos: number;
  value: number;
  height: number;
}

export class CaravanElectrumClient {
  private client: ElectrumClient;
  private host: string;
  private port: number;
  private network: Network;

  constructor(host: string, port: number, network: Network = "mainnet") {
    this.host = host;
    this.port = port;
    this.network = network;
    this.client = new ElectrumClient({
      host: this.host,
      port: this.port,
      protocol: "wss",
    });
  }

  /**
   * Connect to the Electrum server
   */
  async connect(): Promise<void> {
    try {
      await this.client.connect();
      console.log(`Connected to Electrum server at ${this.host}:${this.port}`);
    } catch (error) {
      console.error("Failed to connect to Electrum server:", error);
      throw error;
    }
  }

  /**
   * Disconnect from the Electrum server
   */
  async disconnect(): Promise<void> {
    try {
      await this.client.disconnect();
      console.log("Disconnected from Electrum server");
    } catch (error) {
      console.error("Failed to disconnect from Electrum server:", error);
    }
  }

  /**
   * Get balance for a scriptPubKey
   * @param scriptPubKey Bitcoin script public key (hex string)
   * @returns Object with confirmed and unconfirmed balances
   */
  async getBalance(scriptPubKey: string): Promise<BalanceInfo> {
    try {
      const scripthash = this.toScripthash(scriptPubKey);
      const balance = await this.client.getBalance(scripthash);

      return {
        confirmed: balance.confirmed ?? 0,
        unconfirmed: balance.unconfirmed ?? 0,
      };
    } catch (error) {
      console.error(`Error getting balance for ${scriptPubKey}:`, error);
      throw error;
    }
  }

  /**
   * Get transaction history for a scriptPubKey
   * @param scriptPubKey Bitcoin script public key (hex string)
   * @returns Array of transactions with txid and height
   */
  async getHistory(scriptPubKey: string): Promise<TransactionHistory[]> {
    try {
      const scripthash = this.toScripthash(scriptPubKey);
      const history = await this.client.getHistory(scripthash);

      return (history ?? []).map((tx: any) => ({
        txid: tx.tx_hash,
        height: tx.height,
      }));
    } catch (error) {
      console.error(`Error getting history for ${scriptPubKey}:`, error);
      throw error;
    }
  }

  /**
   * Get unspent outputs for a scriptPubKey
   * @param scriptPubKey Bitcoin script public key (hex string)
   * @returns Array of unspent outputs
   */
  async getUnspent(scriptPubKey: string): Promise<UnspentOutput[]> {
    try {
      const scripthash = this.toScripthash(scriptPubKey);
      const unspent = await this.client.getUnspent(scripthash);

      return (unspent ?? []).map((utxo: any) => ({
        tx_hash: utxo.tx_hash,
        tx_pos: utxo.tx_pos,
        value: utxo.value,
        height: utxo.height,
      }));
    } catch (error) {
      console.error(`Error getting unspent for ${scriptPubKey}:`, error);
      throw error;
    }
  }

  /**
   * Convert scriptPubKey to Electrum scripthash format
   * Electrum uses double SHA256 of the script, byte-reversed
   * @param scriptPubKey Hex string of the script public key
   * @returns Scripthash in Electrum format
   */
  private toScripthash(scriptPubKey: string): string {
    const crypto = require("crypto");

    // Convert hex string to Buffer
    const scriptBuffer = Buffer.from(scriptPubKey, "hex");

    // Double SHA256
    const hash1 = crypto.createHash("sha256").update(scriptBuffer).digest();
    const hash2 = crypto.createHash("sha256").update(hash1).digest();

    // Byte-reverse for Electrum
    const reversed = Buffer.from(hash2).reverse();

    return reversed.toString("hex");
  }

  /**
   * Get network info from server
   */
  async getServerInfo(): Promise<any> {
    try {
      return await this.client.getVersion();
    } catch (error) {
      console.error("Error getting server info:", error);
      throw error;
    }
  }
}

// Singleton instance management
let clientInstance: CaravanElectrumClient | null = null;

export async function getClient(
  host: string,
  port: number,
  network: Network = "mainnet"
): Promise<CaravanElectrumClient> {
  if (!clientInstance) {
    clientInstance = new CaravanElectrumClient(host, port, network);
    await clientInstance.connect();
  }
  return clientInstance;
}

export async function closeClient(): Promise<void> {
  if (clientInstance) {
    await clientInstance.disconnect();
    clientInstance = null;
  }
}
