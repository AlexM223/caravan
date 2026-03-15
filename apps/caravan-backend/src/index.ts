import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import { ElectrumClient } from "@caravan/caravan-clients";
import { Network } from "@caravan/bitcoin";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const ELECTRUM_HOST = process.env.ELECTRUM_HOST || "localhost";
const ELECTRUM_PORT = parseInt(process.env.ELECTRUM_PORT || "50002");
const DEFAULT_NETWORK = (process.env.NETWORK as Network) || "mainnet";

// Initialize Electrum client
let electrumClient: ElectrumClient | null = null;

// Middleware
app.use(express.json());
app.use(express.text({ type: "text/plain" }));

// Ensure Electrum client is connected
async function ensureConnected(req: Request, res: Response, next: NextFunction) {
  try {
    if (!electrumClient) {
      electrumClient = new ElectrumClient({
        host: ELECTRUM_HOST,
        port: ELECTRUM_PORT,
        network: DEFAULT_NETWORK,
      });
    }

    if (!electrumClient.isConnected()) {
      await electrumClient.connect();
    }

    next();
  } catch (error) {
    console.error("Failed to connect to Electrum server:", error);
    res.status(503).json({
      error: "Electrum server unavailable",
      message: String(error),
    });
  }
}

app.use(ensureConnected);

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    server: electrumClient?.getServerVersion() || "unknown",
  });
});

/**
 * GET /api/transaction/:txid
 * Query parameters:
 *   - network: "mainnet" | "testnet" (default: mainnet)
 *
 * Response: Raw transaction hex string
 */
app.get("/api/transaction/:txid", async (req: Request, res: Response) => {
  try {
    const { txid } = req.params;
    // const network = (req.query.network as string) || DEFAULT_NETWORK;

    if (!txid || txid.length !== 64) {
      return res.status(400).json({
        error: "Invalid transaction ID",
        message: "TXID must be 64 hex characters",
      });
    }

    if (!electrumClient) {
      return res.status(503).json({ error: "Electrum client not initialized" });
    }

    const rawTxHex = await electrumClient.getTransaction(txid);

    res.setHeader("Content-Type", "text/plain");
    res.send(rawTxHex);
  } catch (error) {
    console.error(`Error fetching transaction ${req.params.txid}:`, error);
    res.status(500).json({
      error: "Failed to fetch transaction",
      message: String(error),
    });
  }
});

/**
 * POST /api/broadcast
 * Body: { rawTx: string, network: "mainnet" | "testnet" }
 *
 * Response: { txid: string }
 */
app.post("/api/broadcast", async (req: Request, res: Response) => {
  try {
    const { rawTx, network } = req.body;
    // const targetNetwork = network || DEFAULT_NETWORK;

    if (!rawTx || typeof rawTx !== "string") {
      return res.status(400).json({
        error: "Invalid request body",
        message: "rawTx field is required and must be a hex string",
      });
    }

    // Validate hex format
    if (!/^[0-9a-fA-F]*$/.test(rawTx)) {
      return res.status(400).json({
        error: "Invalid transaction format",
        message: "rawTx must be valid hex",
      });
    }

    if (!electrumClient) {
      return res.status(503).json({ error: "Electrum client not initialized" });
    }

    const txid = await electrumClient.broadcastTransaction(rawTx);

    res.status(201).json({ txid });
  } catch (error) {
    console.error("Error broadcasting transaction:", error);

    // Check if it's a double-spend or already-known error
    const errorMessage = String(error);
    if (
      errorMessage.includes("double spend") ||
      errorMessage.includes("already in mempool")
    ) {
      return res.status(409).json({
        error: "Transaction conflict",
        message: errorMessage,
      });
    }

    res.status(500).json({
      error: "Failed to broadcast transaction",
      message: errorMessage,
    });
  }
});

/**
 * GET /api/fee/:blocks
 * Query parameters:
 *   - network: "mainnet" | "testnet" (default: mainnet)
 *
 * Response: { satsByte: number }
 */
app.get("/api/fee/:blocks", async (req: Request, res: Response) => {
  try {
    const { blocks } = req.params;
    // const network = (req.query.network as string) || DEFAULT_NETWORK;

    const blockCount = parseInt(blocks, 10);

    if (isNaN(blockCount) || blockCount < 1 || blockCount > 1000) {
      return res.status(400).json({
        error: "Invalid block count",
        message: "blocks parameter must be an integer between 1 and 1000",
      });
    }

    if (!electrumClient) {
      return res.status(503).json({ error: "Electrum client not initialized" });
    }

    const satsByte = await electrumClient.estimateFee(blockCount);

    res.json({ satsByte });
  } catch (error) {
    console.error(`Error estimating fee for ${req.params.blocks} blocks:`, error);
    res.status(500).json({
      error: "Failed to estimate fee",
      message: String(error),
    });
  }
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "Not found",
    path: req.path,
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: err.message,
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing connections...");
  if (electrumClient) {
    electrumClient.disconnect();
  }
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, closing connections...");
  if (electrumClient) {
    electrumClient.disconnect();
  }
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`Caravan Backend listening on port ${PORT}`);
  console.log(`Electrum server: ${ELECTRUM_HOST}:${ELECTRUM_PORT}`);
  console.log(`Network: ${DEFAULT_NETWORK}`);
});
