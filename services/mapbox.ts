export type AddressSuggestion = {
  id: string;
  name: string;
  placeFormatted: string;
};

export type ResolvedAddress = {
  formattedAddress: string;
  postcode?: string;
  latitude: number;
  longitude: number;
};

const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

if (!mapboxToken) {
  throw new Error('Missing EXPO_PUBLIC_MAPBOX_TOKEN');
}

const SEARCH_BASE_URL = 'https://api.mapbox.com/search/searchbox/v1';

export async function suggestAddresses(
  query: string,
  sessionToken: string
): Promise<AddressSuggestion[]> {
  const params = new URLSearchParams({
    q: query,
    access_token: mapboxToken!,
    session_token: sessionToken,
    country: 'us',
    types: 'address,postcode,place',
    limit: '6',
  });

  const response = await fetch(`${SEARCH_BASE_URL}/suggest?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Mapbox suggest failed with status ${response.status}`);
  }

  const body = await response.json();
  return (body.suggestions ?? []).map((suggestion: any) => ({
    id: suggestion.mapbox_id,
    name: suggestion.name,
    placeFormatted: suggestion.place_formatted ?? suggestion.full_address ?? suggestion.name,
  }));
}

export async function retrieveAddress(
  suggestionId: string,
  sessionToken: string
): Promise<ResolvedAddress | null> {
  const params = new URLSearchParams({
    access_token: mapboxToken!,
    session_token: sessionToken,
  });

  const response = await fetch(`${SEARCH_BASE_URL}/retrieve/${suggestionId}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Mapbox retrieve failed with status ${response.status}`);
  }

  const body = await response.json();
  const feature = body.features?.[0];
  if (!feature) return null;

  const [longitude, latitude] = feature.geometry.coordinates;
  const context = feature.properties.context ?? {};
  const postcode: string | undefined = context.postcode?.name;
  const city: string | undefined = context.place?.name;
  const state: string | undefined = context.region?.region_code;
  // Mapbox's full_address is verbose and inconsistent ("Arizona" spelled out,
  // trailing ", United States", "Northwest" instead of "NW") - two groomers
  // who each searched a full address would end up with differently-formatted
  // addresses on Browse. Compose a plain "street, City, ST ZIP" instead, to
  // match dashboard/lib/mapbox.ts's web equivalent.
  const street: string | undefined = feature.properties.name;
  const cityStateZip = [city, [state, postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const formattedAddress = [street, cityStateZip].filter(Boolean).join(', ') || feature.properties.full_address;
  return {
    formattedAddress,
    postcode,
    latitude,
    longitude,
  };
}
