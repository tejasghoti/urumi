export interface WooConfig {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  timeoutMs?: number;
}

export interface WooProduct {
  id: number;
  name: string;
  price: string;
  status: string;
  permalink: string;
}

export interface WooOrder {
  id: number;
  number: string;
  status: string;
  total: string;
  currency: string;
  date_created: string;
  line_items: Array<{ name: string; quantity: number }>;
  billing?: { first_name: string; last_name: string; email?: string; phone?: string };
}

export class WooClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    message?: string
  ) {
    super(message || `WooCommerce API Error (HTTP ${status}): ${body}`);
    this.name = 'WooClientError';
  }
}

export class WooClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;

  constructor(config: WooConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    const token = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');
    this.authHeader = `Basic ${token}`;
    this.timeoutMs = config.timeoutMs ?? 8000;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/wp-json/wc/v3${endpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(options.headers || {}),
        },
      });

      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }

      if (!response.ok) {
        const bodyStr = typeof data === 'object' ? JSON.stringify(data) : String(data);
        throw new WooClientError(response.status, bodyStr);
      }

      return data as T;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new WooClientError(504, 'Request timed out after 8s');
      }
      if (err instanceof WooClientError) {
        throw err;
      }
      throw new WooClientError(500, err.message || String(err));
    } finally {
      clearTimeout(timeout);
    }
  }

  async listProducts(params?: { search?: string; perPage?: number }): Promise<WooProduct[]> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    query.set('per_page', String(params?.perPage || 20));

    const raw = await this.request<any[]>(`/products?${query.toString()}`);
    return raw.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price || p.regular_price || '0',
      status: p.status,
      permalink: p.permalink,
    }));
  }

  async createProduct(params: { name: string; regularPrice: string | number }): Promise<WooProduct> {
    const raw = await this.request<any>('/products', {
      method: 'POST',
      body: JSON.stringify({
        name: params.name,
        type: 'simple',
        regular_price: String(params.regularPrice),
        status: 'publish',
        catalog_visibility: 'visible',
        manage_stock: false,
        stock_status: 'instock',
      }),
    });

    return {
      id: raw.id,
      name: raw.name,
      price: raw.price || raw.regular_price || String(params.regularPrice),
      status: raw.status || 'publish',
      permalink: raw.permalink,
    };
  }

  async listOrders(params?: { after?: string; status?: string; perPage?: number }): Promise<WooOrder[]> {
    const query = new URLSearchParams();
    if (params?.after) query.set('after', params.after);
    if (params?.status) query.set('status', params.status);
    query.set('per_page', String(params?.perPage || 20));

    const raw = await this.request<any[]>(`/orders?${query.toString()}`);
    return raw.map((o) => ({
      id: o.id,
      number: String(o.number || o.id),
      status: o.status,
      total: o.total,
      currency: o.currency,
      date_created: o.date_created,
      line_items: (o.line_items || []).map((li: any) => ({
        name: li.name,
        quantity: li.quantity,
      })),
      billing: o.billing ? {
        first_name: o.billing.first_name,
        last_name: o.billing.last_name,
        email: o.billing.email,
        phone: o.billing.phone,
      } : undefined,
    }));
  }

  async getOrder(id: number): Promise<WooOrder> {
    const o = await this.request<any>(`/orders/${id}`);
    return {
      id: o.id,
      number: String(o.number || o.id),
      status: o.status,
      total: o.total,
      currency: o.currency,
      date_created: o.date_created,
      line_items: (o.line_items || []).map((li: any) => ({
        name: li.name,
        quantity: li.quantity,
      })),
      billing: o.billing ? {
        first_name: o.billing.first_name,
        last_name: o.billing.last_name,
        email: o.billing.email,
        phone: o.billing.phone,
      } : undefined,
    };
  }

  async updateOrderStatus(id: number, status: string): Promise<{ id: number; status: string }> {
    const o = await this.request<any>(`/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    return {
      id: o.id,
      status: o.status,
    };
  }
}
