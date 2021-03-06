// @flow
import invariant from "invariant";
import { renderHook, act } from "@testing-library/react-hooks";
import { getAccountUnit } from "../../account";
import { getAccountBridge, getCurrencyBridge } from "../../bridge";
import { getCryptoCurrencyById } from "../../currencies";
import { setEnv } from "../../env";
import { makeBridgeCacheSystem } from "../../bridge/cache";
import { genAccount, genAddingOperationsInAccount } from "../../mock/account";
import type { Account, CurrencyBridge } from "../../types";
import type { Transaction } from "./types";
import { getCurrentCosmosPreloadData } from "./preloadedData";
import preloadedMockData from "./preloadedData.mock";
import * as hooks from "./react";

let localCache = {};
const cache = makeBridgeCacheSystem({
  saveData(c, d) {
    localCache[c.id] = d;
    return Promise.resolve();
  },
  getData(c) {
    return Promise.resolve(localCache[c.id]);
  },
});

describe("cosmos/react", () => {
  describe("useCosmosPreloadData", () => {
    it("should return Cosmos preload data and updates", async () => {
      const { prepare } = setup();
      const { result } = renderHook(() => hooks.useCosmosPreloadData());

      const data = getCurrentCosmosPreloadData();
      expect(result.current).toStrictEqual(data);

      await act(() => prepare());

      expect(result.current).toStrictEqual(preloadedMockData);
    });
  });

  describe("useCosmosFormattedDelegations", () => {
    it("should return formatted delegations", async () => {
      const { account, prepare } = setup();
      await prepare();

      const { result } = renderHook(() =>
        hooks.useCosmosMappedDelegations(account)
      );

      const delegations = account.cosmosResources?.delegations;
      invariant(delegations, "cosmos: delegations is required");

      expect(Array.isArray(result.current)).toBe(true);
      expect(result.current.length).toBe(delegations.length);

      const { code } = getAccountUnit(account);
      expect(result.current[0].formattedAmount.split(" ")[1]).toBe(code);
      expect(result.current[0].formattedPendingRewards.split(" ")[1]).toBe(
        code
      );
      expect(typeof result.current[0].rank).toBe("number");
      expect(result.current[0].validator.validatorAddress).toBe(
        delegations[0].validatorAddress
      );
    });

    describe("mode: claimReward", () => {
      it("should only return delegations which have some pending rewards", async () => {
        const { account, prepare } = setup();
        await prepare();

        const { result } = renderHook(() =>
          hooks.useCosmosMappedDelegations(account, "claimReward")
        );

        expect(result.current.length).toBe(2);
      });
    });
  });

  describe("useCosmosDelegationsQuerySelector", () => {
    it("should return delegations filtered by query as options", async () => {
      const { account, transaction, prepare } = setup();
      await prepare();

      invariant(
        account.cosmosResources,
        "cosmos: account and cosmos resources required"
      );
      const delegations = account.cosmosResources.delegations || [];
      const newTx = {
        ...transaction,
        mode: "delegate",
        validators: delegations.map(({ validatorAddress, amount }) => ({
          address: validatorAddress,
          amount,
        })),
      };
      const { result } = renderHook(() =>
        hooks.useCosmosDelegationsQuerySelector(account, newTx)
      );

      expect(result.current.options.length).toBe(delegations.length);

      act(() => {
        result.current.setQuery("FRESHATOMS");
      });

      expect(result.current.options.length).toBe(1);
    });

    it("should return the first delegation as value", async () => {
      const { account, transaction, prepare } = setup();
      await prepare();

      invariant(
        account.cosmosResources,
        "cosmos: account and cosmos resources required"
      );
      const delegations = account.cosmosResources.delegations || [];
      const newTx = {
        ...transaction,
        mode: "delegate",
        validators: delegations.map(({ validatorAddress, amount }) => ({
          address: validatorAddress,
          amount,
        })),
      };
      const { result } = renderHook(() =>
        hooks.useCosmosDelegationsQuerySelector(account, newTx)
      );

      expect(result.current.value.validator.validatorAddress).toBe(
        delegations[0].validatorAddress
      );
    });

    it("should find delegation by cosmosSourceValidator field and return as value for redelegate", async () => {
      const { account, transaction, prepare } = setup();
      await prepare();

      invariant(
        account.cosmosResources,
        "cosmos: account and cosmos resources required"
      );
      const delegations = account.cosmosResources.delegations || [];
      const cosmosSourceValidator =
        delegations[delegations.length - 1].validatorAddress;
      const newTx = {
        ...transaction,
        mode: "redelegate",
        validators: delegations.map(({ validatorAddress, amount }) => ({
          address: validatorAddress,
          amount,
        })),
        cosmosSourceValidator,
      };
      const { result } = renderHook(() =>
        hooks.useCosmosDelegationsQuerySelector(account, newTx)
      );

      expect(result.current.value.validator.validatorAddress).toBe(
        cosmosSourceValidator
      );
    });
  });

  describe("useSortedValidators", () => {
    it("should reutrn sorted validators", async () => {
      const { account, prepare } = setup();
      await prepare();

      const { result: preloadDataResult } = renderHook(() =>
        hooks.useCosmosPreloadData()
      );

      const { validators } = preloadDataResult.current;
      const delegations = (account.cosmosResources?.delegations || []).map(
        ({ validatorAddress, amount }) => ({
          address: validatorAddress,
          amount,
        })
      );
      const { result } = renderHook(() =>
        hooks.useSortedValidators("", validators, delegations)
      );

      expect(result.current.length).toBe(validators.length);

      const { result: searchResult } = renderHook(() =>
        hooks.useSortedValidators("Nodeasy.com", validators, delegations)
      );
      expect(searchResult.current.length).toBe(1);
    });
  });
});

function setup(): {
  account: Account,
  currencyBridge: CurrencyBridge,
  transaction: Transaction,
  prepare: () => Promise<*>,
} {
  setEnv("MOCK", 1);
  setEnv("EXPERIMENTAL_CURRENCIES", "cosmos");
  const seed = "cosmos-1";
  const currency = getCryptoCurrencyById("cosmos");
  const a = genAccount(seed, { currency });
  const account = genAddingOperationsInAccount(a, 3, seed);
  const currencyBridge = getCurrencyBridge(currency);
  const bridge = getAccountBridge(account);
  const transaction = bridge.createTransaction(account);

  return {
    account,
    currencyBridge,
    transaction,
    prepare: async () => cache.prepareCurrency(currency),
  };
}
