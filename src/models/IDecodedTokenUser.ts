export interface IDecodedTokenUser {
  id: number;
  username: string;
  system: string;
  roles: string[];
  lastLoggedInDt: number;
}
