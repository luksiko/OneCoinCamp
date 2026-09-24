export async function sha256(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export async function computeOfferFingerprint(offer: {
  source: string;
  offer_id: string;
  vehicle_id?: string;
  origin: string;
  destination: string;
  pickup_date: string;
  return_date: string;
  price: number | string;
}): Promise<string> {
  const parts = [
    offer.source || '',
    offer.offer_id || '',
    offer.origin || '',
    offer.destination || '',
    offer.pickup_date || '',
    offer.return_date || '',
    String(offer.price != null ? offer.price : ''),
  ];
  return sha256(parts.join('|'));
}
