import { AI_PROVIDERS } from "../../providers.js";
import type { StateOption, ToastApi } from "./types.js";

export const typedProviders = AI_PROVIDERS as Array<{
  id: string;
  models: Array<{ id: string; name: string; tier?: string; note?: string; disabled?: boolean; comingSoon?: boolean }>;
}>;

export const getWindowToast = (): ToastApi | undefined => (window as Window & { toast?: ToastApi }).toast;

export const US_STATES: StateOption[] = [
  { code: "", label: "— Not in the US —" },
  { code: "AL", label: "Alabama" },
  { code: "AK", label: "Alaska (no state income tax)" },
  { code: "AZ", label: "Arizona" },
  { code: "AR", label: "Arkansas" },
  { code: "CA", label: "California" },
  { code: "CO", label: "Colorado" },
  { code: "CT", label: "Connecticut" },
  { code: "DE", label: "Delaware" },
  { code: "DC", label: "District of Columbia" },
  { code: "FL", label: "Florida (no state income tax)" },
  { code: "GA", label: "Georgia" },
  { code: "HI", label: "Hawaii" },
  { code: "ID", label: "Idaho" },
  { code: "IL", label: "Illinois" },
  { code: "IN", label: "Indiana" },
  { code: "IA", label: "Iowa" },
  { code: "KS", label: "Kansas" },
  { code: "KY", label: "Kentucky" },
  { code: "LA", label: "Louisiana" },
  { code: "ME", label: "Maine" },
  { code: "MD", label: "Maryland" },
  { code: "MA", label: "Massachusetts" },
  { code: "MI", label: "Michigan" },
  { code: "MN", label: "Minnesota" },
  { code: "MS", label: "Mississippi" },
  { code: "MO", label: "Missouri" },
  { code: "MT", label: "Montana" },
  { code: "NE", label: "Nebraska" },
  { code: "NV", label: "Nevada (no state income tax)" },
  { code: "NH", label: "New Hampshire (no state income tax)" },
  { code: "NJ", label: "New Jersey" },
  { code: "NM", label: "New Mexico" },
  { code: "NY", label: "New York" },
  { code: "NC", label: "North Carolina" },
  { code: "ND", label: "North Dakota" },
  { code: "OH", label: "Ohio" },
  { code: "OK", label: "Oklahoma" },
  { code: "OR", label: "Oregon" },
  { code: "PA", label: "Pennsylvania" },
  { code: "RI", label: "Rhode Island" },
  { code: "SC", label: "South Carolina" },
  { code: "SD", label: "South Dakota (no state income tax)" },
  { code: "TN", label: "Tennessee (no state income tax)" },
  { code: "TX", label: "Texas (no state income tax)" },
  { code: "UT", label: "Utah" },
  { code: "VT", label: "Vermont" },
  { code: "VA", label: "Virginia" },
  { code: "WA", label: "Washington (no state income tax)" },
  { code: "WV", label: "West Virginia" },
  { code: "WI", label: "Wisconsin" },
  { code: "WY", label: "Wyoming (no state income tax)" },
];
