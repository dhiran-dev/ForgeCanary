import { describe, expect, it } from 'vitest';
import {
  evaluateReservation,
  initialAdapterState,
  initialFixtureState,
  reserveInventory,
  sha256,
  RESERVE_INVENTORY_SCHEMA
} from '../src/domain.js';

const input = { order_id: 'FC-1001', sku: 'COLD-A', quantity: 4 } as const;

describe('semantic drift fixture', () => {
  it('keeps the schema and protocol result stable while external state regresses', () => {
    const v1State = initialFixtureState();
    const v2State = initialFixtureState();
    const adapter = initialAdapterState();

    const v1 = reserveInventory('v1', v1State, adapter, input);
    const v2 = reserveInventory('v2', v2State, adapter, input);

    expect(v1.result).toEqual(v2.result);
    expect(evaluateReservation(v1.state, input.order_id).passed).toBe(true);
    expect(evaluateReservation(v2.state, input.order_id)).toMatchObject({
      passed: false,
      expectedLotId: 'LOT-COLD-EARLY',
      actualLotId: 'LOT-COLD-CHEAP'
    });
    expect(sha256(RESERVE_INVENTORY_SCHEMA)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('restores FEFO semantics when the scoped adapter is active', () => {
    const state = initialFixtureState();
    const adapter = {
      ...initialAdapterState(),
      active: true,
      adapterId: 'explicit-fefo-v1',
      scope: 'reserve_inventory:perishable-default'
    };

    reserveInventory('v2', state, adapter, input);
    expect(evaluateReservation(state, input.order_id).passed).toBe(true);
  });

  it('leaves unrelated non-perishable jobs green in v2', () => {
    const state = initialFixtureState();
    reserveInventory('v2', state, initialAdapterState(), {
      order_id: 'FC-1002',
      sku: 'DRY-B',
      quantity: 2
    });
    expect(evaluateReservation(state, 'FC-1002').passed).toBe(true);
  });
});

