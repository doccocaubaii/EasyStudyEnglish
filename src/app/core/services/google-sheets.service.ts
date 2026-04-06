import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/**
 * Interface chuẩn dùng trong toàn ứng dụng
 * Giúp tránh việc gọi word['Tiếng Việt'] rườm rà
 */
export interface WordModel {
  row: number;
  wordE: string;
  pronunciation: string;
  meaning: string;
  learnTime: string;
  learnCount: string;
  note: string;
  example: string;
  raw: any; // Giữ lại object gốc từ Google Sheet để phục vụ việc update

  // Enrichment fields (Dictionary API)
  dictionaryData?: {
    definition?: string;
    audioUrl?: string;
    partOfSpeech?: string;
    phonetic?: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class GoogleSheetsService {
  private readonly SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby1kSIqcdoAvxfcsErDUZpav7twPx2KR_yCVD7GuFSfqxs3kwO-0NzspfqKlL1GZWqWTg/exec';

  loading = signal(false);

  constructor(private http: HttpClient) { }

  /**
   * Mapping dữ liệu thô từ Sheet sang Interface sạch
   */
  private mapRawToModel(raw: any): WordModel {
    return {
      row: raw.row,
      wordE: raw['Từ mới'] || '',
      pronunciation: raw['Phiên âm'] || '',
      meaning: raw['Nghĩa'] || '',
      learnTime: raw['Thời gian học'] || '',
      learnCount: raw['Số lần học'] || '',
      note: raw['Note'] || '',
      example: raw['Ghi chú'] || '',
      raw: raw // Rất quan trọng để lưu lại các cột không chỉnh sửa
    };
  }

  /**
   * Lấy danh sách từ vựng và tự động mapping
   */
  async getWords(): Promise<WordModel[]> {
    this.loading.set(true);
    try {
      const response = this.http.get<any[]>(this.SCRIPT_URL);
      const rawData = await firstValueFrom(response);
      return (rawData || []).map(item => this.mapRawToModel(item));
    } catch (error) {
      console.error('Lỗi lấy dữ liệu:', error);
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Cập nhật từ vựng
   */
  async updateWord(row: number, data: any[]): Promise<string> {
    this.loading.set(true);
    try {
      const response = this.http.post(this.SCRIPT_URL, {
        action: 'update',
        row,
        data
      }, { responseType: 'text' });
      return await firstValueFrom(response);
    } catch (error) {
      console.error('Lỗi cập nhật:', error);
      throw error;
    } finally {
      this.loading.set(false);
    }
  }
}
