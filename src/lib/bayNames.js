// Centralized bay display-name logic.
//
// Bays are stored with directional names ("East 1", "West 2", …) or, for some
// records, literal "Bay N" names. Platform-wide they are shown to customers and
// staff as "Bay 1"…"Bay 9" (plus "VIP 1"/"VIP 2"). This module is the single
// source of truth so the mapping isn't duplicated across ~14 components.
//
// Vadnais Heights uses a DIFFERENT set of labels for its standard bays (a
// per-location override, keyed on the "Bay N" base name). Burnsville and every
// other location keep the default "Bay N" labels untouched.

// Directional / literal name -> canonical "Bay N" base name.
const BASE_MAP = {
  "East 1": "Bay 1",
  "East 2": "Bay 2",
  "West 1": "Bay 3",
  "West 2": "Bay 4",
  "West 3": "Bay 5",
  "South 1": "Bay 6",
  "South 2": "Bay 7",
  "North 1": "Bay 8",
  "North 2": "Bay 9",
  "Bay 1": "Bay 1",
  "Bay 2": "Bay 2",
  "Bay 3": "Bay 3",
  "Bay 4": "Bay 4",
  "Bay 5": "Bay 5",
  "Bay 6": "Bay 6",
  "Bay 7": "Bay 7",
  "Bay 8": "Bay 8",
  "Bay 9": "Bay 9",
  "Bay 10": "Bay 10",
  "VIP 1": "VIP 1",
  "VIP 2": "VIP 2"
};

// Vadnais Heights ONLY. Keyed on the canonical "Bay N" base name. VIP bays are
// intentionally omitted so they pass through unchanged.
const VADNAIS_OVERRIDE = {
  "Bay 1": "North 1",
  "Bay 2": "North 2",
  "Bay 3": "East 1",
  "Bay 4": "East 2",
  "Bay 5": "South 1",
  "Bay 6": "South 2",
  "Bay 7": "West 3",
  "Bay 8": "West 2",
  "Bay 9": "West 1"
};

// Canonical "Bay N" name — location-agnostic. Use this for sorting and any
// logic that depends on the bay's number, NOT for display.
export const getBayBaseName = (name) => BASE_MAP[name] || name || "";

// Display name shown to users. Applies the Vadnais Heights relabeling; every
// other location keeps the default "Bay N" labels.
export const getBayDisplayName = (name, location) => {
  const base = getBayBaseName(name);
  if (location === "vadnais_heights") return VADNAIS_OVERRIDE[base] || base;
  return base;
};

export default getBayDisplayName;
