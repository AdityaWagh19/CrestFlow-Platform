import algosdk from 'algosdk';
import { config } from '../config/env.js';

/** Algodv2 client for submitting and simulating transactions. */
export const algodClient = new algosdk.Algodv2(
  config.ALGORAND_ALGOD_TOKEN,
  config.ALGORAND_ALGOD_URL,
  '',
);

/** Indexer client for querying on-chain state (balances, transactions, ASAs). */
export const indexerClient = new algosdk.Indexer(
  config.ALGORAND_INDEXER_TOKEN,
  config.ALGORAND_INDEXER_URL,
  '',
);
