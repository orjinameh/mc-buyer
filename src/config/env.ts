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
  get port() {
    return parseInt(optionalEnv('PORT', '3000'), 10);
  },

  get mongodb() {
    return {
      get uri() {
        return requireEnv('MONGODB_URI');
      },
    };
  },

  get vtpass() {
    return {
      get apiKey() {
        return optionalEnv('VTPASS_API_KEY', '');
      },
      get secretKey() {
        return optionalEnv('VTPASS_SECRET_KEY', '');
      },
    };
  },

  get paystack() {
    return {
      get secretKey() {
        return optionalEnv('PAYSTACK_SECRET_KEY', '');
      },
    };
  },

  get monnify() {
    return {
      get apiKey() {
        return optionalEnv('MONNIFY_API_KEY', '');
      },
      get secretKey() {
        return optionalEnv('MONNIFY_SECRET_KEY', '');
      },
      get contractCode() {
        return optionalEnv('MONNIFY_CONTRACT_CODE', '');
      },
    };
  },

  get flutterwave() {
    return {
      get secretKey() {
        return optionalEnv('FLUTTERWAVE_SECRET_KEY', '');
      },
    };
  },

  get stellar() {
    return {
      get network() {
        return optionalEnv('STELLAR_NETWORK', 'testnet') as 'testnet' | 'mainnet';
      },
      get payTo() {
        return optionalEnv('STELLAR_PAY_TO', 'GDEFAULT_PAY_TO_NOT_CONFIGURED');
      },
      get sorobanContractId() {
        return optionalEnv('SOROBAN_CONTRACT_ID', 'CDEFAULT_CONTRACT_NOT_CONFIGURED');
      },
    };
  },

  exchangeRate: {
    fallbackNgNUsd: 1600,
  },
};
