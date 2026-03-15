import { Router, Request, Response } from "express";
import { getClient } from "../client";
import { Network } from "@caravan/caravan-clients";

const router = Router();

/**
 * GET /api/history/:scriptPubKey
 *
 * Query transaction history for a given scriptPubKey
 *
 * Query parameters:
 *   - network: "mainnet" | "testnet" (default: mainnet)
 *
 * Response:
 *   [{ txid: string, height: number }, ...]
 */
router.get("/:scriptPubKey", async (req: Request, res: Response) => {
  try {
    const { scriptPubKey } = req.params;
    const network = (req.query.network as string) || "mainnet";

    // Validate scriptPubKey format (should be hex)
    if (!/^[a-fA-F0-9]*$/.test(scriptPubKey) || scriptPubKey.length === 0) {
      return res.status(400).json({
        error: "Invalid scriptPubKey format. Must be a valid hex string.",
      });
    }

    const host = process.env.ELECTRUM_HOST || "192.168.50.144";
    const port = parseInt(process.env.ELECTRUM_PORT || "50002", 10);

    const client = await getClient(host, port, network as Network);
    const history = await client.getHistory(scriptPubKey);

    return res.json(history);
  } catch (error: any) {
    console.error("History endpoint error:", error);
    return res.status(500).json({
      error: "Failed to retrieve transaction history",
      details: error.message,
    });
  }
});

export default router;
