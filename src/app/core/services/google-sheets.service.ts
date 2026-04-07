import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { StorageService } from './storage.service';

/**
 * Interface chuẩn dùng trong toàn ứng dụng
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
  isDeleted: boolean; // Trạng thái xóa mềm
  raw: any; // Giữ lại object gốc từ Google Sheet để phục vụ việc update

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
  currentSheet = signal('User_Default'); 
  cachedWords: WordModel[] = [];

  constructor(
    private http: HttpClient,
    private storage: StorageService
  ) { 
    this.loadSettings();
  }

  async loadSettings() {
    const settings = await this.storage.getSettings();
    if (settings.currentSheet) {
      this.currentSheet.set(settings.currentSheet);
    }
  }

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
      isDeleted: raw['Deleted'] === 'TRUE' || raw['Deleted'] === true,
      raw: raw
    };
  }

  /**
   * Lấy danh sách từ vựng. Mặc định lấy từ File Cache ở local.
   */
  async getWords(forceRefresh: boolean = false): Promise<WordModel[]> {
    const fileName = `cache_${this.currentSheet()}.json`;
    
    if (!forceRefresh) {
      const cached = await this.storage.readFile(fileName);
      if (cached) {
        this.cachedWords = cached;
        return cached;
      }
    }

    return await this.syncWithSheet();
  }

  /**
   * Đồng bộ từ Sheet về File Local
   */
  async syncWithSheet(): Promise<WordModel[]> {
    this.loading.set(true);
    const url = `${this.SCRIPT_URL}?sheet=${this.currentSheet()}`;
    
    try {
      let rawData: any[] = [];
      const electronAPI = (window as any).electronAPI;

      // Ưu tiên dùng cầu nối Electron để bypass CORS 100%
      if (electronAPI) {
        rawData = await electronAPI.httpGet(url);
      } else {
        const response = this.http.get<any[]>(url);
        rawData = await firstValueFrom(response);
      }
      
      const mapped = (rawData || []).map(item => this.mapRawToModel(item));
      
      // Lưu vào cache local và in-memory
      await this.storage.saveFile(`cache_${this.currentSheet()}.json`, mapped);
      this.cachedWords = mapped;
      
      return mapped;
    } catch (error) {
      console.error('Lỗi đồng bộ dữ liệu:', error);
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Lấy danh sách Users (Sheet có prefix là User)
   */
  async getUsers(): Promise<string[]> {
    const url = `${this.SCRIPT_URL}?action=getUsers`;
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI) {
        return await electronAPI.httpGet(url);
      } else {
        const response = this.http.get<string[]>(url);
        return await firstValueFrom(response);
      }
    } catch (error) {
      console.error('Lỗi lấy danh sách user:', error);
      return [];
    }
  }

  /**
   * Tạo người dùng mới (Tạo Sheet mới trên Google)
   */
  async createUser(userName: string): Promise<string> {
    this.loading.set(true);
    try {
      const payload = { action: 'createUser', userName: userName };
      const electronAPI = (window as any).electronAPI;

      if (electronAPI) {
        return await electronAPI.httpPost(this.SCRIPT_URL, payload);
      } else {
        const response = this.http.post(this.SCRIPT_URL, JSON.stringify(payload), { 
          responseType: 'text',
          headers: { 'Content-Type': 'text/plain' }
        });
        return await firstValueFrom(response);
      }
    } catch (error) {
      console.error('Lỗi tạo user:', error);
      throw error;
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
      const payload = {
        action: 'update',
        sheet: this.currentSheet(),
        row,
        data
      };

      const electronAPI = (window as any).electronAPI;
      let result: string;

      if (electronAPI) {
        result = await electronAPI.httpPost(this.SCRIPT_URL, payload);
      } else {
        const response = this.http.post(this.SCRIPT_URL, JSON.stringify(payload), { 
          responseType: 'text',
          headers: { 'Content-Type': 'text/plain' }
        });
        result = await firstValueFrom(response);
      }
      
      await this.syncWithSheet();
      return result;
    } catch (error) {
      console.error('Lỗi cập nhật:', error);
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Kiểm tra phiên bản Script trên Google (Dùng POST để vượt CORS Redirect)
   */
  async checkVersion(): Promise<any> {
    const payload = { action: 'getVersion' };
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI) {
        const result = await electronAPI.httpPost(this.SCRIPT_URL, payload);
        return JSON.parse(result);
      } else {
        const response = this.http.post(this.SCRIPT_URL, JSON.stringify(payload), { 
          responseType: 'text',
          headers: { 'Content-Type': 'text/plain' }
        });
        const result = await firstValueFrom(response);
        return JSON.parse(result);
      }
    } catch (error) {
      console.error('Lỗi kiểm tra version:', error);
      throw error;
    }
  }

  /**
   * Xóa mềm từ vựng
   */
  async deleteWord(word: WordModel): Promise<void> {
    const dataToSave = [
      word.raw[' '] || '',
      word.raw['Thời gian học'] || '',
      word.wordE,
      word.raw['Phiên âm'] || '',
      word.meaning,
      word.raw['Note'] || '',
      word.raw['Số lần học'] || '',
      word.raw[''] || '',
      word.example,
      'TRUE' // Deleted mark
    ];
    await this.updateWord(word.row, dataToSave);
  }
}
