import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Brand, BrandId } from "./types";
import { BRANDS, getBrand } from "./types";
import { useQuery } from "@tanstack/react-query";
import { getAvailableAgents } from "./marketing.functions";

interface BrandContextValue {
  brandId: BrandId;
  brand: Brand;
  brands: Brand[];
  setBrandId: (id: BrandId) => void;
  refreshAgents: () => Promise<void>;
  agentsLoading: boolean;
  agentsError: string | null;
}

const BrandContext = createContext<BrandContextValue | null>(null);

const STORAGE_KEY = "bcc:brandId";

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brandId, setBrandIdState] = useState<BrandId>("convini");
  const agents = useQuery({ queryKey: ["available-ghl-agents"], queryFn: () => getAvailableAgents(), staleTime: 60_000, retry: false });
  const brands = useMemo(() => {
    if (!agents.data) return BRANDS;
    const items = agents.data.map(agent => {
      const id = agent.brandId;
      const fixed = BRANDS.find(b => b.id === id);
      return fixed ? { ...fixed, tagline: agent.name } : {
        id, name: agent.name, shortName: "AI", tagline: agent.description,
        accentClass: "text-primary", dotClass: "bg-primary",
      };
    });
    return items.length ? items : BRANDS;
  }, [agents.data]);

  // Read stored brand after hydration to avoid SSR mismatch.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as BrandId | null;
      if (stored && (stored === "convini" || stored === "ustow" || /^[0-9a-f-]{36}$/i.test(stored))) {
        setBrandIdState(stored);
      }
    } catch {
      // ignore
    }
  }, []);

  const setBrandId = useCallback((id: BrandId) => {
    setBrandIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<BrandContextValue>(
    () => ({
      brandId,
      brand: brands.find(b => b.id === brandId) ?? getBrand(brandId),
      brands,
      setBrandId,
      refreshAgents: async () => { await agents.refetch(); },
      agentsLoading: agents.isFetching,
      agentsError: agents.error instanceof Error ? agents.error.message : null,
    }),
    [brandId, brands, setBrandId, agents.isFetching, agents.error, agents.refetch],
  );

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandContextValue {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand must be used within BrandProvider");
  return ctx;
}
