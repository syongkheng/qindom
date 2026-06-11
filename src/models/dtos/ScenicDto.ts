export interface ScenicSpotDto {
  id: number;
  nameZh: string;
  nameEn: string;
  province: string;
  city: string;
  provinceEn: string;
  cityEn: string;
  sortOrder: number;
}

export interface ScenicCheckDto {
  scenicId: number;
  visited: boolean;
}
