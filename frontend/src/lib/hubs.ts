/** Indian logistics hub network — coordinates, corridor distances, toll density. */

export interface Hub {
  city: string;
  state: string;
  lat: number;
  lng: number;
}

export const HUBS: Hub[] = [
  { city: "Mumbai", state: "Maharashtra", lat: 19.076, lng: 72.8777 },
  { city: "Pune", state: "Maharashtra", lat: 18.5204, lng: 73.8567 },
  { city: "Nashik", state: "Maharashtra", lat: 19.9975, lng: 73.7898 },
  { city: "Nagpur", state: "Maharashtra", lat: 21.1458, lng: 79.0882 },
  { city: "Delhi", state: "Delhi NCR", lat: 28.6139, lng: 77.209 },
  { city: "Gurugram", state: "Haryana", lat: 28.4595, lng: 77.0266 },
  { city: "Jaipur", state: "Rajasthan", lat: 26.9124, lng: 75.7873 },
  { city: "Ahmedabad", state: "Gujarat", lat: 23.0225, lng: 72.5714 },
  { city: "Surat", state: "Gujarat", lat: 21.1702, lng: 72.8311 },
  { city: "Ludhiana", state: "Punjab", lat: 30.901, lng: 75.8573 },
  { city: "Kolkata", state: "West Bengal", lat: 22.5726, lng: 88.3639 },
  { city: "Bhubaneswar", state: "Odisha", lat: 20.2961, lng: 85.8245 },
  { city: "Raipur", state: "Chhattisgarh", lat: 21.2514, lng: 81.6296 },
  { city: "Hyderabad", state: "Telangana", lat: 17.385, lng: 78.4867 },
  { city: "Vijayawada", state: "Andhra Pradesh", lat: 16.5062, lng: 80.648 },
  { city: "Bengaluru", state: "Karnataka", lat: 12.9716, lng: 77.5946 },
  { city: "Chennai", state: "Tamil Nadu", lat: 13.0827, lng: 80.2707 },
  { city: "Coimbatore", state: "Tamil Nadu", lat: 11.0168, lng: 76.9558 },
  { city: "Kochi", state: "Kerala", lat: 9.9312, lng: 76.2673 },
  { city: "Indore", state: "Madhya Pradesh", lat: 22.7196, lng: 75.8577 },
  { city: "Kanpur", state: "Uttar Pradesh", lat: 26.4499, lng: 80.3319 },
  { city: "Guwahati", state: "Assam", lat: 26.1445, lng: 91.7362 },
];

export function hub(city: string): Hub {
  const h = HUBS.find((x) => x.city.toLowerCase() === city.toLowerCase());
  if (!h) throw new Error(`Unknown hub: ${city}`);
  return h;
}

export function hasHub(city: string): boolean {
  return HUBS.some((x) => x.city.toLowerCase() === city.toLowerCase());
}

/** Great-circle distance in km. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 1.18); // 1.18 road factor
}

export interface CorridorDef {
  from: string;
  to: string;
  tollDensity: number; // 0..1
  congestion: number; // 0..1
  weatherRisk: number; // 0..1 seasonal
}

export const CORRIDORS: CorridorDef[] = [
  { from: "Mumbai", to: "Pune", tollDensity: 0.8, congestion: 0.65, weatherRisk: 0.55 },
  { from: "Mumbai", to: "Delhi", tollDensity: 0.75, congestion: 0.6, weatherRisk: 0.35 },
  { from: "Mumbai", to: "Bengaluru", tollDensity: 0.7, congestion: 0.55, weatherRisk: 0.3 },
  { from: "Delhi", to: "Kolkata", tollDensity: 0.65, congestion: 0.5, weatherRisk: 0.5 },
  { from: "Bengaluru", to: "Chennai", tollDensity: 0.7, congestion: 0.5, weatherRisk: 0.4 },
  { from: "Delhi", to: "Jaipur", tollDensity: 0.6, congestion: 0.45, weatherRisk: 0.25 },
  { from: "Hyderabad", to: "Bengaluru", tollDensity: 0.6, congestion: 0.4, weatherRisk: 0.3 },
  { from: "Kolkata", to: "Chennai", tollDensity: 0.5, congestion: 0.45, weatherRisk: 0.6 },
  { from: "Ahmedabad", to: "Mumbai", tollDensity: 0.65, congestion: 0.55, weatherRisk: 0.3 },
  { from: "Nagpur", to: "Hyderabad", tollDensity: 0.5, congestion: 0.35, weatherRisk: 0.35 },
  { from: "Delhi", to: "Ludhiana", tollDensity: 0.55, congestion: 0.5, weatherRisk: 0.45 },
  { from: "Coimbatore", to: "Kochi", tollDensity: 0.4, congestion: 0.35, weatherRisk: 0.5 },
  { from: "Kolkata", to: "Guwahati", tollDensity: 0.35, congestion: 0.3, weatherRisk: 0.65 },
  { from: "Mumbai", to: "Kolkata", tollDensity: 0.6, congestion: 0.5, weatherRisk: 0.45 },
  { from: "Chennai", to: "Kochi", tollDensity: 0.45, congestion: 0.35, weatherRisk: 0.5 },
];
