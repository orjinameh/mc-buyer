function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: parseInt(optionalEnv('PORT', '3000'), 10),

  vtpass: {
    apiKey: requireEnv('VTPASS_API_KEY'),
    secretKey: requireEnv('VTPASS_SECRET_KEY'),
  },

  paystack: {
    secretKey: optionalEnv('PAYSTACK_SECRET_KEY', ''),
  },

  monnify: {
    apiKey: optionalEnv('MONNIFY_API_KEY', ''),
    secretKey: optionalEnv('MONNIFY_SECRET_KEY', ''),
    contractCode: optionalEnv('MONNIFY_CONTRACT_CODE', ''),
  },

  flutterwave: {
    secretKey: optionalEnv('FLUTTERWAVE_SECRET_KEY', ''),
  },

  stellar: {
    network: optionalEnv('STELLAR_NETWORK', 'testnet') as 'testnet' | 'mainnet',
    payTo: requireEnv('STELLAR_PAY_TO'),
    sorobanContractId: requireEnv('SOROBAN_CONTRACT_ID'),
  },

  exchangeRate: {
    fallbackNgNUsd: 1600,
  },
} as const;
