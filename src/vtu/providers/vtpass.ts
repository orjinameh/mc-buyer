import axios, { AxiosInstance } from 'axios';
import { IVTUProvider } from '../service.js';
import { ServiceResult } from '../../stellar/types.js';
import { ProviderError, ServiceExecutionError } from '../../errors/index.js';

interface VTpassConfig {
  apiKey: string;
  secretKey: string;
}

export class VTpassProvider implements IVTUProvider {
  private client: AxiosInstance;

  constructor(config: VTpassConfig) {
    this.client = axios.create({
      baseURL: 'https://vtpass.com/api',
      headers: {
        'api-key': config.apiKey,
        'secret-key': config.secretKey,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });
  }

  private async request(method: string, url: string, data?: any): Promise<any> {
    try {
      const response = await this.client.request({ method: method as any, url, data });
      return response.data;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      const axiosErr = err as any;
      throw new ProviderError(
        'vtpass',
        axiosErr.response?.data?.response_message ?? axiosErr.message,
      );
    }
  }

  private validateResponse(data: any): void {
    if (data.response_code !== '000') {
      throw new ServiceExecutionError(
        'vtpass',
        data.response_message ?? 'Unknown provider error',
      );
    }
  }

  async buyAirtime(params: {
    phoneNumber: string;
    network: string;
    amountNGN: number;
    reference: string;
  }): Promise<ServiceResult> {
    const data = await this.request('POST', '/airtime', {
      request_id: params.reference,
      serviceID: params.network,
      amount: params.amountNGN.toString(),
      phone_number: params.phoneNumber,
    });

    this.validateResponse(data);

    return {
      success: true,
      reference: params.reference,
      providerReference: data.content?.transactions?.[0]?.transactionId,
      message: data.response_message ?? 'Airtime delivered',
      metadata: data.content ?? {},
    };
  }

  async buyData(params: {
    phoneNumber: string;
    network: string;
    plan: string;
    reference: string;
  }): Promise<ServiceResult> {
    const data = await this.request('POST', '/data', {
      request_id: params.reference,
      serviceID: params.plan,
      phone_number: params.phoneNumber,
    });

    this.validateResponse(data);

    return {
      success: true,
      reference: params.reference,
      providerReference: data.content?.transactions?.[0]?.transactionId,
      message: data.response_message ?? 'Data delivered',
      metadata: data.content ?? {},
    };
  }

  async payElectricity(params: {
    meterNumber: string;
    discoProvider: string;
    amountNGN: number;
    reference: string;
  }): Promise<ServiceResult> {
    const data = await this.request('POST', '/electricity', {
      request_id: params.reference,
      serviceID: params.discoProvider,
      amount: params.amountNGN.toString(),
      meter_number: params.meterNumber,
    });

    this.validateResponse(data);

    return {
      success: true,
      reference: params.reference,
      providerReference: data.content?.transactions?.[0]?.transactionId,
      message: data.response_message ?? 'Electricity token generated',
      metadata: {
        token: data.content?.transactions?.[0]?.token,
        units: data.content?.transactions?.[0]?.units,
        ...data.content,
      },
    };
  }

  async renewCable(params: {
    smartCardNumber: string;
    provider: string;
    bundlePlan: string;
    reference: string;
  }): Promise<ServiceResult> {
    const data = await this.request('POST', '/tv', {
      request_id: params.reference,
      serviceID: params.bundlePlan,
      billerCode: params.smartCardNumber,
    });

    this.validateResponse(data);

    return {
      success: true,
      reference: params.reference,
      providerReference: data.content?.transactions?.[0]?.transactionId,
      message: data.response_message ?? 'Cable subscription renewed',
      metadata: data.content ?? {},
    };
  }
}
