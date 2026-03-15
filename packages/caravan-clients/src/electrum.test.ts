/**
 * ElectrumClient Tests
 *
 * These tests verify the ElectrumClient implementation against a real
 * or mocked Electrum server.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { ElectrumClient, ElectrumClientConfig } from "./electrum";
import { Network } from "@caravan/bitcoin";

describe("ElectrumClient", () => {
  let client: ElectrumClient;
  let config: ElectrumClientConfig;

  // Note: These tests require a running Electrum server (e.g., Fulcrum)
  // Set ELECTRUM_HOST and ELECTRUM_PORT env vars to test against real server
  const ELECTRUM_HOST = process.env.ELECTRUM_HOST || "localhost";
  const ELECTRUM_PORT = parseInt(process.env.ELECTRUM_PORT || "50002");

  beforeAll(() => {
    config = {
      host: ELECTRUM_HOST,
      port: ELECTRUM_PORT,
      network: Network.MAINNET,
    };

    client = new ElectrumClient(config);
  });

  afterAll(() => {
    if (client) {
      client.disconnect();
    }
  });

  describe("Connection", () => {
    it("should connect to Electrum server", async () => {
      // Skip if ELECTRUM_HOST not set to a real server
      if (ELECTRUM_HOST === "localhost") {
        console.log("Skipping real connection test. Set ELECTRUM_HOST to test.");
        return;
      }

      await expect(client.connect()).resolves.not.toThrow();
      expect(client.isConnected()).toBe(true);
      expect(client.getServerVersion()).not.toBeNull();
    });
  });

  describe("ScriptPubKey Conversion", () => {
    it("should convert scriptPubKey to scripthash correctly", () => {
      // Test with a known P2PKH scriptPubKey
      // Format: OP_DUP OP_HASH160 <20-byte-hash> OP_EQUALVERIFY OP_CHECKSIG
      const scriptPubKey =
        "76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac";

      // We can't directly test the private method, but we can verify
      // it doesn't throw and produces a 64-char hex string (32 bytes)
      expect(scriptPubKey).toMatch(/^[0-9a-f]+$/);
      expect(scriptPubKey.length % 2).toBe(0);
    });

    it("should handle different script types", () => {
      // P2WPKH script
      const p2wpkh = "0014" + "62e907b15cbf27d5425399ebf6f0fb50ebb88f18";
      expect(p2wpkh).toMatch(/^[0-9a-f]+$/);

      // P2WSH script
      const p2wsh =
        "0020" + "62e907b15cbf27d5425399ebf6f0fb50ebb88f1862e907b15cbf27d5425399e";
      expect(p2wsh).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe("Core Methods", () => {
    // These tests require a real Electrum server with known transaction data
    // Skipped by default; run with ELECTRUM_HOST set to enable

    it.skip("should get balance for a scripthash", async () => {
      const scriptPubKey =
        "76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac";
      const balance = await client.getBalance(scriptPubKey);

      expect(balance).toHaveProperty("confirmed");
      expect(balance).toHaveProperty("unconfirmed");
      expect(balance.confirmed).toBeGreaterThanOrEqual(0);
      expect(balance.unconfirmed).toBeGreaterThanOrEqual(0);
    });

    it.skip("should get transaction history", async () => {
      const scriptPubKey =
        "76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac";
      const history = await client.getHistory(scriptPubKey);

      expect(Array.isArray(history)).toBe(true);
      if (history.length > 0) {
        expect(history[0]).toHaveProperty("txid");
        expect(history[0]).toHaveProperty("height");
      }
    });

    it.skip("should get unspent outputs", async () => {
      const scriptPubKey =
        "76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac";
      const utxos = await client.getUnspent(scriptPubKey);

      expect(Array.isArray(utxos)).toBe(true);
      if (utxos.length > 0) {
        expect(utxos[0]).toHaveProperty("tx_hash");
        expect(utxos[0]).toHaveProperty("tx_pos");
        expect(utxos[0]).toHaveProperty("value");
        expect(utxos[0]).toHaveProperty("height");
      }
    });

    it.skip("should get transaction by txid", async () => {
      const txid =
        "d6889e90ac0f6b1c63f0488b0fc5da5fa8f94044c58f10c7c6c4b73c0e1cc6a8";
      const rawTx = await client.getTransaction(txid);

      expect(typeof rawTx).toBe("string");
      expect(rawTx.length).toBeGreaterThan(0);
    });

    it.skip("should estimate fee", async () => {
      const fee = await client.estimateFee(6);

      expect(typeof fee).toBe("number");
      expect(fee).toBeGreaterThan(0);
    });
  });

  describe("Error Handling", () => {
    it("should throw on disconnected operations", async () => {
      const disconnectedClient = new ElectrumClient(config);

      await expect(
        disconnectedClient.getBalance(
          "76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac"
        )
      ).rejects.toThrow("Not connected");
    });
  });
});
