import { describe, it, expect, beforeEach } from "vitest";

interface Batch {
  manufacturer: string;
  composition: string;
  originTimestamp: bigint;
  currentOwner: string;
  currentStage: bigint;
  lastUpdate: bigint;
  isActive: boolean;
}

interface History {
  stage: bigint;
  owner: string;
  timestamp: bigint;
  metadata: string;
}

const mockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  oracle: "SP000000000000000000002Q6VF78",
  paused: false,
  batchCounter: 0n,
  batches: new Map<string, Batch>(),
  batchHistory: new Map<string, History>(),
  STATUS_CREATED: 0n,
  STATUS_PROCESSED: 1n,
  STATUS_SHIPPED: 2n,
  STATUS_DELIVERED: 3n,
  STATUS_REJECTED: 4n,

  isAdmin(caller: string): boolean {
    return caller === this.admin;
  },

  isValidStage(stage: bigint): boolean {
    return (
      stage === this.STATUS_CREATED ||
      stage === this.STATUS_PROCESSED ||
      stage === this.STATUS_SHIPPED ||
      stage === this.STATUS_DELIVERED ||
      stage === this.STATUS_REJECTED
    );
  },

  transferAdmin(caller: string, newAdmin: string) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (newAdmin === "SP000000000000000000002Q6VF78") return { error: 104 };
    this.admin = newAdmin;
    return { value: true };
  },

  setOracle(caller: string, newOracle: string) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (newOracle === "SP000000000000000000002Q6VF78") return { error: 104 };
    this.oracle = newOracle;
    return { value: true };
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.paused = pause;
    return { value: pause };
  },

  createBatch(caller: string, composition: string, owner: string) {
    if (this.paused) return { error: 103 };
    if (owner === "SP000000000000000000002Q6VF78") return { error: 104 };
    const batchId = this.batchCounter + 1n;
    const batchKey = `${batchId}`;
    if (this.batches.has(batchKey)) return { error: 105 };
    this.batches.set(batchKey, {
      manufacturer: caller,
      composition,
      originTimestamp: 100n,
      currentOwner: owner,
      currentStage: this.STATUS_CREATED,
      lastUpdate: 100n,
      isActive: true,
    });
    this.batchHistory.set(`${batchId}-0`, {
      stage: this.STATUS_CREATED,
      owner,
      timestamp: 100n,
      metadata: "Batch created",
    });
    this.batchCounter = batchId;
    return { value: batchId };
  },

  updateBatchStatus(caller: string, batchId: bigint, newStage: bigint, metadata: string) {
    if (this.paused) return { error: 103 };
    if (!this.isValidStage(newStage)) return { error: 102 };
    const batchKey = `${batchId}`;
    const batch = this.batches.get(batchKey);
    if (!batch) return { error: 101 };
    if (!batch.isActive) return { error: 101 };
    if (caller !== batch.currentOwner && caller !== this.oracle) return { error: 100 };
    const updateIndex = (this.batchHistory.get(`${batchId}-0`)?.stage ? 1n : 0n) + 1n;
    this.batches.set(batchKey, {
      ...batch,
      currentStage: newStage,
      lastUpdate: 101n,
      isActive: newStage !== this.STATUS_REJECTED,
    });
    this.batchHistory.set(`${batchId}-${updateIndex}`, {
      stage: newStage,
      owner: batch.currentOwner,
      timestamp: 101n,
      metadata,
    });
    return { value: true };
  },

  transferBatch(caller: string, batchId: bigint, newOwner: string) {
    if (this.paused) return { error: 103 };
    if (newOwner === "SP000000000000000000002Q6VF78") return { error: 104 };
    const batchKey = `${batchId}`;
    const batch = this.batches.get(batchKey);
    if (!batch) return { error: 101 };
    if (!batch.isActive) return { error: 101 };
    if (caller !== batch.currentOwner) return { error: 100 };
    const updateIndex = (this.batchHistory.get(`${batchId}-0`)?.stage ? 1n : 0n) + 1n;
    this.batches.set(batchKey, { ...batch, currentOwner: newOwner, lastUpdate: 101n });
    this.batchHistory.set(`${batchId}-${updateIndex}`, {
      stage: batch.currentStage,
      owner: newOwner,
      timestamp: 101n,
      metadata: "Ownership transferred",
    });
    return { value: true };
  },

  deactivateBatch(caller: string, batchId: bigint) {
    if (!this.isAdmin(caller)) return { error: 100 };
    const batchKey = `${batchId}`;
    const batch = this.batches.get(batchKey);
    if (!batch) return { error: 101 };
    if (!batch.isActive) return { error: 101 };
    this.batches.set(batchKey, { ...batch, isActive: false, lastUpdate: 101n });
    return { value: true };
  },

  getBatch(batchId: bigint) {
    const batch = this.batches.get(`${batchId}`);
    if (!batch) return { error: 101 };
    return { value: batch };
  },

  getBatchHistory(batchId: bigint, index: bigint) {
    const history = this.batchHistory.get(`${batchId}-${index}`);
    if (!history) return { error: 101 };
    return { value: history };
  },
};

describe("Batch Tracking Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.oracle = "SP000000000000000000002Q6VF78";
    mockContract.paused = false;
    mockContract.batchCounter = 0n;
    mockContract.batches = new Map();
    mockContract.batchHistory = new Map();
  });

  it("should create a batch", () => {
    const result = mockContract.createBatch(
      "ST2CY5...",
      "Chemical XYZ",
      "ST3NB..."
    );
    expect(result).toEqual({ value: 1n });
    expect(mockContract.batches.get("1")).toEqual({
      manufacturer: "ST2CY5...",
      composition: "Chemical XYZ",
      originTimestamp: 100n,
      currentOwner: "ST3NB...",
      currentStage: 0n,
      lastUpdate: 100n,
      isActive: true,
    });
    expect(mockContract.batchHistory.get("1-0")).toEqual({
      stage: 0n,
      owner: "ST3NB...",
      timestamp: 100n,
      metadata: "Batch created",
    });
  });

  it("should prevent batch creation when paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    const result = mockContract.createBatch(
      "ST2CY5...",
      "Chemical XYZ",
      "ST3NB..."
    );
    expect(result).toEqual({ error: 103 });
  });

  it("should update batch status by owner", () => {
    mockContract.createBatch("ST2CY5...", "Chemical XYZ", "ST3NB...");
    const result = mockContract.updateBatchStatus(
      "ST3NB...",
      1n,
      1n,
      "Processed"
    );
    expect(result).toEqual({ value: true });
    expect(mockContract.batches.get("1")?.currentStage).toBe(1n);
    expect(mockContract.batchHistory.get("1-1")).toEqual({
      stage: 1n,
      owner: "ST3NB...",
      timestamp: 101n,
      metadata: "Processed",
    });
  });

  it("should update batch status by oracle", () => {
    mockContract.setOracle(mockContract.admin, "ST4RE...");
    mockContract.createBatch("ST2CY5...", "Chemical XYZ", "ST3NB...");
    const result = mockContract.updateBatchStatus(
      "ST4RE...",
      1n,
      2n,
      "Shipped"
    );
    expect(result).toEqual({ value: true });
    expect(mockContract.batches.get("1")?.currentStage).toBe(2n);
  });

  it("should prevent status update with invalid stage", () => {
    mockContract.createBatch("ST2CY5...", "Chemical XYZ", "ST3NB...");
    const result = mockContract.updateBatchStatus(
      "ST3NB...",
      1n,
      999n,
      "Invalid"
    );
    expect(result).toEqual({ error: 102 });
  });

  it("should transfer batch ownership", () => {
    mockContract.createBatch("ST2CY5...", "Chemical XYZ", "ST3NB...");
    const result = mockContract.transferBatch("ST3NB...", 1n, "ST5PQ...");
    expect(result).toEqual({ value: true });
    expect(mockContract.batches.get("1")?.currentOwner).toBe("ST5PQ...");
    expect(mockContract.batchHistory.get("1-1")).toEqual({
      stage: 0n,
      owner: "ST5PQ...",
      timestamp: 101n,
      metadata: "Ownership transferred",
    });
  });

  it("should prevent unauthorized ownership transfer", () => {
    mockContract.createBatch("ST2CY5...", "Chemical XYZ", "ST3NB...");
    const result = mockContract.transferBatch("ST4RE...", 1n, "ST5PQ...");
    expect(result).toEqual({ error: 100 });
  });

  it("should deactivate batch by admin", () => {
    mockContract.createBatch("ST2CY5...", "Chemical XYZ", "ST3NB...");
    const result = mockContract.deactivateBatch(mockContract.admin, 1n);
    expect(result).toEqual({ value: true });
    expect(mockContract.batches.get("1")?.isActive).toBe(false);
  });

  it("should prevent non-admin from deactivating batch", () => {
    mockContract.createBatch("ST2CY5...", "Chemical XYZ", "ST3NB...");
    const result = mockContract.deactivateBatch("ST4RE...", 1n);
    expect(result).toEqual({ error: 100 });
  });

  it("should get batch details", () => {
    mockContract.createBatch("ST2CY5...", "Chemical XYZ", "ST3NB...");
    const result = mockContract.getBatch(1n);
    expect(result.value).toEqual({
      manufacturer: "ST2CY5...",
      composition: "Chemical XYZ",
      originTimestamp: 100n,
      currentOwner: "ST3NB...",
      currentStage: 0n,
      lastUpdate: 100n,
      isActive: true,
    });
  });

  it("should get batch history", () => {
    mockContract.createBatch("ST2CY5...", "Chemical XYZ", "ST3NB...");
    const result = mockContract.getBatchHistory(1n, 0n);
    expect(result.value).toEqual({
      stage: 0n,
      owner: "ST3NB...",
      timestamp: 100n,
      metadata: "Batch created",
    });
  });

  it("should prevent operations on invalid batch", () => {
    const result = mockContract.getBatch(999n);
    expect(result).toEqual({ error: 101 });
  });
});