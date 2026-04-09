export type CarCategory = 'ECONOMY' | 'COMPACT' | 'MIDSIZE' | 'FULLSIZE' | 'SUV' | 'LUXURY' | 'VAN';

export interface HotelSearchInput {
  destination: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children?: number;
  starRating?: number;
  maxRatePerNight?: string;
  currency?: string;
}
export interface HotelOffer {
  hotelId: string;
  name: string;
  starRating: number;
  ratePerNight: string;
  currency: string;
  roomType: string;
  cancellationPolicy: string;
  source: string;
}
export interface HotelSearchOutput {
  hotels: HotelOffer[];
  currency: string;
  noAdaptersConfigured: boolean;
}
export interface HotelAdapter {
  name: string;
  searchHotels(input: HotelSearchInput): Promise<HotelOffer[]>;
}

export interface CarSearchInput {
  pickupLocation: string;
  dropoffLocation?: string;
  pickupDateTime: string;
  dropoffDateTime: string;
  driverAge?: number;
  carCategory?: CarCategory;
}
export interface CarOffer {
  carId: string;
  category: CarCategory;
  supplier: string;
  dailyRate: string;
  totalRate: string;
  currency: string;
  features: string[];
  source: string;
}
export interface CarSearchOutput {
  cars: CarOffer[];
  currency: string;
  noAdaptersConfigured: boolean;
}
export interface CarAdapter {
  name: string;
  searchCars(input: CarSearchInput): Promise<CarOffer[]>;
}

export type HotelCarOperation = 'searchHotels' | 'searchCars';
export interface HotelCarSearchInput {
  operation: HotelCarOperation;
  hotel?: HotelSearchInput;
  car?: CarSearchInput;
}
export interface HotelCarSearchOutput {
  hotelResults?: HotelSearchOutput;
  carResults?: CarSearchOutput;
}
