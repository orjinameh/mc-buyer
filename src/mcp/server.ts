import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ToolRegistry, ToolContext } from './tools/registry.js';
import { SpendingAccountManager } from '../accounts/spendingAccount.js';
import { AgentPolicyManager } from '../agents/policies.js';
import { QuoteManager } from '../payments/quotes.js';
import { PaymentAuthorizationManager } from '../payments/authorization.js';
import { SettlementLayer } from '../payments/settlement.js';
import { VTpassProvider } from '../vtu/providers/vtpass.js';
import { StellarAccountManager } from '../stellar/account.js';
import { config } from '../config/env.js';
import type { IExchangeRateProvider } from '9bridge';

export function createMCPServer(rateProvider: IExchangeRateProvider): McpServer {
  const accounts = new SpendingAccountManager();
  const policies = new AgentPolicyManager();
  const quotes = new QuoteManager(rateProvider);
  const authorizations = new PaymentAuthorizationManager();
  const settlement = new SettlementLayer(accounts, authorizations);
  const vtpass = new VTpassProvider(config.vtpass);
  const stellarAccounts = new StellarAccountManager({
    network: config.stellar.network,
    contractId: config.stellar.sorobanContractId,
  });

  const tools = new ToolRegistry(
    accounts, policies, quotes, authorizations, settlement, vtpass, stellarAccounts,
  );

  const server = new McpServer({
    name: 'MC Buyer',
    version: '1.0.0',
  });

  server.tool(
    'get_spending_balance',
    'Returns the agent available Stellar spending balance in USDC',
    {},
    async (_args: any, extra: any) => {
      const ctx: ToolContext = {
        userId: extra?.userId ?? 'anonymous',
        agentId: extra?.agentId ?? 'default-agent',
      };
      const result = await tools.getSpendingBalance(ctx);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    'quote_airtime',
    'Get a USDC-denominated quote for airtime purchase',
    {
      network: z.string().describe('Network provider: mtn, airtel, glo, 9mobile'),
      amountNGN: z.number().describe('Amount in NGN'),
    },
    async (args: any, extra: any) => {
      const result = await tools.quoteAirtime({
        network: args.network,
        amountNGN: args.amountNGN,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    'buy_airtime',
    'Purchase airtime using Stellar USDC spending balance',
    {
      phoneNumber: z.string().describe('Phone number to credit'),
      network: z.string().describe('Network provider: mtn, airtel, glo, 9mobile'),
      amountNGN: z.number().describe('Amount in NGN'),
      quoteId: z.string().describe('Quote ID from quote_airtime'),
    },
    async (args: any, extra: any) => {
      const ctx: ToolContext = {
        userId: extra?.userId ?? 'anonymous',
        agentId: extra?.agentId ?? 'default-agent',
      };
      const result = await tools.buyAirtime({
        phoneNumber: args.phoneNumber,
        network: args.network,
        amountNGN: args.amountNGN,
        quoteId: args.quoteId,
      }, ctx);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    'quote_data',
    'Get a USDC-denominated quote for mobile data purchase',
    {
      network: z.string().describe('Network provider: mtn, airtel, glo, 9mobile'),
      plan: z.string().describe('Data plan ID'),
    },
    async (args: any, extra: any) => {
      const result = await tools.quoteData({
        network: args.network,
        plan: args.plan,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    'buy_data',
    'Purchase mobile data using Stellar USDC spending balance',
    {
      phoneNumber: z.string().describe('Phone number to credit'),
      network: z.string().describe('Network provider: mtn, airtel, glo, 9mobile'),
      plan: z.string().describe('Data plan ID'),
      quoteId: z.string().describe('Quote ID from quote_data'),
    },
    async (args: any, extra: any) => {
      const ctx: ToolContext = {
        userId: extra?.userId ?? 'anonymous',
        agentId: extra?.agentId ?? 'default-agent',
      };
      const result = await tools.buyData({
        phoneNumber: args.phoneNumber,
        network: args.network,
        plan: args.plan,
        quoteId: args.quoteId,
      }, ctx);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    'quote_electricity',
    'Get a USDC-denominated quote for electricity payment',
    {
      discoProvider: z.string().describe('Electricity distribution company'),
      amountNGN: z.number().describe('Amount in NGN'),
    },
    async (args: any, extra: any) => {
      const result = await tools.quoteElectricity({
        discoProvider: args.discoProvider,
        amountNGN: args.amountNGN,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    'pay_electricity_bill',
    'Pay an electricity bill using Stellar USDC spending balance',
    {
      meterNumber: z.string().describe('Meter number'),
      discoProvider: z.string().describe('Electricity distribution company'),
      amountNGN: z.number().describe('Amount in NGN'),
      quoteId: z.string().describe('Quote ID from quote_electricity'),
    },
    async (args: any, extra: any) => {
      const ctx: ToolContext = {
        userId: extra?.userId ?? 'anonymous',
        agentId: extra?.agentId ?? 'default-agent',
      };
      const result = await tools.payElectricityBill({
        meterNumber: args.meterNumber,
        discoProvider: args.discoProvider,
        amountNGN: args.amountNGN,
        quoteId: args.quoteId,
      }, ctx);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    'quote_cable',
    'Get a USDC-denominated quote for cable TV subscription',
    {
      provider: z.string().describe('Cable provider: dstv, gotv, startimes'),
      bundlePlan: z.string().describe('Cable plan ID'),
    },
    async (args: any, extra: any) => {
      const result = await tools.quoteCable({
        provider: args.provider,
        bundlePlan: args.bundlePlan,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    'renew_cable_tv',
    'Renew cable TV subscription using Stellar USDC spending balance',
    {
      smartCardNumber: z.string().describe('Smart card / IUC number'),
      provider: z.string().describe('Cable provider: dstv, gotv, startimes'),
      bundlePlan: z.string().describe('Cable plan ID'),
      quoteId: z.string().describe('Quote ID from quote_cable'),
    },
    async (args: any, extra: any) => {
      const ctx: ToolContext = {
        userId: extra?.userId ?? 'anonymous',
        agentId: extra?.agentId ?? 'default-agent',
      };
      const result = await tools.renewCableTv({
        smartCardNumber: args.smartCardNumber,
        provider: args.provider,
        bundlePlan: args.bundlePlan,
        quoteId: args.quoteId,
      }, ctx);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  return server;
}
