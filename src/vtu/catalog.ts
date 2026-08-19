export const AIRTIME_CATALOG = {
  mtn: {
    name: 'MTN',
    variations: [
      { id: 'mtn-100', amount: 100, label: '₦100' },
      { id: 'mtn-200', amount: 200, label: '₦200' },
      { id: 'mtn-500', amount: 500, label: '₦500' },
      { id: 'mtn-1000', amount: 1000, label: '₦1,000' },
      { id: 'mtn-2000', amount: 2000, label: '₦2,000' },
      { id: 'mtn-5000', amount: 5000, label: '₦5,000' },
    ],
  },
  airtel: {
    name: 'Airtel',
    variations: [
      { id: 'airtel-100', amount: 100, label: '₦100' },
      { id: 'airtel-200', amount: 200, label: '₦200' },
      { id: 'airtel-500', amount: 500, label: '₦500' },
      { id: 'airtel-1000', amount: 1000, label: '₦1,000' },
      { id: 'airtel-2000', amount: 2000, label: '₦2,000' },
    ],
  },
  glo: {
    name: 'Glo',
    variations: [
      { id: 'glo-100', amount: 100, label: '₦100' },
      { id: 'glo-200', amount: 200, label: '₦200' },
      { id: 'glo-500', amount: 500, label: '₦500' },
      { id: 'glo-1000', amount: 1000, label: '₦1,000' },
    ],
  },
  '9mobile': {
    name: '9mobile',
    variations: [
      { id: '9mobile-100', amount: 100, label: '₦100' },
      { id: '9mobile-200', amount: 200, label: '₦200' },
      { id: '9mobile-500', amount: 500, label: '₦500' },
      { id: '9mobile-1000', amount: 1000, label: '₦1,000' },
    ],
  },
} as const;

export const DATA_CATALOG = {
  mtn: {
    name: 'MTN',
    plans: [
      { id: 'mtn-150mb-30d', size: '150MB', validity: '30 days', price: 200 },
      { id: 'mtn-1gb-30d', size: '1GB', validity: '30 days', price: 1000 },
      { id: 'mtn-3gb-30d', size: '3GB', validity: '30 days', price: 2500 },
      { id: 'mtn-5gb-30d', size: '5GB', validity: '30 days', price: 3500 },
      { id: 'mtn-10gb-30d', size: '10GB', validity: '30 days', price: 5000 },
    ],
  },
  airtel: {
    name: 'Airtel',
    plans: [
      { id: 'airtel-100mb-30d', size: '100MB', validity: '30 days', price: 200 },
      { id: 'airtel-750mb-30d', size: '750MB', validity: '30 days', price: 750 },
      { id: 'airtel-1.5gb-30d', size: '1.5GB', validity: '30 days', price: 1500 },
      { id: 'airtel-3gb-30d', size: '3GB', validity: '30 days', price: 2500 },
      { id: 'airtel-10gb-30d', size: '10GB', validity: '30 days', price: 5000 },
    ],
  },
  glo: {
    name: 'Glo',
    plans: [
      { id: 'glo-1gb-30d', size: '1GB', validity: '30 days', price: 1000 },
      { id: 'glo-2.5gb-30d', size: '2.5GB', validity: '30 days', price: 2000 },
      { id: 'glo-5gb-30d', size: '5GB', validity: '30 days', price: 3500 },
      { id: 'glo-10gb-30d', size: '10GB', validity: '30 days', price: 5000 },
    ],
  },
  '9mobile': {
    name: '9mobile',
    plans: [
      { id: '9mobile-500mb-30d', size: '500MB', validity: '30 days', price: 500 },
      { id: '9mobile-1.5gb-30d', size: '1.5GB', validity: '30 days', price: 1200 },
      { id: '9mobile-3gb-30d', size: '3GB', validity: '30 days', price: 2500 },
      { id: '9mobile-10gb-30d', size: '10GB', validity: '30 days', price: 5000 },
    ],
  },
} as const;

export const ELECTRICITY_CATALOG = {
  providers: [
    { id: 'ikeja-electric', name: 'Ikeja Electric' },
    { id: 'eko-electric', name: 'Eko Electric' },
    { id: 'ibadan-electric', name: 'Ibadan Electric' },
    { id: 'enugu-electric', name: 'Enugu Electric' },
    { id: 'jos-electric', name: 'Jos Electric' },
    { id: 'kaduna-electric', name: 'Kaduna Electric' },
    { id: 'kano-electric', name: 'Kano Electric' },
    { id: 'port-harcourt-electric', name: 'Port Harcourt Electric' },
    { id: 'abuja-electric', name: 'Abuja Electric' },
    { id: 'benin-electric', name: 'Benin Electric' },
    { id: 'yola-electric', name: 'Yola Electric' },
  ],
  amounts: [1000, 2000, 3000, 5000, 10000, 15000, 20000, 25000, 50000],
} as const;

export const CABLE_CATALOG = {
  dstv: {
    name: 'DStv',
    plans: [
      { id: 'dstv-padi', name: 'Padi', price: 2150 },
      { id: 'dstv-yanga', name: 'Yanga', price: 3600 },
      { id: 'dstv-confam', name: 'Confam', price: 5400 },
      { id: 'dstv-jolli', name: 'Jolli', price: 7200 },
      { id: 'dstv-max', name: 'Max', price: 12500 },
      { id: 'dstv-premium', name: 'Premium', price: 21000 },
    ],
  },
  gotv: {
    name: 'GOtv',
    plans: [
      { id: 'gotv-lite', name: 'Lite', price: 1100 },
      { id: 'gotv-jolli', name: 'Jolli', price: 2800 },
      { id: 'gotv-max', name: 'Max', price: 4600 },
    ],
  },
  startimes: {
    name: 'Startimes',
    plans: [
      { id: 'startimes-basic', name: 'Basic', price: 2200 },
      { id: 'startimes-smart', name: 'Smart', price: 2800 },
      { id: 'startimes-basic-plus', name: 'Basic Plus', price: 3300 },
      { id: 'startimesclassic', name: 'Classic', price: 4800 },
      { id: 'startimes-premium', name: 'Premium', price: 6200 },
    ],
  },
} as const;

export function findAirtimeAmount(network: string, amount: number): { id: string; amount: number } | undefined {
  const catalog = AIRTIME_CATALOG[network as keyof typeof AIRTIME_CATALOG];
  if (!catalog) return undefined;
  return catalog.variations.find((v) => v.amount === amount);
}

export function findDataPlan(network: string, planId: string) {
  const catalog = DATA_CATALOG[network as keyof typeof DATA_CATALOG];
  if (!catalog) return undefined;
  return catalog.plans.find((p) => p.id === planId);
}

export function findCablePlan(provider: string, planId: string) {
  const catalog = CABLE_CATALOG[provider as keyof typeof CABLE_CATALOG];
  if (!catalog) return undefined;
  return catalog.plans.find((p) => p.id === planId);
}
