// Single source of truth for customer-facing business details used across the
// email + SMS templates. Update here and every message stays in sync.
export const BRAND = {
  name: 'Element Indoor Golf',
  phone: '651-330-1699',
  website: 'www.elementindoorgolf.com'
};

type LocationInfo = {
  label: string;
  address: string;
};

const LOCATIONS: Record<string, LocationInfo> = {
  vadnais_heights: {
    label: 'Vadnais Heights',
    address: '4255 White Bear Parkway, Suite 2100, Vadnais Heights, MN 55110'
  },
  burnsville: {
    label: 'Burnsville',
    address: '14314 Burnhaven Drive, Burnsville, MN 55306'
  }
};

export function locationInfo(location?: string): LocationInfo {
  if (location && LOCATIONS[location]) return LOCATIONS[location];
  // Sensible fallback so a message never ships a blank address.
  return { label: BRAND.name, address: '' };
}
