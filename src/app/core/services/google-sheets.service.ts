import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { StorageService } from './storage.service';

/**
 * Interface chuẩn dùng trong toàn ứng dụng
 */
export interface WordModel {
  row: number;
  id: string | number; // Cột STT cũ
  wordE: string;
  pronunciation: string;
  meaning: string;
  definition: string; // Cột Note cũ
  learnTime: string;
  learnCount: number;
  audioUrl: string; // Cột trống cũ
  example: string;
  isDeleted: boolean;

  // Hệ thống SRS
  easinessFactor: number;
  intervalDays: number;
  repetitionStreak: number;
  nextReviewDate: string;

  raw: any;
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
  private readonly SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxOloCBB_y_JYoWMe2drMPwgpxPhMY1xVJgQ6u1rknbkRgOO0jFU9K3Ue_5ItZ67kuZiQ/exec';

  loading = signal(false);
  currentSheet = signal('User_Default');
  cachedWords: WordModel[] = [];

  private initPromise: Promise<void>;

  constructor(
    private http: HttpClient,
    private storage: StorageService
  ) {
    this.initPromise = this.loadSettings();
  }

  /**
   * Đảm bảo Service đã load xong cài đặt (Sheet hiện tại)
   */
  async ensureInitialized() {
    return this.initPromise;
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
      // Hỗ trợ cả ID cũ và ID mới
      id: raw['id'] || raw['ID'] || raw['STT'] || '',
      wordE: raw['word'] || raw['Từ mới'] || '',
      pronunciation: raw['phonetic'] || raw['Phiên âm'] || '',
      meaning: raw['meaning'] || raw['Nghĩa'] || '',
      definition: raw['definition'] || raw['Định nghĩa'] || raw['Note'] || '',
      learnTime: raw['learn_time'] || raw['Thời gian học'] || '',
      learnCount: parseInt(raw['learn_count'] || raw['Số lần học']) || 0,
      audioUrl: raw['audio_url'] || raw['Audio URL'] || '',
      example: raw['example'] || raw['Ví dụ'] || raw['Ghi chú'] || raw['Example'] || '',
      isDeleted: raw['deleted'] === 'TRUE' || raw['deleted'] === true || raw['Deleted'] === 'TRUE' || raw['Đã xóa'] === 'TRUE',

      // SRS Data (Hỗ trợ tiếng Việt cho tiêu đề Sheet)
      easinessFactor: parseFloat(raw['easiness_factor'] || raw['Hệ số dễ (EF)']) || 2.5,
      intervalDays: parseInt(raw['interval_days'] || raw['Khoảng cách (Ngày)']) || 0,
      repetitionStreak: parseInt(raw['repetition_streak'] || raw['Chuỗi nhớ']) || 0,
      nextReviewDate: raw['next_review_date'] || raw['Ngày ôn tiếp theo'] || '',

      raw: raw
    };
  }

  /**
   * Lấy danh sách từ vựng. Mặc định lấy từ File Cache ở local.
   */
  async getWords(forceRefresh: boolean = false): Promise<WordModel[]> {
    // CHỜ LOAD XONG SETTINGS (Hết lỗi lệch sheet khi mới vào app)
    await this.ensureInitialized();
    
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
   * Thêm từ mới vào Sheet
   */
  async addWord(word: Partial<WordModel>): Promise<string> {
    this.loading.set(true);
    try {
      // 1. TÍNH ID MỚI (MAX + 1)
      const maxId = this.cachedWords.reduce((max, w) => {
        const id = parseInt(w.id as any) || 0;
        return id > max ? id : max;
      }, 0);
      const newId = maxId + 1;
      const today = new Date().toISOString().split('T')[0];

      const dataToSave = [
        newId,
        new Date().toLocaleString(),
        word.wordE || '',
        word.pronunciation || '',
        word.meaning || '',
        word.definition || '',
        0,
        word.audioUrl || '',
        word.example || '',
        'FALSE',
        2.5,
        0,
        0,
        today
      ];

      const newRowNumber = this.cachedWords.length + 2; // Dự đoán dòng tiếp theo trong Sheet

      // 2. CẬP NHẬT CACHE TỨC THÌ
      const newWord: WordModel = this.mapRawToModel({
        row: newRowNumber,
        id: newId,
        word: word.wordE,
        phonetic: word.pronunciation,
        meaning: word.meaning,
        definition: word.definition,
        learn_time: new Date().toLocaleString(),
        learn_count: 0,
        audio_url: word.audioUrl,
        example: word.example,
        deleted: 'FALSE',
        easiness_factor: 2.5,
        interval_days: 0,
        repetition_streak: 0,
        next_review_date: today
      });

      this.cachedWords = [...this.cachedWords, newWord];
      await this.saveLocalCache();

      // 3. GỬI LÊN SHEET (CHẠY NGẦM)
      const payload = {
        action: 'add',
        sheet: this.currentSheet(),
        data: dataToSave
      };

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
      console.error('Lỗi khi thêm từ mới:', error);
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Cập nhật từ vựng (Ghi đè dòng)
   */
  async updateWord(row: number, data: any[]): Promise<string> {
    this.loading.set(true);
    try {
      // 1. CẬP NHẬT CACHE TỚI MODEL CỤ THỂ
      const index = this.cachedWords.findIndex(w => w.row === row);
      if (index !== -1) {
        // Build lại object từ mảng data 14 cột
        const updatedWord = this.mapRawToModel({
          row: row,
          id: data[0],
          learn_time: data[1],
          word: data[2],
          phonetic: data[3],
          meaning: data[4],
          definition: data[5],
          learn_count: data[6],
          audio_url: data[7],
          example: data[8],
          deleted: data[9],
          easiness_factor: data[10],
          interval_days: data[11],
          repetition_streak: data[12],
          next_review_date: data[13]
        });
        this.cachedWords[index] = updatedWord;
        await this.saveLocalCache();
      }

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
    const index = this.cachedWords.findIndex(w => w.row === word.row);
    if (index !== -1) {
      this.cachedWords[index].isDeleted = true;
      await this.saveLocalCache();
    }

    const dataToSave = [
      word.id,
      word.learnTime,
      word.wordE,
      word.pronunciation,
      word.meaning,
      word.definition,
      word.learnCount,
      word.audioUrl,
      word.example,
      'TRUE', // deleted
      word.easinessFactor,
      word.intervalDays,
      word.repetitionStreak,
      word.nextReviewDate
    ];
    await this.updateWord(word.row, dataToSave);
  }

  /**
   * Tính toán dữ liệu ôn tập mới theo phương pháp SRS
   */
  processSRSReview(isCorrect: boolean, word: WordModel) {
    let ef = word.easinessFactor;
    let interval = word.intervalDays;
    let rep = word.repetitionStreak;

    if (isCorrect) {
      rep += 1;
      if (rep === 1) {
        interval = 1;
      } else if (rep === 2) {
        interval = 6;
      } else {
        interval = Math.round(interval * ef);
      }
    } else {
      rep = 0;
      interval = 1;
      ef = Math.max(1.3, ef - 0.8);
    }

    const today = new Date();
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + interval);

    return {
      easinessFactor: Number(ef.toFixed(2)),
      intervalDays: interval,
      repetitionStreak: rep,
      nextReviewDate: nextDate.toISOString().split('T')[0]
    };
  }

  /**
   * Cập nhật kết quả ôn tập lên Sheet
   */
  async updateSRSResult(word: WordModel, isCorrect: boolean): Promise<any> {
    const newData = this.processSRSReview(isCorrect, word);

    // Thứ tự 14 cột mới chuẩn xác
    const dataToSave = [
      word.id,
      word.learnTime || new Date().toLocaleString(),
      word.wordE,
      word.pronunciation,
      word.meaning,
      word.definition,
      word.learnCount + 1,
      word.audioUrl,
      word.example,
      word.isDeleted ? 'TRUE' : 'FALSE',
      newData.easinessFactor,
      newData.intervalDays,
      newData.repetitionStreak,
      newData.nextReviewDate
    ];

    // Cập nhật lại list words cục bộ trước khi gửi lên
    const index = this.cachedWords.findIndex(w => w.row === word.row);
    if (index !== -1) {
      this.cachedWords[index] = {
        ...this.cachedWords[index],
        learnCount: word.learnCount + 1,
        easinessFactor: newData.easinessFactor,
        intervalDays: newData.intervalDays,
        repetitionStreak: newData.repetitionStreak,
        nextReviewDate: newData.nextReviewDate
      };
      await this.saveLocalCache();
    }

    return await this.updateWord(word.row, dataToSave);
  }

  /**
   * Lưu cache local (Dùng sau khi thêm/sửa/xóa để tránh gọi sync)
   */
  private async saveLocalCache() {
    const fileName = `cache_${this.currentSheet()}.json`;
    await this.storage.saveFile(fileName, this.cachedWords);
  }
}
