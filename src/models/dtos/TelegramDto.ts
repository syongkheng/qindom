export type MediaType = "photo" | "video" | "document" | "audio" | "voice" | "animation";

export interface MediaDto {
  id:        string;
  fileType:  MediaType;
  fileName:  string | null;
  fileSize:  number | null;
  createdAt: number;
  expiresAt: number | null;
}

export interface LinkTokenDto {
  token:            string;
  expiresInSeconds: number;
}

export interface MediaUrlDto {
  url:       string;
  fileType:  MediaType;
  fileName:  string | null;
  expiresAt: number;
}
