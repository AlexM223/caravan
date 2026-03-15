import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import balanceRouter from "./routes/balance";
import historyRouter from "./routes/history";
import unspentRouter from "./routes/unspent";
import { closeClient } from "./client";

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
app.use("/api/balance", balanceRouter);
app.use("/api/history", historyRouter);
app.use("/api/unspent", unspentRouter);

// Root endpoint with documentation
app.get("/", (req: Request, res: Response) => {
  res.json({
    name: "@caravan/caravan-backend",
    version: "1.0.0",
    description:
      "Express backend service wrapping ElectrumClient for Bitcoin blockchain queries",
    endpoints: {
      "/health": "GET - Health check",
      "/api/balance/:scriptPubKey": "GET - Get balance (confirmed/unconfirmed)",
      "/api/history/:scriptPubKey": "GET - Get transaction history",
      "/api/unspent/:scriptPubKey": "GET - Get unspent outputs",
    },
    queryParameters: {
      network: 'Optional: "mainnet" (default) or "testnet"',
    },
    environment: {
      ELECTRUM_HOST: process.env.ELECTRUM_HOST || "192.168.50.144",
      ELECTRUM_PORT: process.env.ELECTRUM_PORT || "50002",
      NETWORK: process.env.NETWORK || "mainnet",
      PORT: process.env.PORT || 3001,
    },
  });
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: err.message,
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`⚡ Caravan Backend running on port ${PORT}`);
  console.log(`📍 API available at http://localhost:${PORT}/api`);
  console.log(`🏥 Health check at http://localhost:${PORT}/health`);
  console.log(
    `🔗 Electrum Server: ${process.env.ELECTRUM_HOST || "192.168.50.144"}:${process.env.ELECTRUM_PORT || "50002"}`
  );
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  server.close(async () => {
    console.log("Server closed");
    await closeClient();
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully...");
  server.close(async () => {
    console.log("Server closed");
    await closeClient();
    process.exit(0);
  });
});

export default app;
