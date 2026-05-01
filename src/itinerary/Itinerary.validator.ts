import { Request } from "express";
import { InvalidRequestException } from "../exceptions/InvalidRequestException";

export class ItineraryValidator {
  static validateCreateRequest(req: Request): {
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
    } = req.body;
    if (!sessionTitle) throw new InvalidRequestException("sessionTitle");
    return {
      idempotencyKey, sessionTitle, destination, destinationRaw, country,
      numberOfPax, itineraryDateRaw, startDate, endDate, unknownDate,
      durationInDays, challenge, agendaItems, paxNames, bookings, packingItems,
    };
  }

  static validateEditRequest(req: Request): {
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
    } = req.body;
    return {
      sessionTitle, destination, destinationRaw, country, numberOfPax,
      itineraryDateRaw, startDate, endDate, unknownDate, durationInDays,
      challenge, agendaItems, _agendaIdsToDelete, _agendaIdsToUpdate,
      paxNames, bookings, _bookingIdsToDelete, packingItems, _packingIdsToDelete,
    };
  }

  static validateChallengeRequest(req: Request): { shortCode: string; challenge: string } {
    const { shortCode, challenge } = req.body;
    if (!shortCode) throw new InvalidRequestException("shortCode");
    if (!challenge) throw new InvalidRequestException("challenge");
    return { shortCode, challenge };
  }
}
