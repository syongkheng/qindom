import { Request } from "express";
import { InvalidRequestException } from "../exceptions/InvalidRequestException";

export class ItineraryValidator {
  static validateCreateRequest(req: Request): {
    idempotencyKey?: string; sessionTitle: string; destination?: string;
    destinationRaw?: any[]; country?: string; numberOfPax?: number;
    itineraryDateRaw?: any[]; startDate?: string; endDate?: string;
    unknownDate?: boolean; durationInDays?: number; challenge?: string;
    agendaItems: any[]; paxNames: any[]; bookings: any[];
  } {
    const {
      idempotencyKey, sessionTitle, destination, destinationRaw, country,
      numberOfPax, itineraryDateRaw, startDate, endDate, unknownDate,
      durationInDays, challenge, agendaItems = [], paxNames = [], bookings = [],
    } = req.body;
    if (!sessionTitle) throw new InvalidRequestException("sessionTitle");
    return {
      idempotencyKey, sessionTitle, destination, destinationRaw, country,
      numberOfPax, itineraryDateRaw, startDate, endDate, unknownDate,
      durationInDays, challenge, agendaItems, paxNames, bookings,
    };
  }

  static validateEditRequest(req: Request): {
    sessionTitle?: string; destination?: string; destinationRaw?: any[];
    country?: string; numberOfPax?: number; itineraryDateRaw?: any[];
    startDate?: string; endDate?: string; unknownDate?: boolean;
    durationInDays?: number; challenge?: string; agendaItems: any[];
    _agendaIdsToDelete: any[]; _agendaIdsToUpdate: any[]; paxNames?: any[];
    bookings: any[]; _bookingIdsToDelete: any[];
  } {
    const {
      sessionTitle, destination, destinationRaw, country, numberOfPax,
      itineraryDateRaw, startDate, endDate, unknownDate, durationInDays,
      challenge, agendaItems = [], _agendaIdsToDelete = [],
      _agendaIdsToUpdate = [], paxNames, bookings = [], _bookingIdsToDelete = [],
    } = req.body;
    return {
      sessionTitle, destination, destinationRaw, country, numberOfPax,
      itineraryDateRaw, startDate, endDate, unknownDate, durationInDays,
      challenge, agendaItems, _agendaIdsToDelete, _agendaIdsToUpdate,
      paxNames, bookings, _bookingIdsToDelete,
    };
  }

  static validateChallengeRequest(req: Request): { shortCode: string; challenge: string } {
    const { shortCode, challenge } = req.body;
    if (!shortCode) throw new InvalidRequestException("shortCode");
    if (!challenge) throw new InvalidRequestException("challenge");
    return { shortCode, challenge };
  }
}
