# Caravan Backend

Express backend service that wraps ElectrumClient for Bitcoin blockchain queries via Fulcrum server.

## Overview

The Caravan Backend provides a REST API for querying blockchain data from a Fulcrum Electrum server. It wraps the `ElectrumClient` from `@caravan/caravan-clients` and exposes endpoints for:

- **Balance queries** - Get confirmed and unconfirmed balances for a scriptPubKey
- **Transaction history** - Retrieve all transactions for a scriptPubKey
- **Unspent outputs** - List unspent transaction outputs (UTXOs) for a scriptPubKey

## Installation

### Prerequisites

- Node.js 22+
- npm or yarn
- Fulcrum/Electrum server running (default: `192.168.50.144:50002`)

### Setup

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Or develop with ts-node
npm run dev
```

## Configuration

Set environment variables to customize behavior:

```bash
# Electrum server host (default: 192.168.50.144)
ELECTRUM_HOST=192.168.50.144

# Electrum server port (default: 50002)
ELECTRUM_PORT=50002

# Bitcoin network (default: mainnet)
NETWORK=mainnet

# Express server port (default: 3001)
PORT=3001
```

Example `.env` file:

```
ELECTRUM_HOST=192.168.50.144
ELECTRUM_PORT=50002
NETWORK=mainnet
PORT=3001
```

## API Endpoints

### Health Check

```
GET /health
```

Returns server health status.

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2024-03-15T00:53:00.000Z",
  "uptime": 123.456
}
```

### Root Endpoint

```
GET /
```

Returns API documentation and configuration.

### Get Balance

```
GET /api/balance/:scriptPubKey?network=mainnet
```

Query the confirmed and unconfirmed balance for a scriptPubKey.

**Parameters:**

- `scriptPubKey` (path, required): Bitcoin script public key in hex format
- `network` (query, optional): `mainnet` (default) or `testnet`

**Response:**

```json
{
  "confirmed": 1500000,
  "unconfirmed": 0
}
```

**Example:**

```bash
curl "http://localhost:3001/api/balance/76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac?network=mainnet"
```

### Get Transaction History

```
GET /api/history/:scriptPubKey?network=mainnet
```

Retrieve all transactions associated with a scriptPubKey, ordered by blockchain confirmation.

**Parameters:**

- `scriptPubKey` (path, required): Bitcoin script public key in hex format
- `network` (query, optional): `mainnet` (default) or `testnet`

**Response:**

```json
[
  {
    "txid": "abc123def456...",
    "height": 850000
  },
  {
    "txid": "def456abc123...",
    "height": 850001
  }
]
```

**Example:**

```bash
curl "http://localhost:3001/api/history/76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac?network=mainnet"
```

### Get Unspent Outputs

```
GET /api/unspent/:scriptPubKey?network=mainnet
```

List all unspent transaction outputs (UTXOs) for a scriptPubKey.

**Parameters:**

- `scriptPubKey` (path, required): Bitcoin script public key in hex format
- `network` (query, optional): `mainnet` (default) or `testnet`

**Response:**

```json
[
  {
    "tx_hash": "abc123def456...",
    "tx_pos": 0,
    "value": 1500000,
    "height": 850000
  },
  {
    "tx_hash": "def456abc123...",
    "tx_pos": 1,
    "value": 2000000,
    "height": 850001
  }
]
```

**Example:**

```bash
curl "http://localhost:3001/api/unspent/76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac?network=mainnet"
```

## Development

### Run in Development Mode

```bash
npm run dev
```

Uses `ts-node` to run TypeScript directly without compilation.

### Build for Production

```bash
npm run build
```

Compiles TypeScript to JavaScript in the `dist/` directory.

### Start Production Server

```bash
npm start
```

Runs the compiled JavaScript from `dist/`.

### Linting and Formatting

```bash
# Lint code
npm run lint

# Format code
npm run format
```

## Docker

Build and run the service in a Docker container:

```bash
# Build image
docker build -t caravan-backend:latest .

# Run container
docker run -d \
  -p 3001:3001 \
  -e ELECTRUM_HOST=192.168.50.144 \
  -e ELECTRUM_PORT=50002 \
  --name caravan-backend \
  caravan-backend:latest

# View logs
docker logs -f caravan-backend

# Stop container
docker stop caravan-backend
```

## Testing

### Test Balance Endpoint

```bash
# Test with mainnet (public scripthash example)
curl -s "http://localhost:3001/api/balance/76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac?network=mainnet" | jq

# Test health endpoint first
curl -s http://localhost:3001/health | jq
```

### Test History Endpoint

```bash
curl -s "http://localhost:3001/api/history/76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac?network=mainnet" | jq
```

### Test Unspent Endpoint

```bash
curl -s "http://localhost:3001/api/unspent/76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac?network=mainnet" | jq
```

## Architecture

```
src/
├── index.ts          # Express server setup, routes, middleware
├── client.ts         # ElectrumClient wrapper, connection management
└── routes/
    ├── balance.ts    # GET /api/balance/:scriptPubKey
    ├── history.ts    # GET /api/history/:scriptPubKey
    └── unspent.ts    # GET /api/unspent/:scriptPubKey
```

### Key Files

#### `index.ts`

- Express server initialization
- Route registration
- Health check endpoint
- Error handling middleware
- Graceful shutdown handlers

#### `client.ts`

- `CaravanElectrumClient` class wrapping ElectrumClient
- Connection pooling (singleton pattern)
- Balance, history, and unspent query methods
- ScriptPubKey → Scripthash conversion (with byte reversal)

#### `routes/`

- Each route file handles a single API endpoint
- Input validation (hex format checking)
- Error handling with descriptive messages
- Network parameter support

## ScriptPubKey Conversion

The backend automatically converts scriptPubKey (as a standard Bitcoin script hex) to Electrum's scripthash format:

1. Double SHA256 hash of the scriptPubKey
2. Byte-reverse the result
3. Return as hex string

This conversion happens transparently in the `toScripthash()` method of `CaravanElectrumClient`.

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200 OK` - Successful query
- `400 Bad Request` - Invalid scriptPubKey format
- `500 Internal Server Error` - Connection or processing errors

Error responses include a descriptive message:

```json
{
  "error": "Failed to retrieve balance",
  "details": "Connection refused"
}
```

## Performance

- **Connection pooling**: Uses singleton pattern for Electrum connection reuse
- **Async/await**: Non-blocking I/O throughout
- **Error resilience**: Graceful handling of connection failures
- **Health checks**: Container health check endpoint available

## Security Considerations

⚠️ **Important**: This service connects directly to an Electrum server. Consider:

- **Network isolation**: Keep the Electrum server on a private network
- **Authentication**: If exposing to the internet, add authentication/TLS
- **Rate limiting**: Consider adding rate limiting for production use
- **Input validation**: All scriptPubKey inputs are validated for hex format
- **CORS**: Not enabled by default; add if needed for web clients

## License

MIT

## Contributing

Part of the Caravan+Fulcrum project. See parent repository for contribution guidelines.
