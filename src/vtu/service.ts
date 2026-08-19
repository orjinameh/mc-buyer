import { ServiceResult } from '../stellar/types.js';

export interface IVTUProvider {
  buyAirtime(params: {
    phoneNumber: string;
    network: string;
    amountNGN: number;
    reference: string;
  }): Promise<ServiceResult>;

  buyData(params: {
    phoneNumber: string;
    network: string;
    plan: string;
    reference: string;
  }): Promise<ServiceResult>;

  payElectricity(params: {
    meterNumber: string;
    discoProvider: string;
    amountNGN: number;
    reference: string;
  }): Promise<ServiceResult>;

  renewCable(params: {
    smartCardNumber: string;
    provider: string;
    bundlePlan: string;
    reference: string;
  }): Promise<ServiceResult>;
}
