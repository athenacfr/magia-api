import { describe, it, expect } from "vitest";
import { createTestMagia } from "../test";
import { MagiaError } from "../error";

describe("createTestMagia", () => {
  const magia = createTestMagia({
    petstore: {
      getPetById: { data: { id: 1, name: "Rex" } },
      listPets: {
        data: [
          { id: 1, name: "Rex" },
          { id: 2, name: "Buddy" },
        ],
      },
      createPet: { data: { id: 3, name: "Charlie" } },
      deletePet: { error: { status: 404, data: { message: "Pet not found" } } },
    },
  });

  // ── fetch ──

  it("returns static data from fetch", async () => {
    const pet = await magia.petstore.getPetById.fetch({ petId: 1 });
    expect(pet).toEqual({ id: 1, name: "Rex" });
  });

  it("returns array data from fetch", async () => {
    const pets = await magia.petstore.listPets.fetch();
    expect(pets).toHaveLength(2);
  });

  it("throws MagiaError for error mocks", async () => {
    try {
      await magia.petstore.deletePet.fetch({ petId: 999 });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(MagiaError);
      const e = err as MagiaError;
      expect(e.status).toBe(404);
      expect(e.data).toEqual({ message: "Pet not found" });
      expect(e.isNotFound()).toBe(true);
    }
  });

  it("throws helpful error for undefined mock", () => {
    expect(() => magia.petstore.unknownOp.fetch({})).toThrow(
      "No mock defined for petstore.unknownOp",
    );
  });

  // ── function mocks ──

  it("supports function mocks", async () => {
    const magia = createTestMagia({
      petstore: {
        getPetById: (input: Record<string, unknown>) => ({
          id: input.petId,
          name: `Pet #${input.petId}`,
        }),
      },
    });

    const pet = await magia.petstore.getPetById.fetch({ petId: 42 });
    expect(pet).toEqual({ id: 42, name: "Pet #42" });
  });

  it("function mocks can throw MagiaError", async () => {
    const magia = createTestMagia({
      petstore: {
        getPetById: (input: Record<string, unknown>) => {
          if (input.petId === 999) {
            throw new MagiaError("Not found", {
              status: 404,
              code: "404",
              api: "petstore",
              operation: "getPetById",
              data: null,
            });
          }
          return { id: input.petId, name: "Rex" };
        },
      },
    });

    await expect(magia.petstore.getPetById.fetch({ petId: 999 })).rejects.toThrow(MagiaError);
    const pet = await magia.petstore.getPetById.fetch({ petId: 1 });
    expect(pet).toEqual({ id: 1, name: "Rex" });
  });

  // ── isError ──

  it("isError works on test magia", async () => {
    try {
      await magia.petstore.deletePet.fetch({ petId: 999 });
      expect.fail("should have thrown");
    } catch (err) {
      expect(magia.petstore.deletePet.isError(err, 404)).toBe(true);
      expect(magia.petstore.deletePet.isError(err, 500)).toBe(false);
      // Wrong operation
      expect(magia.petstore.getPetById.isError(err, 404)).toBe(false);
    }
  });

  // ── pathKey ──

  it("pathKey returns correct tuple", () => {
    expect(magia.petstore.pathKey()).toEqual(["magia", "petstore"]);
  });

  // ── TanStack Query integration ──

  it("queryOptions returns correct shape", async () => {
    const opts = magia.petstore.getPetById.queryOptions({ petId: 1 });

    expect(opts.queryKey).toEqual(["magia", "petstore", "getPetById", { petId: 1 }]);
    expect(opts.queryFn).toBeTypeOf("function");

    const data = await opts.queryFn();
    expect(data).toEqual({ id: 1, name: "Rex" });
  });

  it("queryOptions without input omits input from key", () => {
    const opts = magia.petstore.listPets.queryOptions({});
    expect(opts.queryKey).toEqual(["magia", "petstore", "listPets"]);
  });

  it("queryKey returns correct tuple", () => {
    expect(magia.petstore.getPetById.queryKey({ petId: 1 })).toEqual([
      "magia",
      "petstore",
      "getPetById",
      { petId: 1 },
    ]);
    expect(magia.petstore.getPetById.queryKey()).toEqual(["magia", "petstore", "getPetById"]);
  });

  it("mutationOptions returns correct shape", async () => {
    const opts = magia.petstore.createPet.mutationOptions();

    expect(opts.mutationKey).toEqual(["magia", "petstore", "createPet"]);
    expect(opts.mutationFn).toBeTypeOf("function");

    const data = await opts.mutationFn({ name: "Charlie" });
    expect(data).toEqual({ id: 3, name: "Charlie" });
  });

  it("mutationOptions passes through extra options", () => {
    const onSuccess = () => {};
    const opts = magia.petstore.createPet.mutationOptions({ onSuccess });
    expect(opts.onSuccess).toBe(onSuccess);
  });

  it("mutationKey returns correct tuple", () => {
    expect(magia.petstore.createPet.mutationKey()).toEqual(["magia", "petstore", "createPet"]);
  });

  // ── queryOptions with error mock ──

  it("queryFn throws MagiaError for error mocks", async () => {
    const opts = magia.petstore.deletePet.queryOptions({ petId: 999 });
    await expect(opts.queryFn()).rejects.toThrow(MagiaError);
  });

  // ── multiple APIs ──

  it("supports multiple APIs", async () => {
    const magia = createTestMagia({
      petstore: {
        getPetById: { data: { id: 1 } },
      },
      payments: {
        getInvoice: { data: { id: "inv_123", amount: 100 } },
      },
    });

    const pet = await magia.petstore.getPetById.fetch({ petId: 1 });
    const invoice = await magia.payments.getInvoice.fetch({ invoiceId: "inv_123" });

    expect(pet).toEqual({ id: 1 });
    expect(invoice).toEqual({ id: "inv_123", amount: 100 });
  });
});
