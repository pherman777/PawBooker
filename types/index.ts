export type Pet = {
  id: string;
  ownerId: string;
  name: string;
  species: 'dog' | 'cat' | 'other';
  breed?: string;
  color?: string;
  weightLbs?: number;
  photoPath?: string;
  isMicrochipped?: boolean;
  microchipNumber?: string;
  vetName?: string;
  vetPhone?: string;
};

export type PetDocumentType = 'rabies_vaccination' | 'other';

export type PetDocument = {
  id: string;
  petId: string;
  label: string;
  storagePath: string;
  mimeType?: string;
  documentType: PetDocumentType;
  expiresAt?: string;
  createdAt: string;
};

export type GroomerService = {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
  description?: string;
};

export type DayHours = { open: string; close: string } | null;

export type GroomerHours = {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
};

export type Groomer = {
  id: string;
  name: string;
  avatarUrl?: string;
  bio?: string;
  address: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  rating: number;
  reviewCount: number;
  priceFromCents: number;
  services: GroomerService[];
  phone?: string;
  email?: string;
  hours?: GroomerHours;
};

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'declined';
export type PaymentStatus = 'unpaid' | 'paid' | 'failed';

export type Booking = {
  id: string;
  groomerId: string;
  petId: string;
  serviceId: string;
  status: BookingStatus;
  startsAt: string;
  customerEmail?: string;
  cancellationReason?: string;
  paymentStatus: PaymentStatus;
  invoiceTotalCents?: number;
  taxAmountCents?: number;
  groupId?: string;
};

// Ties several single-pet bookings into one multi-pet visit (all pets brought at
// once). discountType/Value snapshot the salon's multi-pet rule as applied.
export type BookingGroup = {
  id: string;
  groomerId: string;
  staffId?: string;
  arrivalAt: string;
  discountType?: 'percent' | 'flat';
  discountValue?: number;
};

export type BookingLineItem = {
  id: string;
  bookingId: string;
  description: string;
  amountCents: number;
};

export type SavedPaymentMethod = {
  id: string;
  cardBrand?: string;
  cardLast4?: string;
  walletType?: string;
  isDefault: boolean;
};

export type SalonReview = {
  id: string;
  bookingId: string;
  groomerId: string;
  customerId: string;
  rating: number;
  comment?: string;
  createdAt: string;
};

export type AppReview = {
  customerId: string;
  rating: number;
  comment?: string;
  createdAt: string;
};

export type GroomerNotificationType = 'booking_requested' | 'booking_cancelled' | 'booking_rescheduled';

export type GroomerNotification = {
  id: string;
  groomerId: string;
  bookingId: string;
  type: GroomerNotificationType;
  readAt?: string;
  createdAt: string;
  petName?: string;
  serviceName?: string;
  startsAt?: string;
};

export type GroomerSupply = {
  id: string;
  groomerId: string;
  name: string;
  unit: string;
  quantityOnHand: number;
  reorderThreshold: number;
  reorderQuantity?: number;
  createdAt: string;
};

export type CustomerReminderStatus = 'draft' | 'sent' | 'dismissed';

export type CustomerReminder = {
  id: string;
  groomerId: string;
  customerId: string;
  customerEmail: string;
  lastBookingAt: string;
  draftSubject: string;
  draftBody: string;
  status: CustomerReminderStatus;
  createdAt: string;
  sentAt?: string;
};

export type ChatThreadType = 'groomer' | 'app_support';
export type ChatSenderType = 'customer' | 'groomer' | 'bot';

export type ChatThread = {
  id: string;
  customerId: string;
  groomerId?: string;
  threadType: ChatThreadType;
  needsHuman: boolean;
  createdAt: string;
  groomerName?: string;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  senderType: ChatSenderType;
  senderId?: string;
  body: string;
  createdAt: string;
};
