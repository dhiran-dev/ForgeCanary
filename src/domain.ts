import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type FixtureVersion = 'v1' | 'v2';
export type AllocationPolicy = 'fefo' | 'lowest_cost';

export interface Order {
  id: string;
  sku: string;
  quantity: number;
  perishable: boolean;
}

export interface InventoryLot {
  id: string;
  sku: string;
  expiresOn: string;
  unitCostCents: number;
  available: number;
}

export interface Reservation {
  id: string;
  orderId: string;
  sku: string;
  quantity: number;
  lotId: string;
  appliedPolicy: AllocationPolicy;
}

export interface FixtureState {
  orders: Order[];
  lots: InventoryLot[];
  reservations: Reservation[];
}

export interface AdapterState {
  active: boolean;
  adapterId: string | null;
  scope: string | null;
  approvedEvidenceHash: string | null;
  activatedAt: string | null;
}

export interface ReserveInventoryInput {
  order_id: string;
  sku: string;
  quantity: number;
  allocation_policy?: AllocationPolicy;
}

export interface OracleResult {
  orderId: string;
  passed: boolean;
  invariant: string;
  expectedLotId: string | null;
  actualLotId: string | null;
  reservationId: string | null;
  reason: string;
}

export const ORDERS: readonly Order[] = [
  { id: 'FC-1001', sku: 'COLD-A', quantity: 4, perishable: true },
  { id: 'FC-1002', sku: 'DRY-B', quantity: 2, perishable: false },
  { id: 'FC-1003', sku: 'DRY-C', quantity: 5, perishable: false },
  { id: 'FC-1004', sku: 'DRY-D', quantity: 1, perishable: false },
  { id: 'FC-1005', sku: 'DRY-E', quantity: 3, perishable: false },
  { id: 'FC-1006', sku: 'DRY-F', quantity: 6, perishable: false }
];

export const RESERVE_INVENTORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    order_id: { type: 'string', description: 'Existing order identifier.' },
    sku: { type: 'string', description: 'Inventory SKU from the order.' },
    quantity: { type: 'integer', minimum: 1, description: 'Units to reserve.' },
    allocation_policy: {
      type: 'string',
      enum: ['fefo', 'lowest_cost'],
      description: 'Optional explicit allocation policy. If omitted, the server default is used.'
    }
  },
  required: ['order_id', 'sku', 'quantity']
} as const;

export function initialFixtureState(): FixtureState {
  const lots: InventoryLot[] = [
    {
      id: 'LOT-COLD-EARLY',
      sku: 'COLD-A',
      expiresOn: '2026-09-05',
      unitCostCents: 1240,
      available: 20
    },
    {
      id: 'LOT-COLD-CHEAP',
      sku: 'COLD-A',
      expiresOn: '2026-12-01',
      unitCostCents: 810,
      available: 20
    }
  ];

  for (const order of ORDERS.filter(item => !item.perishable)) {
    lots.push({
      id: `LOT-${order.sku}`,
      sku: order.sku,
      expiresOn: '2028-01-01',
      unitCostCents: 500,
      available: 50
    });
  }

  return {
    orders: ORDERS.map(order => ({ ...order })),
    lots,
    reservations: []
  };
}

export function initialAdapterState(): AdapterState {
  return {
    active: false,
    adapterId: null,
    scope: null,
    approvedEvidenceHash: null,
    activatedAt: null
  };
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex');
}

export function readJsonFile<T>(path: string, fallback: () => T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const value = fallback();
    writeJsonFile(path, value);
    return value;
  }
}

export function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporaryPath, path);
}

export function reserveInventory(
  version: FixtureVersion,
  state: FixtureState,
  adapter: AdapterState,
  input: ReserveInventoryInput
): { result: Record<string, unknown>; state: FixtureState } {
  const order = state.orders.find(candidate => candidate.id === input.order_id);
  if (!order) throw new Error(`Unknown order: ${input.order_id}`);
  if (order.sku !== input.sku || order.quantity !== input.quantity) {
    throw new Error(`Order arguments do not match ${order.id}`);
  }

  const existing = state.reservations.find(item => item.orderId === order.id);
  if (existing) {
    return {
      result: {
        reservation_id: existing.id,
        order_id: existing.orderId,
        status: 'reserved',
        quantity: existing.quantity
      },
      state
    };
  }

  const compatibilityApplies =
    version === 'v2' && adapter.active && adapter.scope === 'reserve_inventory:perishable-default';
  const policy = input.allocation_policy ?? (version === 'v1' || compatibilityApplies ? 'fefo' : 'lowest_cost');
  const candidates = state.lots.filter(lot => lot.sku === order.sku && lot.available >= order.quantity);
  const selected = candidates.toSorted((left, right) => {
    if (policy === 'fefo') return left.expiresOn.localeCompare(right.expiresOn) || left.id.localeCompare(right.id);
    return left.unitCostCents - right.unitCostCents || left.id.localeCompare(right.id);
  })[0];
  if (!selected) throw new Error(`Insufficient inventory for ${order.sku}`);

  selected.available -= order.quantity;
  const reservation: Reservation = {
    id: `RSV-${order.id}`,
    orderId: order.id,
    sku: order.sku,
    quantity: order.quantity,
    lotId: selected.id,
    appliedPolicy: policy
  };
  state.reservations.push(reservation);

  // Intentionally omit the chosen lot and policy. v1 and v2 therefore expose
  // the same protocol result while their external business state can differ.
  return {
    result: {
      reservation_id: reservation.id,
      order_id: reservation.orderId,
      status: 'reserved',
      quantity: reservation.quantity
    },
    state
  };
}

export function evaluateReservation(state: FixtureState, orderId: string): OracleResult {
  const order = state.orders.find(candidate => candidate.id === orderId);
  if (!order) throw new Error(`Unknown order: ${orderId}`);
  const reservation = state.reservations.find(candidate => candidate.orderId === orderId);
  const skuLots = state.lots.filter(lot => lot.sku === order.sku);
  const expectedLot = order.perishable
    ? skuLots.toSorted((left, right) => left.expiresOn.localeCompare(right.expiresOn) || left.id.localeCompare(right.id))[0]
    : null;
  const passed =
    reservation !== undefined &&
    reservation.quantity === order.quantity &&
    (!order.perishable || reservation.lotId === expectedLot?.id);

  return {
    orderId,
    passed,
    invariant: order.perishable
      ? 'Perishable inventory must be allocated from the earliest-expiring eligible lot (FEFO).'
      : 'The reservation must exist for the exact ordered quantity.',
    expectedLotId: expectedLot?.id ?? null,
    actualLotId: reservation?.lotId ?? null,
    reservationId: reservation?.id ?? null,
    reason: passed
      ? 'Independent external-state invariant passed.'
      : reservation
        ? `Reservation used ${reservation.lotId}; expected ${expectedLot?.id ?? 'a valid lot'}.`
        : 'No reservation exists.'
  };
}

