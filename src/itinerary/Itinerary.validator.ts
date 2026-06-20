import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { StructuralValidationUtilities } from "../utils/StructualValidationUtilities.js";

export class ItineraryValidator {
  static validateCreateRequest(
    body: Record<string, unknown>,
    event?: IRequestLogEvent,
  ): {
    idempotencyKey?: string; sessionTitle: string; destination?: string;
    destinationRaw?: any[]; country?: string; numberOfPax?: number;
    itineraryDateRaw?: any[]; startDate?: string; endDate?: string;
    unknownDate?: boolean; durationInDays?: number; challenge?: string;
    agendaItems: any[]; paxNames: any[]; bookings: any[]; packingItems: any[];
  } {
    const {
      idempotencyKey, sessionTitle, destination, destinationRaw, country,
      numberOfPax, itineraryDateRaw, startDate, endDate, unknownDate,
      durationInDays, challenge, agendaItems = [], paxNames = [], bookings = [],
      packingItems = [],
    } = body as any;
    StructuralValidationUtilities.required(sessionTitle, "sessionTitle", event);
    StructuralValidationUtilities.string(sessionTitle, "sessionTitle", event);
    return {
      idempotencyKey, sessionTitle, destination, destinationRaw, country,
      numberOfPax, itineraryDateRaw, startDate, endDate, unknownDate,
      durationInDays, challenge, agendaItems, paxNames, bookings, packingItems,
    };
  }

  static validateEditRequest(
    body: Record<string, unknown>,
    event?: IRequestLogEvent,
  ): {
    sessionTitle?: string; destination?: string; destinationRaw?: any[];
    country?: string; numberOfPax?: number; itineraryDateRaw?: any[];
    startDate?: string; endDate?: string; unknownDate?: boolean;
    durationInDays?: number; challenge?: string; agendaItems: any[];
    _agendaIdsToDelete: any[]; _agendaIdsToUpdate: any[]; paxNames?: any[];
    bookings: any[]; _bookingIdsToDelete: any[];
    packingItems: any[]; _packingIdsToDelete: any[];
  } {
    const {
      sessionTitle, destination, destinationRaw, country, numberOfPax,
      itineraryDateRaw, startDate, endDate, unknownDate, durationInDays,
      challenge, agendaItems = [], _agendaIdsToDelete = [],
      _agendaIdsToUpdate = [], paxNames, bookings = [], _bookingIdsToDelete = [],
      packingItems = [], _packingIdsToDelete = [],
    } = body as any;
    return {
      sessionTitle, destination, destinationRaw, country, numberOfPax,
      itineraryDateRaw, startDate, endDate, unknownDate, durationInDays,
      challenge, agendaItems, _agendaIdsToDelete, _agendaIdsToUpdate,
      paxNames, bookings, _bookingIdsToDelete, packingItems, _packingIdsToDelete,
    };
  }

  static validateChallengeRequest(
    body: Record<string, unknown>,
    event?: IRequestLogEvent,
  ): { shortCode: string; challenge: string } {
    const { shortCode, challenge } = body;
    StructuralValidationUtilities.required(shortCode, "shortCode", event);
    StructuralValidationUtilities.string(shortCode, "shortCode", event);
    StructuralValidationUtilities.required(challenge, "challenge", event);
    StructuralValidationUtilities.string(challenge, "challenge", event);
    return { shortCode: shortCode as string, challenge: challenge as string };
  }
}
