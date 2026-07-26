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
  return {
    formattedAddress: feature.properties.full_address ?? feature.properties.name,
    postcode: feature.properties.context?.postcode?.name,
    latitude,
    longitude,
  };
}
