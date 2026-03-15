# Electrum/Fulcrum Backend Testing Guide

This guide explains how to test the new Electrum/Fulcrum backend support in Caravan Coordinator.

## Prerequisites

1. **Fulcrum Server**: Running on your network (e.g., 192.168.50.144:50002)
2. **Backend Service**: Caravan backend proxy service
3. **Node.js**: v24+ (for Caravan Coordinator development)

## Setup

### 1. Start the Backend Service

The backend service proxies requests from Caravan to your Fulcrum server.

```bash
cd /data/.openclaw/workspace/caravan/apps/caravan-backend
npm install
npm start
```

The service will start on `http://localhost:3001` by default.

**Environment Variables** (create `.env`):
```
PORT=3001
ELECTRUM_HOST=192.168.50.144
ELECTRUM_PORT=50002
NETWORK=mainnet
```

### 2. Start Caravan Coordinator

```bash
cd /data/.openclaw/workspace/caravan/apps/coordinator
npm install
npm start
```

The coordinator will start on `http://localhost:5173` by default.

## Testing Steps

### 1. Select Electrum Backend

1. Open Caravan Coordinator in your browser
2. Navigate to the Bitcoin Client settings
3. Select the **"Electrum/Fulcrum"** radio button
4. You should see the Electrum configuration form appear

### 2. Configure Backend Endpoint

1. **Backend Endpoint URL**: Enter `http://localhost:3001`
   - The form validates that the URL is properly formatted
2. **Auth Token** (optional): Leave empty for testing
3. Click **"Test Connection"** to verify the backend is reachable
   - Success message: "Connection Success!"
   - Error message: Check backend logs

### 3. Test with a Descriptor Wallet

To fully test the implementation, you'll need a descriptor-based wallet.

#### Option A: Import a Test Descriptor

1. Create a simple test descriptor (e.g., single-sig P2WPKH)
2. Import it into Caravan Coordinator
3. The coordinator will use your configured Electrum backend for all queries

#### Option B: Use an Existing Address

If you have Bitcoin addresses on the configured network:

1. Add an address to your wallet
2. Caravan should query the Electrum backend via the backend service
3. Verify in backend logs that requests are being received:

```bash
# Watch backend logs
cd /data/.openclaw/workspace/caravan/apps/caravan-backend
npm start
```

### 4. Test Key Operations

#### Balance Queries
- Add an address that has received Bitcoin
- Balance should display (requires address to have UTXOs)
- Backend logs should show: `GET /api/balance/:scriptPubKey`

#### Transaction History
- Addresses with transaction history should display transactions
- Backend logs should show: `GET /api/history/:scriptPubKey`

#### UTXO Fetching
- When creating transactions, UTXOs are fetched
- Backend logs should show: `GET /api/unspent/:scriptPubKey`

#### Fee Estimation
- Any fee estimate call should use the backend
- Backend logs should show: `GET /api/fee/:blocks`

#### Transaction Broadcasting
- Create and sign a transaction
- Broadcast it
- Backend logs should show: `POST /api/broadcast`

## Backend API Endpoints

### Balance Query
```bash
GET http://localhost:3001/api/balance/{scriptPubKey}
Response: { "confirmed": 1000000, "unconfirmed": 0 }
```

### Transaction History
```bash
GET http://localhost:3001/api/history/{scriptPubKey}
Response: [
  { "txid": "...", "height": 834000 },
  { "txid": "...", "height": 0 }
]
```

### UTXO Query
```bash
GET http://localhost:3001/api/unspent/{scriptPubKey}
Response: [
  { "tx_hash": "...", "tx_pos": 0, "value": 1000000, "height": 834000 }
]
```

### Transaction Hex
```bash
GET http://localhost:3001/api/transaction/{txid}
Response: {raw transaction hex}
```

### Fee Estimation
```bash
GET http://localhost:3001/api/fee/{blocks}
Response: { "satsByte": 5.5 }
```

### Broadcast Transaction
```bash
POST http://localhost:3001/api/broadcast
Body: { "rawTx": "{hex}" }
Response: { "txid": "..." }
```

## Troubleshooting

### "Connection Success!" but queries fail
1. Check that Fulcrum server is running: `telnet 192.168.50.144 50002`
2. Verify backend logs: `npm start` (without --silent)
3. Check network connectivity between backend and Fulcrum

### "Connection Failed"
1. Verify backend URL format: `http://localhost:3001`
2. Check backend service is running: `curl http://localhost:3001/health`
3. Look for error in backend logs

### Blank balance or transactions
1. Verify the address has activity on the configured network
2. Check backend logs for API errors
3. Ensure scriptPubKey is correctly formatted

### TypeError: Cannot read property 'satsByte'
1. Fee estimation endpoint format may have changed
2. Check backend logs for the actual response format
3. Verify ELECTRUM_HOST and ELECTRUM_PORT environment variables

## Next Steps

After successful testing:

1. **Deploy backend service** to your infrastructure
2. **Update coordinator configuration** to point to remote backend
3. **Test with real wallets** on mainnet/testnet
4. **Monitor backend logs** for performance and errors
5. **Implement additional features** as needed (WebSocket support, authentication, etc.)

## Known Limitations

- Auth token support is present but not enforced in current backend
- No WebSocket subscriptions for real-time updates (uses polling instead)
- Error handling may need enhancement for production use
- Rate limiting not implemented

## Additional Resources

- [Electrum Protocol Documentation](https://electrumx-spesmilo.readthedocs.io/en/latest/protocol.html)
- [Fulcrum Documentation](https://github.com/cculianu/fulcrum)
- [Caravan Bitcoin Architecture](../README.md)
